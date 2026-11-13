use crate::adapters;
use crate::browser::cdp::CdpClient;
use crate::browser::chromium;
use crate::db::{Account, Article, Draft, ImageItem, Task};
use crate::scheduler::{parse_mode, rand01, now_secs, Mode};
use crate::AppState;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::process::Child;
use std::sync::{Mutex, OnceLock};
use tauri::State;

#[derive(Serialize)]
pub struct LicenseStatus {
    pub valid: bool,
    pub message: String,
}

/// 调用后端 /license/verify 校验 license（M0：仅校验，不传文章内容）
#[tauri::command]
pub async fn verify_license(key: String, backend: String) -> Result<LicenseStatus, String> {
    let url = format!("{}/license/verify", backend.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let resp = client
        .post(url)
        .json(&serde_json::json!({ "key": key }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(LicenseStatus {
        valid: body.get("valid").and_then(|v| v.as_bool()).unwrap_or(false),
        message: body
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

#[tauri::command]
pub async fn list_accounts(state: State<'_, AppState>) -> Result<Vec<Account>, String> {
    Ok(state.db.list_accounts())
}

#[tauri::command]
pub async fn add_account(
    state: State<'_, AppState>,
    platform: String,
    nickname: String,
    niche: String,
) -> Result<String, String> {
    let id = format!("acc_{}", now_secs());
    let acc = Account {
        id: id.clone(),
        platform,
        nickname,
        niche,
        fp_json: default_fp(),
        cookie_path: format!("./profiles/{}/cookies", id),
        schedule_policy: String::new(),
        max_per_day: 2,
        health: String::new(),
        dedup_mode: "content".into(),
    };
    state.db.insert_account(&acc);
    Ok(id)
}

// ---------- 账号接入：打开可见浏览器登录 → 回读平台资料 → 保存 ----------

#[derive(Serialize)]
pub struct LoginSessionInfo {
    pub session_id: String,
    pub platform: String,
    pub url: String,
    pub port: u16,
}

#[derive(Serialize)]
pub struct AccountProfile {
    pub nickname: String,
    pub niche: String,
    pub url: String,
    pub title: String,
    pub need_login: bool,
}

struct LoginSession {
    port: u16,
    platform: String,
    child: Child,
}

static LOGIN_SESSIONS: OnceLock<Mutex<HashMap<String, LoginSession>>> = OnceLock::new();

fn login_sessions() -> &'static Mutex<HashMap<String, LoginSession>> {
    LOGIN_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn close_login_session(id: &str) {
    if let Some(mut s) = login_sessions().lock().unwrap().remove(id) {
        let _ = s.child.kill();
    }
}

/// 资料提取：优先用 selectors.toml 中配置的 profile_* 选择器，
/// 其次按常见 class / data-testid 与页面文案兜底。领域抓不到时返回空串，由前端请用户填写。
const PROFILE_EXTRACT_JS: &str = r#"(() => {
  const cfg = window.__pubSels || { nick: [], niche: [] };
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const strip = (s) => clean(s)
    .replace(/^(欢迎|你好|Hi|Hello)[,，:：\s]*/i, '')
    .replace(/[,，。;；].*$/, '')
    .slice(0, 40);
  const read = (sel) => {
    try {
      const e = document.querySelector(sel);
      if (!e) return '';
      return strip(e.innerText || e.textContent || e.value || e.getAttribute('content') || '');
    } catch (_) { return ''; }
  };
  const pick = (list) => {
    for (const s of list) {
      const v = read(s);
      if (v && v.length >= 2 && v.length <= 40) return v;
    }
    return '';
  };
  const body = clean(document.body ? document.body.innerText : '').slice(0, 20000);
  const labeled = (re) => { const m = body.match(re); return m ? strip(m[1]) : ''; };
  return {
    nickname: pick(cfg.nick) || labeled(/(?:账号名称|账户名|账号名|昵称|创作者名称)[:：\s]{0,3}([^\s，,。;；:：]{2,30})/),
    niche: pick(cfg.niche) || labeled(/(?:领域|分类|赛道|所属行业|内容领域|创作领域)[:：\s]{0,3}([^\s，,。;；:：]{2,30})/),
    url: location.href,
    title: clean(document.title),
    need_login: /(login|signin|passport)/i.test(location.href) || /(扫码登录|账号登录|请登录)/.test(clean(document.title))
  };
})()"#;

/// 打开平台登录窗口。会话 id 同时作为账号 id 与 Cookie 目录名，保证登录后发布可复用登录态。
#[tauri::command]
pub async fn begin_account_login(platform: String) -> Result<LoginSessionInfo, String> {
    let sel = adapters::selectors::get(&platform);
    {
        let mut guard = login_sessions().lock().unwrap();
        let stale: Vec<String> = guard.keys().cloned().collect();
        for id in stale {
            if let Some(mut s) = guard.remove(&id) {
                let _ = s.child.kill();
            }
        }
    }
    let session_id = format!("acc_{}_{}", now_secs(), (rand01() * 10000.0) as u32);
    let profile_dir = format!("./profiles/{}", session_id);
    let port = chromium::free_port();
    let inst = chromium::spawn_visible_with_port(&profile_dir, &sel.url, port)
        .map_err(|e| format!("启动浏览器失败：{}", e))?;
    login_sessions().lock().unwrap().insert(
        session_id.clone(),
        LoginSession {
            port,
            platform: platform.clone(),
            child: inst.child,
        },
    );
    Ok(LoginSessionInfo {
        session_id,
        platform,
        url: sel.url,
        port,
    })
}

/// 读取当前页面上的账号昵称与领域；未登录时 need_login=true，前端提示继续登录。
#[tauri::command]
pub async fn fetch_account_profile(session_id: String) -> Result<AccountProfile, String> {
    let (port, platform) = {
        let guard = login_sessions().lock().unwrap();
        let s = guard
            .get(&session_id)
            .ok_or_else(|| "登录会话已结束，请重新打开浏览器".to_string())?;
        (s.port, s.platform.clone())
    };
    let sel = adapters::selectors::get(&platform);
    let mut nick_sels: Vec<String> = vec![
        r#"[class*="nickname" i]"#.into(),
        r#"[class*="user-name" i]"#.into(),
        r#"[class*="username" i]"#.into(),
        r#"[class*="account-name" i]"#.into(),
        r#"[class*="creator-name" i]"#.into(),
        r#"[class*="author-name" i]"#.into(),
        r#"[data-testid*="nickname" i]"#.into(),
        r#"meta[property="og:title"]"#.into(),
        r#"h1"#.into(),
    ];
    if !sel.profile_nickname.trim().is_empty() {
        nick_sels.insert(0, sel.profile_nickname.clone());
    }
    let mut niche_sels: Vec<String> = vec![
        r#"[class*="niche" i]"#.into(),
        r#"[class*="category" i]"#.into(),
        r#"[class*="field-name" i]"#.into(),
        r#"[class*="vertical" i]"#.into(),
        r#"[class*="industry" i]"#.into(),
        r#"[data-testid*="category" i]"#.into(),
    ];
    if !sel.profile_niche.trim().is_empty() {
        niche_sels.insert(0, sel.profile_niche.clone());
    }
    let setup = format!(
        "window.__pubSels = {{ nick: {}, niche: {} }}; true",
        serde_json::to_string(&nick_sels).unwrap_or_else(|_| "[]".into()),
        serde_json::to_string(&niche_sels).unwrap_or_else(|_| "[]".into()),
    );

    let mut cdp = CdpClient::connect_page(port)
        .await
        .map_err(|e| format!("读取页面失败（浏览器可能还没打开）：{}", e))?;
    if let Err(e) = cdp.eval(&setup).await {
        let _ = cdp.close().await;
        return Err(e.to_string());
    }
    let value = match cdp.eval(PROFILE_EXTRACT_JS).await {
        Ok(v) => v,
        Err(e) => {
            let _ = cdp.close().await;
            return Err(e.to_string());
        }
    };
    let _ = cdp.close().await;
    let field = |k: &str| {
        value
            .get(k)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };
    Ok(AccountProfile {
        nickname: field("nickname"),
        niche: field("niche"),
        url: field("url"),
        title: field("title"),
        need_login: value
            .get("need_login")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
    })
}

/// 保存账号：昵称取自平台（只读），领域可来自平台或用户手填，同时关闭登录窗口。
#[tauri::command]
pub async fn finish_account_login(
    state: State<'_, AppState>,
    session_id: String,
    nickname: String,
    niche: String,
) -> Result<String, String> {
    let platform = {
        let guard = login_sessions().lock().unwrap();
        guard
            .get(&session_id)
            .map(|s| s.platform.clone())
            .ok_or_else(|| "登录会话已结束，请重新打开浏览器".to_string())?
    };
    let nickname = nickname.trim().to_string();
    if nickname.is_empty() {
        return Err("未能读取账号名称，请完成登录后重新读取".to_string());
    }
    let acc = Account {
        id: session_id.clone(),
        platform,
        nickname,
        niche: niche.trim().to_string(),
        fp_json: default_fp(),
        cookie_path: format!("./profiles/{}/cookies", session_id),
        schedule_policy: String::new(),
        max_per_day: 2,
        health: String::new(),
        dedup_mode: "content".into(),
    };
    state.db.insert_account(&acc);
    close_login_session(&session_id);
    Ok(session_id)
}

#[tauri::command]
pub async fn cancel_account_login(session_id: String) -> Result<(), String> {
    close_login_session(&session_id);
    Ok(())
}

/// 发布一篇文章到一个账号（即时单次，不经调度队列）
#[tauri::command]
pub async fn publish_article(
    state: State<'_, AppState>,
    article_id: String,
    account_id: String,
) -> Result<String, String> {
    let article = state
        .db
        .get_article(&article_id)
        .ok_or_else(|| "article not found".to_string())?;
    let account = state
        .db
        .list_accounts()
        .into_iter()
        .find(|a| a.id == account_id)
        .ok_or_else(|| "account not found".to_string())?;
    crate::scheduler::publish(&article, &account, None)
        .await
        .map_err(|e| e.to_string())
}

/// 入队一个发布任务（mode 为 JSON：immediate / fixed / interval）
#[tauri::command]
pub async fn enqueue_task(
    state: State<'_, AppState>,
    article_id: String,
    account_id: String,
    mode: String,
) -> Result<String, String> {
    let now = now_secs();
    let next_run = match parse_mode(&mode) {
        Mode::Immediate => 0,
        Mode::Fixed(at) => at,
        Mode::Interval { every, .. } => now + every,
    };
    let id = format!("t{}_{}", now, (rand01() * 1e6) as u32);
    let task = Task {
        id: id.clone(),
        article_id,
        account_id,
        mode,
        status: "pending".to_string(),
        attempts: 0,
        next_run: next_run.to_string(),
        created_at: now,
    };
    state.scheduler.enqueue(&task);
    Ok(id)
}

#[tauri::command]
pub async fn list_tasks(state: State<'_, AppState>) -> Result<Vec<Task>, String> {
    Ok(state.scheduler.list_tasks())
}

#[tauri::command]
pub async fn start_scheduler(state: State<'_, AppState>) -> Result<(), String> {
    state.scheduler.start();
    Ok(())
}

#[tauri::command]
pub async fn stop_scheduler(state: State<'_, AppState>) -> Result<(), String> {
    state.scheduler.stop();
    Ok(())
}

/// 人工处理完验证码/校准后，恢复任务立即重试
#[tauri::command]
pub async fn resume_task(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    state.scheduler.reset_task(&task_id);
    Ok(())
}

/// 打开该账号的【可见】浏览器窗口（同 user-data-dir），供人工扫码/解验证码
#[tauri::command]
pub async fn open_account_browser(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<(), String> {
    let acc = state
        .db
        .list_accounts()
        .into_iter()
        .find(|a| a.id == account_id)
        .ok_or_else(|| "account not found".to_string())?;
    let profile = Path::new(&acc.cookie_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| format!("./profiles/{}", account_id));
    let url = crate::adapters::selectors::get(&acc.platform).url;
    crate::browser::chromium::open_visible(&profile, &url).map_err(|e| e.to_string())
}

/// 设置账号去重策略：content（默认，SimHash 近似）/ article（按文章 id）/ off（关闭，允许同文定时重发）
#[tauri::command]
pub async fn set_dedup_mode(
    state: State<'_, AppState>,
    account_id: String,
    mode: String,
) -> Result<(), String> {
    let mut a = state.db.get_account(&account_id).ok_or("账号不存在")?;
    a.dedup_mode = mode;
    state.db.insert_account(&a);
    Ok(())
}

// ---------- 内容库：文章 / 草稿 / 图库（全部落本地 SQLite） ----------

#[tauri::command]
pub async fn list_articles(state: State<'_, AppState>) -> Result<Vec<Article>, String> {
    Ok(state.db.list_articles())
}

#[tauri::command]
pub async fn upsert_article(
    state: State<'_, AppState>,
    article: Article,
) -> Result<String, String> {
    let id = article.id.clone();
    state.db.insert_article(&article);
    Ok(id)
}

#[tauri::command]
pub async fn delete_article(
    state: State<'_, AppState>,
    article_id: String,
) -> Result<(), String> {
    state.db.delete_article(&article_id);
    Ok(())
}

#[tauri::command]
pub async fn list_drafts(state: State<'_, AppState>) -> Result<Vec<Draft>, String> {
    Ok(state.db.list_drafts())
}

/// 保存草稿；status=ready 时会自动同步进 articles 表，发布链路即可直接使用该 id
#[tauri::command]
pub async fn upsert_draft(state: State<'_, AppState>, draft: Draft) -> Result<(), String> {
    state.db.upsert_draft(&draft);
    Ok(())
}

#[tauri::command]
pub async fn delete_draft(state: State<'_, AppState>, draft_id: String) -> Result<(), String> {
    state.db.delete_draft(&draft_id);
    Ok(())
}

#[tauri::command]
pub async fn list_images(state: State<'_, AppState>) -> Result<Vec<ImageItem>, String> {
    Ok(state.db.list_images())
}

#[tauri::command]
pub async fn upsert_image(state: State<'_, AppState>, image: ImageItem) -> Result<(), String> {
    state.db.upsert_image(&image);
    Ok(())
}

#[tauri::command]
pub async fn delete_image(state: State<'_, AppState>, image_id: String) -> Result<(), String> {
    state.db.delete_image(&image_id);
    Ok(())
}

/// 校准 selectors.toml 后点一下即可生效，无需重启应用
#[tauri::command]
pub async fn reload_selectors() -> Result<String, String> {
    crate::adapters::selectors::reload()
}

/// 返回选择器文件的候选路径，方便定位应该改哪个文件
#[tauri::command]
pub async fn selector_paths() -> Result<Vec<String>, String> {
    Ok(crate::adapters::selectors::candidate_paths_display())
}

/// 占位指纹：生产应每账号生成一组固定且合理的 UA/时区/分辨率
fn default_fp() -> String {
    serde_json::json!({
        "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "lang": "zh-CN,zh;q=0.9",
        "tz": "Asia/Shanghai",
        "platform": "Win32",
        "w": 1366,
        "h": 768
    })
    .to_string()
}

/// 打开（或复用）一个可见的 DeepSeek 浏览器窗口，供用户登录一次。
/// 之后 `generate_ai_article` 复用同一窗口与登录态。不调用任何 DeepSeek 接口。
#[derive(Serialize)]
pub struct DeepSeekInfo {
    pub port: u16,
    pub url: String,
}

#[tauri::command]
pub async fn open_deepseek() -> Result<DeepSeekInfo, String> {
    let port = crate::content::ai_gen::ensure_session()
        .await
        .map_err(|e| e.to_string())?;
    Ok(DeepSeekInfo {
        port,
        url: "https://chat.deepseek.com/".to_string(),
    })
}

/// 用浏览器驱动 DeepSeek 网页版生成文章（不调 API）。
/// 参数含文章信息（标题/作者/分类/摘要/标签）+ 额外要求 + 是否用 R1。
/// 返回 Markdown 文本；未登录时返回友好提示，引导用户先点「登录 DeepSeek」。
#[tauri::command]
pub async fn generate_ai_article(
    params: crate::content::ai_gen::AiGenParams,
) -> Result<String, String> {
    crate::content::ai_gen::generate(&params)
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("DEEPSEEK_NOT_LOGIN") {
                "请先在打开的 DeepSeek 浏览器窗口中登录，再点「生成」。".to_string()
            } else if msg.contains("DEEPSEEK_NO_INPUT") {
                "未在页面找到输入框：请确认弹出的 DeepSeek 浏览器停在「对话页」且已登录，页面仍在加载时可稍等几秒重试。".to_string()
            } else if msg.contains("DEEPSEEK_NO_FILE_INPUT") {
                "未在页面找到上传入口：DeepSeek 网页版可能已改版，请在浏览器里手动点附件上传文件后重试。".to_string()
            } else {
                msg
            }
        })
}

/// 端到端自测：无头启动 Chromium → 加载 exe/mock/editor.html → 跑完整 Adapter 流程
/// （自检/封面上传/标题/正文/标签/提交），并用 #status 校验是否真正"发布成功"。
/// 用于本地/CI 验证 CDP 管线，不依赖任何真实平台。
#[tauri::command]
pub async fn self_test(state: State<'_, AppState>) -> Result<String, String> {
    let _ = &state; // 仅借用，确保命令注册时依赖一致
    let base = std::env::current_dir().unwrap_or_default();
    let p = base.join("../mock/editor.html");
    let url = format!("file:///{}", p.to_string_lossy().replace('\\', "/"));

    let cover = std::env::temp_dir().join("selftest_cover.txt");
    let _ = std::fs::write(&cover, b"mock-cover");

    let account = Account {
        id: "selftest".into(),
        platform: "toutiao".into(),
        nickname: String::new(),
        niche: String::new(),
        fp_json: String::new(),
        cookie_path: "./profiles/selftest/cookies".into(),
        schedule_policy: String::new(),
        max_per_day: 1,
        health: String::new(),
        dedup_mode: String::new(),
    };

    let mut inst = chromium::spawn_instance_headless(&account).map_err(|e| e.to_string())?;
    let mut cdp = match CdpClient::connect(inst.port).await {
        Ok(c) => c,
        Err(e) => {
            let _ = inst.child.kill();
            return Err(e.to_string());
        }
    };

    if let Err(e) = cdp.navigate(&url).await {
        let _ = inst.child.kill();
        return Err(e.to_string());
    }
    tokio::time::sleep(std::time::Duration::from_millis(800)).await;

    let adapter = adapters::get("toutiao");
    let missing = adapter.self_check(&mut cdp).await;
    if !missing.is_empty() {
        let _ = inst.child.kill();
        return Err(format!("self_check 缺失选择器: {:?}", missing));
    }

    let cover_path = cover.to_str().unwrap_or("");
    if let Err(e) = adapter.upload_cover(&mut cdp, cover_path).await {
        let _ = inst.child.kill();
        return Err(e.to_string());
    }
    if let Err(e) = adapter.fill_title(&mut cdp, "自测标题").await {
        let _ = inst.child.kill();
        return Err(e.to_string());
    }
    if let Err(e) = adapter.fill_body(&mut cdp, "<p>自测正文</p>").await {
        let _ = inst.child.kill();
        return Err(e.to_string());
    }
    if let Err(e) = adapter.fill_tags(&mut cdp, &["标签A".into()]).await {
        let _ = inst.child.kill();
        return Err(e.to_string());
    }
    let submit = match adapter.submit(&mut cdp).await {
        Ok(s) => s,
        Err(e) => {
            let _ = inst.child.kill();
            return Err(e.to_string());
        }
    };
    let status = cdp
        .eval("document.getElementById('status') ? document.getElementById('status').textContent : ''")
        .await
        .map_err(|e| e.to_string())?;
    let published = status.as_str().map(|s| s == "published").unwrap_or(false);

    let _ = cdp.close().await;
    let _ = inst.child.kill();
    Ok(format!(
        "self_test: submit={} status={:?} published={}",
        submit, status, published
    ))
}
