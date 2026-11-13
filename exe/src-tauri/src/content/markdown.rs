/// 极简 Markdown → 公众号兼容 HTML。
/// 生产环境建议替换为 pulldown-cmark / comrak 以支持表格、代码块、图片等。
pub fn to_html(md: &str) -> String {
    let mut out = String::new();
    for line in md.lines() {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix("### ") {
            out.push_str(&format!("<h3>{}</h3>", escape(rest)));
        } else if let Some(rest) = t.strip_prefix("## ") {
            out.push_str(&format!("<h2>{}</h2>", escape(rest)));
        } else if let Some(rest) = t.strip_prefix("# ") {
            out.push_str(&format!("<h1>{}</h1>", escape(rest)));
        } else if let Some(rest) = t.strip_prefix("- ") {
            out.push_str(&format!("<li>{}</li>", escape(rest)));
        } else if t.is_empty() {
            out.push_str("<br/>");
        } else {
            out.push_str(&format!("<p>{}</p>", escape(t)));
        }
    }
    out
}

fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}
