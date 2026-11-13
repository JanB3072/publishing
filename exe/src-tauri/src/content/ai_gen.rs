use crate::browser::cdp::CdpClient;
use crate::browser::chromium;
use anyhow::{anyhow, Result};
use serde_json::Value;
use std::process::Child;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

/// AI 生成模块：通过**真实浏览器（CDP）操作 DeepSeek 网页版**来生成文章，
/// 不调用任何 DeepSeek OpenAPI。这与本项目「不调平台接口」的底层约束一致：
/// 用模拟真人操作网页的方式完成「输入提示词 → 等待生成 → 回读正文」。
///
/// 设计要点：
/// - 浏览器登录态持久化在独立 profile `./profiles/deepseek`，首次需人工登录一次；
/// - 全局保活一个可见浏览器实例，多次生成复用同一窗口 / 同一登录态；
/// - 选择器集中在本文件常量，按真实 DOM 校准（与 adapters/selectors 同一思路）。

const DEEPSEEK_URL: &str = "https://chat.deepseek.com/";

/// 输入框候选选择器（DeepSeek 用 textarea；新版可能为 contenteditable，逐一带兜底）
const INPUT_SELECTORS: &[&str] = &[
    "textarea",
    "input[type='text']",
    "#chat-input",
    "[data-testid='chat-input']",
    "[class*='chat-input'] textarea",
    "[class*='chat-input'] [contenteditable='true']",
    "div[role='textbox']",
    "[contenteditable='true']",
];

/// 发送按钮候选选择器；命中即点击，全部未命中则回退到「回车发送」
const SEND_SELECTORS: &[&str] = &[
    "button[aria-label*='发送' i]",
    "button[aria-label*='send' i]",
    "#send-message-button",
    "button.send-button",
    "div[role='button'][aria-label*='send' i]",
];

/// DeepSeek-R1（深度思考）开关候选选择器；勾上后走推理模型
const R1_TOGGLE_SELECTORS: &[&str] = &[
    "[aria-label*='DeepThink' i]",
    "[aria-label*='R1' i]",
    "button[title*='深度思考' i]",
    "[data-testid*='deepthink' i]",
];

/// 生成中的「停止」按钮候选（用于判断是否仍在输出）
const STOP_SELECTORS: &[&str] = &[
    "button[aria-label*='停止' i]",
    "button[aria-label*='stop' i]",
    "div[role='button'][aria-label*='stop' i]",
];

/// 附件按钮候选（部分版本的 DeepSeek 把 file input 常驻 DOM，可直接用 input[type=file]）
const ATTACH_SELECTORS: &[&str] = &[
    "button[aria-label*='上传' i]",
    "button[aria-label*='attach' i]",
    "button[aria-label*='文件' i]",
    "[class*='attach' i]",
    "label[for]",
];

/// 附件就绪指示（DeepSeek 解析完文件后出现缩略图/文件名），仅用于等待的兜底判断
const ATTACH_READY_SELECTORS: &[&str] = &[
    "[class*='file' i]",
    "img[src*='blob:']",
    "[class*='attachment' i]",
    "[class*='upload' i]",
];

/// 生成参数：来自编辑器「文章信息」的字段 + 额外要求 + 是否用 R1 + 附件路径列表。
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGenParams {
    pub title: String,
    pub author: String,
    pub category: String,
    pub summary: String,
    pub tags: String,
    pub extra: String,
    pub use_r1: bool,
    pub files: Vec<String>,
}

/// 把文章信息拼成发给 DeepSeek 的提示词（仅含用户提供的字段，不附加额外指令）
fn build_prompt(p: &AiGenParams) -> String {
    let mut s = String::new();
    let title = p.title.trim();
    s.push_str(&format!(
        "【标题】{}\n",
        if title.is_empty() { "（未提供）" } else { title }
    ));
    if !p.author.trim().is_empty() {
        s.push_str(&format!("【作者】{}\n", p.author.trim()));
    }
    if !p.category.trim().is_empty() {
        s.push_str(&format!("【分类/领域】{}\n", p.category.trim()));
    }
    if !p.summary.trim().is_empty() {
        s.push_str(&format!("【内容方向/摘要】{}\n", p.summary.trim()));
    }
    if !p.tags.trim().is_empty() {
        s.push_str(&format!("【标签】{}\n", p.tags.trim()));
    }
    if !p.extra.trim().is_empty() {
        s.push_str(&format!("【额外要求】{}\n", p.extra.trim()));
    }
    s
}

