use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub platform: String,
    pub nickname: String,
    pub niche: String,
    pub fp_json: String,
    pub cookie_path: String,
    pub schedule_policy: String,
    pub max_per_day: i32,
    pub health: String,
    #[serde(default)]
    pub dedup_mode: String,
}

impl Account {
    /// 从 fp_json 解析指纹（用于反检测注入）
    pub fn fingerprint(&self) -> anyhow::Result<crate::browser::anti_detect::Fingerprint> {
        Ok(serde_json::from_str(&self.fp_json)?)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Article {
    pub id: String,
    pub title: String,
    pub author: String,
    pub summary: String,
    pub body_markdown: String,
    pub category: String,
    pub cover_path: String,
    pub tags: String,
    pub created_at: i64,
}

/// 草稿：与前端 Draft 结构一一对应，字段保持 snake_case
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Draft {
    pub id: String,
    pub title: String,
    pub author: String,
    pub summary: String,
    pub body_markdown: String,
    pub category: String,
    pub tags: String,
    pub cover_id: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 图库素材：data_url 直接存 SQLite TEXT（本地文件，不上云）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageItem {
    pub id: String,
    pub name: String,
    pub data_url: String,
    pub width: i32,
    pub height: i32,
    pub size: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub article_id: String,
    pub account_id: String,
    pub mode: String,
    pub status: String,
    pub attempts: i32,
    pub next_run: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct License {
    pub key: String,
    pub status: String,
    pub expired_at: String,
    pub device_count: i32,
}
