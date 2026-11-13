use std::fs;

/// 导入 .md 文件为 Markdown 文本
pub fn import_markdown(path: &str) -> anyhow::Result<String> {
    Ok(fs::read_to_string(path)?)
}

// TODO: .docx 导入用 pandoc 或 docx 库解析为 Markdown