struct DsSession {
    child: Child,
    port: u16,
}

static SESSION: OnceLock<Mutex<Option<DsSession>>> = OnceLock::new();

fn session_lock() -> &'static Mutex<Option<DsSession>> {
    SESSION.get_or_init(|| Mutex::new(None))
}

/// 确保存在一个已打开的 DeepSeek 浏览器实例（可见，用于登录 / 生成复用）。
/// 首次调用会启动浏览器并导航到 chat.deepseek.com，需用户在弹窗里登录一次。
pub async fn ensure_session() -> Result<u16> {
    {
        let g = session_lock().lock().unwrap();
        if let Some(s) = &*g {
            return Ok(s.port);
        }
    }
    let port = chromium::free_port();
    let profile = "./profiles/deepseek";
    let inst = chromium::spawn_visible_with_port(profile, DEEPSEEK_URL, port)
        .map_err(|e| anyhow!("启动 DeepSeek 浏览器失败：{}", e))?;
    *session_lock().lock().unwrap() = Some(DsSession { child: inst.child, port });
    // 等页面与调试端口就绪
    tokio::time::sleep(Duration::from_millis(1500)).await;
    Ok(port)
}

/// 关闭保活的 DeepSeek 浏览器（释放资源；下次生成会重新打开）
#[allow(dead_code)]
pub fn close_session() {
    if let Some(mut s) = session_lock().lock().unwrap().take() {
        let _ = s.child.kill();
    }
}

/// 依次尝试候选选择器，返回第一个在页面上存在的选择器字符串。
/// 用页面内 JS（`document.querySelector`）判定，避免依赖 CDP DOM 的 nodeId 解析。
async fn find_selector(cdp: &mut CdpClient, candidates: &[&str]) -> Option<String> {
    for sel in candidates {
        let expr = format!(
            "(function(){{ try {{ return !!document.querySelector({sel:?}); }} catch(e) {{ return false; }} }})()",
            sel = sel
        );
        if let Ok(Value::Bool(true)) = cdp.eval(&expr).await {
            return Some((*sel).to_string());
        }
    }
    None
}

/// 轮询等待输入框出现（登录后页面可能仍在渲染 / 跳转），最多 `secs` 秒。
async fn wait_for_input(cdp: &mut CdpClient, candidates: &[&str], secs: u64) -> Option<String> {
    for _ in 0..secs {
        if let Some(s) = find_selector(cdp, candidates).await {
            return Some(s);
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    None
}

/// 判定页面是否仍处于登录态（用于区分「未登录」与「输入框未找到 / 结构变化」）
async fn needs_login(cdp: &mut CdpClient) -> bool {
    let expr = r#"(function(){
        try {
            var b = document.body ? document.body.innerText : '';
            if (/登录|注册|sign in|log in|手机号|验证码/i.test(b)) return true;
            if (document.querySelector('input[type="password"]')) return true;
            return false;
        } catch (e) { return false; }
    })()"#;
    matches!(cdp.eval(expr).await, Ok(Value::Bool(true)))
}

/// 清空输入框：用原生 setter 把值置空并派发 input 事件，兼容 React 受控组件
async fn clear_input(cdp: &mut CdpClient, sel: &str) -> Result<()> {
    let expr = format!(
        r#"(function(){{ 
            var el = document.querySelector({sel:?}); 
            if (!el) return false; 
            el.focus(); 
            try {{ 
                if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {{ 
                    var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; 
                    setter.call(el, ''); 
                }} 
                el.textContent = ''; 
                el.dispatchEvent(new Event('input', {{ bubbles: true }})); 
            }} catch (e) {{}} 
            return true; 
        }})()"#,
        sel = sel
    );
    cdp.eval(&expr).await?;
    Ok(())
}

/// 切换 DeepSeek-R1：点中开关；找不到就当作默认模型，不影响正文生成
async fn toggle_r1(cdp: &mut CdpClient) {
    if let Some(sel) = find_selector(cdp, R1_TOGGLE_SELECTORS).await {
        let _ = cdp.click(&sel).await;
        tokio::time::sleep(Duration::from_millis(400)).await;
    }
}

/// 是否仍在生成（检测到「停止」按钮即视为输出中）
async fn is_generating(cdp: &mut CdpClient) -> bool {
    find_selector(cdp, STOP_SELECTORS).await.is_some()
}

