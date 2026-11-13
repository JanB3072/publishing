use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{OnceLock, RwLock};

/// 各平台编辑器关键选择器。改这里（或运行时覆盖 selectors.toml）即可校准，无需重编译。
#[derive(Clone, serde::Deserialize)]
pub struct SelectorSet {
    pub url: String,
    pub title: String,
    pub body: String,
    pub cover_btn: String,
    pub cover_input: String,
    pub cover_confirm: String,
    pub tags: String,
    pub publish: String,
    pub captcha: String,
    pub schedule_toggle: String,
    pub schedule_time: String,
    pub schedule_confirm: String,
    /// 可选：账号资料页的昵称/领域选择器。留空则用内置通用启发式提取。
    #[serde(default)]
    pub profile_nickname: String,
    #[serde(default)]
    pub profile_niche: String,
}

static OVERRIDES: OnceLock<RwLock<HashMap<String, SelectorSet>>> = OnceLock::new();

fn defaults() -> HashMap<String, SelectorSet> {
    let mut m = HashMap::new();
    m.insert(
        "wechat".into(),
        SelectorSet {
            url: "https://mp.weixin.qq.com/".into(),
            title: "#title".into(),
            body: "iframe.editor".into(),
            cover_btn: "#coverBtn".into(),
            cover_input: "#coverInput".into(),
            cover_confirm: "#coverConfirm".into(),
            tags: "#tags".into(),
            publish: "#publishBtn".into(),
            captcha: "#captcha".into(),
            schedule_toggle: "#scheduleToggle".into(),
            schedule_time: "#scheduleTime".into(),
            schedule_confirm: "#scheduleConfirm".into(),
            profile_nickname: String::new(),
            profile_niche: String::new(),
        },
    );
    for (p, url) in [
        ("toutiao", "https://mp.toutiao.com/"),
        ("zhihu", "https://www.zhihu.com/"),
        ("xiaohongshu", "https://creator.xiaohongshu.com/"),
        ("baijiahao", "https://baijiahao.baidu.com/"),
        ("weibo", "https://weibo.com/"),
    ] {
        m.insert(
            p.into(),
            SelectorSet {
                url: url.into(),
                title: "#title".into(),
                body: "#editor".into(),
                cover_btn: "#coverBtn".into(),
                cover_input: "#coverInput".into(),
                cover_confirm: "#coverConfirm".into(),
                tags: "#tags".into(),
                publish: "#publishBtn".into(),
                captcha: "#captcha".into(),
                schedule_toggle: "#scheduleToggle".into(),
                schedule_time: "#scheduleTime".into(),
                schedule_confirm: "#scheduleConfirm".into(),
                profile_nickname: String::new(),
                profile_niche: String::new(),
            },
        );
    }
    m
}

/// 选择器文件候选位置（按优先级）：
/// 1. 环境变量 PUBLISHING_SELECTORS 显式指定
/// 2. 当前工作目录（tauri dev 一般是 src-tauri）
/// 3. src-tauri/selectors.toml（从仓库根目录启动时）
/// 4. 可执行文件同目录 / resources 子目录（打包分发时）
fn candidate_paths() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Ok(p) = std::env::var("PUBLISHING_SELECTORS") {
        v.push(PathBuf::from(p));
    }
    v.push(PathBuf::from("selectors.toml"));
    v.push(PathBuf::from("src-tauri/selectors.toml"));
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            v.push(dir.join("selectors.toml"));
            v.push(dir.join("resources/selectors.toml"));
        }
    }
    v
}

pub fn candidate_paths_display() -> Vec<String> {
    candidate_paths()
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect()
}

/// 返回 (平台 -> 选择器集合, 实际来源说明)
fn load_with_source() -> (HashMap<String, SelectorSet>, String) {
    let mut m = defaults();
    for p in candidate_paths() {
        if let Ok(s) = std::fs::read_to_string(&p) {
            if let Ok(parsed) = toml::from_str::<HashMap<String, SelectorSet>>(&s) {
                let n = parsed.len();
                for (k, v) in parsed {
                    m.insert(k, v);
                }
                return (m, format!("{}（覆盖 {} 个平台）", p.to_string_lossy(), n));
            }
        }
    }
    (m, "内置默认值（未找到可用的 selectors.toml）".into())
}

pub fn get(platform: &str) -> SelectorSet {
    let lock = OVERRIDES.get_or_init(|| RwLock::new(load_with_source().0));
    let m = lock.read().unwrap();
    // 未知平台回退到 wechat 配置，避免 panic
    m.get(platform)
        .cloned()
        .unwrap_or_else(|| m.get("wechat").cloned().unwrap())
}

/// 重新读取 selectors.toml：校准后点一下即可生效，无需重启应用
pub fn reload() -> Result<String, String> {
    let (m, source) = load_with_source();
    let count = m.len();
    let lock = OVERRIDES.get_or_init(|| RwLock::new(HashMap::new()));
    *lock.write().unwrap() = m;
    Ok(format!("已从 {} 加载，共 {} 个平台", source, count))
}