/// 把本地文件附到 DeepSeek 对话（通过 CDP `DOM.setFileInputFiles`）。
/// 若页面没有常驻的 file input，先点附件按钮露出它。找不到则返回错误。
async fn attach_files(cdp: &mut CdpClient, files: &[String]) -> Result<()> {
    // 先直接找 file input（部分版本的 DeepSeek 把它常驻在 DOM 中，只是隐藏）
    let mut input_sel = find_selector(cdp, &["input[type='file']"]).await;
    if input_sel.is_none() {
        if let Some(btn) = find_selector(cdp, ATTACH_SELECTORS).await {
            let _ = cdp.click(&btn).await;
            tokio::time::sleep(Duration::from_millis(600)).await;
            input_sel = find_selector(cdp, &["input[type='file']"]).await;
        }
    }
    let input_sel = input_sel.ok_or_else(|| anyhow!("DEEPSEEK_NO_FILE_INPUT"))?;
    for f in files {
        cdp.upload_file(&input_sel, f).await?;
        tokio::time::sleep(Duration::from_millis(1000)).await;
    }
    Ok(())
}

/// 等待附件被 DeepSeek 解析就绪（出现附件指示元素），最多 `secs` 秒；超时也不报错，仅作保险。
async fn wait_for_attach(cdp: &mut CdpClient, secs: u64) -> bool {
    for _ in 0..secs {
        if find_selector(cdp, ATTACH_READY_SELECTORS).await.is_some() {
            return true;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    false
}

/// 从页面回读「最后一条助手消息」的 Markdown 文本。
/// 先把渲染后的 HTML 反推出 Markdown（标题/列表/代码/引用/加粗等常用结构）。
const EXTRACT_JS: &str = r#"((() => {
  function htmlToMd(root) {
    if (!root) return '';
    var BLOCK = /^(P|DIV|H1|H2|H3|H4|H5|H6|LI|UL|OL|BLOCKQUOTE|PRE|BR|TABLE|TR|TD|TH)$/;
    function walk(node, buf) {
      for (var i = 0; i < node.childNodes.length; i++) {
        var child = node.childNodes[i];
        if (child.nodeType === 3) { buf.push(child.textContent); continue; }
        if (child.nodeType !== 1) continue;
        var tag = child.tagName;
        if (tag === 'BR') { buf.push('\n'); continue; }
        if (tag === 'PRE') {
          var code = child.querySelector('code') || child;
          buf.push('\n```\n' + code.textContent + '\n```\n');
          continue;
        }
        var inner = []; walk(child, inner); var s = inner.join('');
        if (tag === 'H1') buf.push('\n# ' + s.trim() + '\n');
        else if (tag === 'H2') buf.push('\n## ' + s.trim() + '\n');
        else if (tag === 'H3') buf.push('\n### ' + s.trim() + '\n');
        else if (tag === 'H4') buf.push('\n#### ' + s.trim() + '\n');
        else if (tag === 'H5') buf.push('\n##### ' + s.trim() + '\n');
        else if (tag === 'H6') buf.push('\n###### ' + s.trim() + '\n');
        else if (tag === 'STRONG' || tag === 'B') buf.push('**' + s + '**');
        else if (tag === 'EM' || tag === 'I') buf.push('*' + s + '*');
        else if (tag === 'A') buf.push('[' + s + '](' + (child.getAttribute('href') || '') + ')');
        else if (tag === 'BLOCKQUOTE') buf.push('\n> ' + s.trim().replace(/\n/g, '\n> ') + '\n');
        else if (tag === 'LI') buf.push('\n- ' + s.trim());
        else if (tag === 'UL' || tag === 'OL') buf.push('\n' + s + '\n');
        else if (BLOCK.test(tag)) buf.push(s);
        else buf.push(s);
      }
    }
    var buf = []; walk(root, buf);
    return buf.join('').replace(/\n{3,}/g, '\n\n').trim();
  }
  var blocks = Array.prototype.slice.call(document.querySelectorAll('[class*="ds-markdown"]'));
  if (blocks.length) {
    var last = blocks[blocks.length - 1];
    // 同一段回复若被拆成多个 markdown 块，它们通常互为相邻兄弟节点，向前合并同一段回复的所有块
    var group = [last];
    var prev = last.previousElementSibling;
    while (prev && prev.matches && prev.matches('[class*="ds-markdown"]')) {
      group.unshift(prev);
      prev = prev.previousElementSibling;
    }
    var txt = group.map(function (b) { return htmlToMd(b); }).join('\n\n').trim();
    if (txt) return { found: true, text: txt };
  }
  // 兜底：按消息 id 取最后一条
  var byId = document.querySelectorAll('[data-message-id]');
  if (byId.length) return { found: true, text: htmlToMd(byId[byId.length - 1]) };
  return { found: false, text: '' };
})())"#;

async fn extract_last(cdp: &mut CdpClient) -> String {
    cdp.eval(EXTRACT_JS)
        .await
        .ok()
        .and_then(|v| v.get("text").and_then(|t| t.as_str()).map(String::from))
        .unwrap_or_default()
}

/// 等待 DeepSeek 输出完成：轮询最后一条消息文本，停止变化即视为完成。
async fn wait_for_reply(cdp: &mut CdpClient, timeout_secs: u64) -> Result<String> {
    let mut last = String::new();
    let mut stable = 0u32;
    let steps = (timeout_secs / 2).max(1);
    for _ in 0..steps {
        tokio::time::sleep(Duration::from_secs(2)).await;
        let cur = extract_last(cdp).await;
        // 文本连续两次轮询完全一致且不再流出，才视为完成（避免流式过程中的短暂停顿被误判）
        if !is_generating(cdp).await && !cur.is_empty() && cur == last {
            stable += 1;
            if stable >= 2 {
                return Ok(cur);
            }
        } else {
            stable = 0;
        }
        last = cur;
    }
    if last.is_empty() {
        anyhow::bail!("DeepSeek 未返回内容（可能未登录、被风控或页面结构变化，请在打开的浏览器中确认）");
    }
    Ok(last)
}

/// 主入口：在浏览器里用 DeepSeek 生成文章。
/// `params` 含文章信息（标题/作者/分类/摘要/标签）+ 额外要求 + 是否用 R1。
/// 返回 Markdown 文本。未登录时返回友好的中文错误，由前端引导用户先登录。
pub async fn generate(params: &AiGenParams) -> Result<String> {
    let prompt = build_prompt(params);
    let use_r1 = params.use_r1;
    let port = ensure_session().await?;
    let mut cdp = CdpClient::connect_page(port)
        .await
        .map_err(|e| anyhow!("连接 DeepSeek 浏览器失败：{}（请先点「登录 DeepSeek」）", e))?;

    // 若不在对话页，导航过去（保留已登录态）
    let url = cdp
        .eval("location.href")
        .await
        .ok()
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_default();
    if !url.starts_with("https://chat.deepseek.com") {
        cdp.navigate(DEEPSEEK_URL).await?;
        tokio::time::sleep(Duration::from_millis(1500)).await;
    }

    // 定位输入框；登录后页面可能仍在渲染，轮询等待最多 30s
    let input_sel = match wait_for_input(&mut cdp, INPUT_SELECTORS, 30).await {
        Some(s) => s,
        None => {
            let login = needs_login(&mut cdp).await;
            let _ = cdp.close().await;
            if login {
                anyhow::bail!("DEEPSEEK_NOT_LOGIN");
            } else {
                anyhow::bail!("DEEPSEEK_NO_INPUT");
            }
        }
    };

    if use_r1 {
        toggle_r1(&mut cdp).await;
    }

    // 上传附件（docx 等）：先附到 DeepSeek，再发提示词
    if !params.files.is_empty() {
        attach_files(&mut cdp, &params.files).await?;
        let _ = wait_for_attach(&mut cdp, 20).await;
    }

    clear_input(&mut cdp, &input_sel).await?;
    tokio::time::sleep(Duration::from_millis(200)).await;
    cdp.type_text(&input_sel, &prompt).await?;
    tokio::time::sleep(Duration::from_millis(300)).await;

    // 发送：优先点发送按钮，否则回车发送
    if let Some(sel) = find_selector(&mut cdp, SEND_SELECTORS).await {
        cdp.click(&sel).await?;
    } else {
        // 兜底：聚焦输入框后回车发送
        let _ = cdp.focus_selector(&input_sel).await;
        cdp.press_key("Enter").await?;
    }

    let text = wait_for_reply(&mut cdp, 240).await;
    let _ = cdp.close().await;
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selectors_are_non_empty() {
        assert!(!INPUT_SELECTORS.is_empty());
        assert!(!SEND_SELECTORS.is_empty());
    }
}
