mod models;
pub use models::*;

use rusqlite::{params, Connection};
use std::sync::Mutex;

pub struct Db {
    conn: Mutex<Connection>,
}

impl Db {
    pub fn open(path: &str) -> Self {
        let conn = Connection::open(path).expect("open db");
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS accounts(\
                id TEXT PRIMARY KEY, platform TEXT, nickname TEXT, niche TEXT, \
                fp_json TEXT, cookie_path TEXT, schedule_policy TEXT, max_per_day INT, health TEXT, dedup_mode TEXT);
             CREATE TABLE IF NOT EXISTS articles(\
                id TEXT PRIMARY KEY, title TEXT, author TEXT, summary TEXT, \
                body_markdown TEXT, category TEXT, cover_path TEXT, tags TEXT, created_at INT);
             CREATE TABLE IF NOT EXISTS tasks(\
                id TEXT PRIMARY KEY, article_id TEXT, account_id TEXT, mode TEXT, \
                status TEXT, attempts INT, next_run TEXT, created_at INT);
             CREATE TABLE IF NOT EXISTS licenses(\
                key TEXT PRIMARY KEY, status TEXT, expired_at TEXT, device_count INT);
             CREATE TABLE IF NOT EXISTS daily(\
                account_id TEXT, day TEXT, count INT, PRIMARY KEY(account_id, day));\
             CREATE TABLE IF NOT EXISTS posted(\
                account_id TEXT, article_id TEXT, simhash INT, created_at INT);
             CREATE TABLE IF NOT EXISTS drafts(\
                id TEXT PRIMARY KEY, title TEXT, author TEXT, summary TEXT, \
                body_markdown TEXT, category TEXT, tags TEXT, cover_id TEXT, \
                status TEXT, created_at INT, updated_at INT);
             CREATE TABLE IF NOT EXISTS images(\
                id TEXT PRIMARY KEY, name TEXT, data_url TEXT, \
                width INT, height INT, size INT, created_at INT);",
        )
        .expect("migrate");
        // 兼容旧库：补齐新增列（已存在则忽略错误）
        let _ = conn.execute("ALTER TABLE accounts ADD COLUMN dedup_mode TEXT", []);
        let _ = conn.execute("ALTER TABLE posted ADD COLUMN article_id TEXT", []);
        Db {
            conn: Mutex::new(conn),
        }
    }

    pub fn insert_account(&self, a: &Account) {
        self.conn
            .lock()
            .unwrap()
            .execute(
                "INSERT OR REPLACE INTO accounts\
                 (id,platform,nickname,niche,fp_json,cookie_path,schedule_policy,max_per_day,health,dedup_mode)\
                 VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                params![
                    a.id, a.platform, a.nickname, a.niche, a.fp_json, a.cookie_path,
                    a.schedule_policy, a.max_per_day, a.health, a.dedup_mode
                ],
            )
            .ok();
    }

    pub fn get_account(&self, id: &str) -> Option<Account> {
        let c = self.conn.lock().unwrap();
        let mut stmt = c
            .prepare(
                "SELECT id,platform,nickname,niche,fp_json,cookie_path,schedule_policy,max_per_day,health,dedup_mode \
                 FROM accounts WHERE id=?1",
            )
            .unwrap();
        stmt.query_row(params![id], |r| {
            Ok(Account {
                id: r.get(0)?,
                platform: r.get(1)?,
                nickname: r.get(2)?,
                niche: r.get(3)?,
                fp_json: r.get(4)?,
                cookie_path: r.get(5)?,
                schedule_policy: r.get(6)?,
                max_per_day: r.get(7)?,
                health: r.get(8)?,
                dedup_mode: r.get(9)?,
            })
        })
        .ok()
    }

    pub fn list_accounts(&self) -> Vec<Account> {
        let c = self.conn.lock().unwrap();
        let mut stmt = c
            .prepare(
                "SELECT id,platform,nickname,niche,fp_json,cookie_path,schedule_policy,max_per_day,health,dedup_mode \
                 FROM accounts",
            )
            .unwrap();
        let rows = stmt
            .query_map([], |r| {
                Ok(Account {
                    id: r.get(0)?,
                    platform: r.get(1)?,
                    nickname: r.get(2)?,
                    niche: r.get(3)?,
                    fp_json: r.get(4)?,
                    cookie_path: r.get(5)?,
                    schedule_policy: r.get(6)?,
                    max_per_day: r.get(7)?,
                    health: r.get(8)?,
                    dedup_mode: r.get(9)?,
                })
            })
            .unwrap();
        rows.filter_map(|x| x.ok()).collect()
    }

    pub fn insert_article(&self, a: &Article) {
        self.conn
            .lock()
            .unwrap()
            .execute(
                "INSERT OR REPLACE INTO articles\
                 (id,title,author,summary,body_markdown,category,cover_path,tags,created_at)\
                 VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    a.id, a.title, a.author, a.summary, a.body_markdown, a.category,
                    a.cover_path, a.tags, a.created_at
                ],
            )
            .ok();
    }

    pub fn get_article(&self, id: &str) -> Option<Article> {
        let c = self.conn.lock().unwrap();
        let mut stmt = c
            .prepare(
                "SELECT id,title,author,summary,body_markdown,category,cover_path,tags,created_at \
                 FROM articles WHERE id=?1",
            )
            .unwrap();
        stmt.query_row(params![id], |r| {
            Ok(Article {
                id: r.get(0)?,
                title: r.get(1)?,
                author: r.get(2)?,
                summary: r.get(3)?,
                body_markdown: r.get(4)?,
                category: r.get(5)?,
                cover_path: r.get(6)?,
                tags: r.get(7)?,
                created_at: r.get(8)?,
            })
        })
        .ok()
    }

    pub fn list_articles(&self) -> Vec<Article> {
        let c = self.conn.lock().unwrap();
        let mut stmt = c
            .prepare(
                "SELECT id,title,author,summary,body_markdown,category,cover_path,tags,created_at \
                 FROM articles ORDER BY created_at DESC",
            )
            .unwrap();
        let rows = stmt
            .query_map([], |r| {
                Ok(Article {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    author: r.get(2)?,
                    summary: r.get(3)?,
                    body_markdown: r.get(4)?,
                    category: r.get(5)?,
                    cover_path: r.get(6)?,
                    tags: r.get(7)?,
                    created_at: r.get(8)?,
                })
            })
            .unwrap();
        rows.filter_map(|x| x.ok()).collect()
    }

    pub fn delete_article(&self, id: &str) {
        self.conn
            .lock()
            .unwrap()
            .execute("DELETE FROM articles WHERE id=?1", params![id])
            .ok();
    }

    pub fn list_drafts(&self) -> Vec<Draft> {
        let c = self.conn.lock().unwrap();
        let mut stmt = c
            .prepare(
                "SELECT id,title,author,summary,body_markdown,category,tags,cover_id,status,created_at,updated_at \
                 FROM drafts ORDER BY updated_at DESC",
            )
            .unwrap();
        let rows = stmt
            .query_map([], |r| {
                Ok(Draft {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    author: r.get(2)?,
                    summary: r.get(3)?,
                    body_markdown: r.get(4)?,
                    category: r.get(5)?,
                    tags: r.get(6)?,
                    cover_id: r.get(7)?,
                    status: r.get(8)?,
                    created_at: r.get(9)?,
                    updated_at: r.get(10)?,
                })
            })
            .unwrap();
        rows.filter_map(|x| x.ok()).collect()
    }

    /// 写草稿；status=ready 时同步进 articles 表，打通 publish_article / enqueue_task
    pub fn upsert_draft(&self, d: &Draft) {
        {
            let c = self.conn.lock().unwrap();
            c.execute(
                "INSERT OR REPLACE INTO drafts\
                 (id,title,author,summary,body_markdown,category,tags,cover_id,status,created_at,updated_at)\
                 VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
                params![
                    d.id, d.title, d.author, d.summary, d.body_markdown, d.category,
                    d.tags, d.cover_id, d.status, d.created_at, d.updated_at
                ],
            )
            .ok();
        }
        if d.status == "ready" && !d.title.trim().is_empty() {
            self.insert_article(&Article {
                id: d.id.clone(),
                title: d.title.clone(),
                author: d.author.clone(),
                summary: d.summary.clone(),
                body_markdown: d.body_markdown.clone(),
                category: d.category.clone(),
                cover_path: d.cover_id.clone(),
                tags: d.tags.clone(),
                created_at: d.created_at,
            });
        } else {
            self.delete_article(&d.id);
        }
    }

    pub fn delete_draft(&self, id: &str) {
        self.conn
            .lock()
            .unwrap()
            .execute("DELETE FROM drafts WHERE id=?1", params![id])
            .ok();
        self.delete_article(id);
    }

    pub fn list_images(&self) -> Vec<ImageItem> {
        let c = self.conn.lock().unwrap();
        let mut stmt = c
            .prepare(
                "SELECT id,name,data_url,width,height,size,created_at \
                 FROM images ORDER BY created_at DESC",
            )
            .unwrap();
        let rows = stmt
            .query_map([], |r| {
                Ok(ImageItem {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    data_url: r.get(2)?,
                    width: r.get(3)?,
                    height: r.get(4)?,
                    size: r.get(5)?,
                    created_at: r.get(6)?,
                })
            })
            .unwrap();
        rows.filter_map(|x| x.ok()).collect()
    }

    pub fn upsert_image(&self, im: &ImageItem) {
        self.conn
            .lock()
            .unwrap()
            .execute(
                "INSERT OR REPLACE INTO images(id,name,data_url,width,height,size,created_at)\
                 VALUES(?1,?2,?3,?4,?5,?6,?7)",
                params![
                    im.id, im.name, im.data_url, im.width, im.height, im.size, im.created_at
                ],
            )
            .ok();
    }

    /// 删除素材时同步解除所有草稿对它的引用
    pub fn delete_image(&self, id: &str) {
        let c = self.conn.lock().unwrap();
        c.execute("DELETE FROM images WHERE id=?1", params![id]).ok();
        c.execute("UPDATE drafts SET cover_id='' WHERE cover_id=?1", params![id])
            .ok();
    }

    pub fn enqueue_task(&self, t: &Task) {
        self.conn
            .lock()
            .unwrap()
            .execute(
                "INSERT OR REPLACE INTO tasks\
                 (id,article_id,account_id,mode,status,attempts,next_run,created_at)\
                 VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
                params![
                    t.id, t.article_id, t.account_id, t.mode, t.status, t.attempts, t.next_run,
                    t.created_at
                ],
            )
            .ok();
    }

    pub fn get_task(&self, id: &str) -> Option<Task> {
        self.list_tasks().into_iter().find(|t| t.id == id)
    }

    pub fn update_task_status(&self, id: &str, status: &str, attempts: i32, next_run: &str) {
        self.conn
            .lock()
            .unwrap()
            .execute(
                "UPDATE tasks SET status=?2, attempts=?3, next_run=?4 WHERE id=?1",
                params![id, status, attempts, next_run],
            )
            .ok();
    }

    pub fn list_tasks(&self) -> Vec<Task> {
        let c = self.conn.lock().unwrap();
        let mut stmt = c
            .prepare(
                "SELECT id,article_id,account_id,mode,status,attempts,next_run,created_at \
                 FROM tasks ORDER BY created_at DESC",
            )
            .unwrap();
        let rows = stmt
            .query_map([], |r| {
                Ok(Task {
                    id: r.get(0)?,
                    article_id: r.get(1)?,
                    account_id: r.get(2)?,
                    mode: r.get(3)?,
                    status: r.get(4)?,
                    attempts: r.get(5)?,
                    next_run: r.get(6)?,
                    created_at: r.get(7)?,
                })
            })
            .unwrap();
        rows.filter_map(|x| x.ok()).collect()
    }

    /// 取出已到点的待发布任务（next_run <= now）
    pub fn list_due_tasks(&self, now: i64) -> Vec<Task> {
        let c = self.conn.lock().unwrap();
        let mut stmt = c
            .prepare(
                "SELECT id,article_id,account_id,mode,status,attempts,next_run,created_at \
                 FROM tasks WHERE status='pending' AND CAST(next_run AS INTEGER) <= ?1",
            )
            .unwrap();
        let rows = stmt
            .query_map(params![now], |r| {
                Ok(Task {
                    id: r.get(0)?,
                    article_id: r.get(1)?,
                    account_id: r.get(2)?,
                    mode: r.get(3)?,
                    status: r.get(4)?,
                    attempts: r.get(5)?,
                    next_run: r.get(6)?,
                    created_at: r.get(7)?,
                })
            })
            .unwrap();
        rows.filter_map(|x| x.ok()).collect()
    }

    pub fn daily_count(&self, account_id: &str, day: &str) -> i32 {
        let c = self.conn.lock().unwrap();
        let mut stmt = c
            .prepare("SELECT count FROM daily WHERE account_id=?1 AND day=?2")
            .unwrap();
        stmt.query_row(params![account_id, day], |r| r.get(0))
            .unwrap_or(0)
    }

    pub fn inc_daily(&self, account_id: &str, day: &str) {
        let cur = self.daily_count(account_id, day);
        self.conn
            .lock()
            .unwrap()
            .execute(
                "INSERT OR REPLACE INTO daily(account_id,day,count) VALUES(?1,?2,?3)",
                params![account_id, day, cur + 1],
            )
            .ok();
    }

    /// 该账号是否已发布过与 h 相似的内容（SimHash 去重，阈值与 content::dedupe 一致）
    pub fn has_simhash(&self, account_id: &str, h: u64) -> bool {
        let c = self.conn.lock().unwrap();
        let mut stmt = c
            .prepare("SELECT simhash FROM posted WHERE account_id=?1")
            .unwrap();
        let rows = stmt
            .query_map(params![account_id], |r| r.get::<_, i64>(0))
            .unwrap();
        for r in rows.flatten() {
            if ((r as u64) ^ h).count_ones() <= crate::content::dedupe::SIMHASH_THRESHOLD {
                return true;
            }
        }
        false
    }

    /// 记录已发布内容（account_id + article_id + SimHash），供两种去重模式查询
    pub fn record_posted(&self, account_id: &str, article_id: &str, h: u64) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        self.conn
            .lock()
            .unwrap()
            .execute(
                "INSERT INTO posted(account_id,article_id,simhash,created_at) VALUES(?1,?2,?3,?4)",
                params![account_id, article_id, h as i64, now],
            )
            .ok();
    }

    /// 该账号是否已发布过指定文章（按文章 id 去重）
    pub fn has_posted(&self, account_id: &str, article_id: &str) -> bool {
        let c = self.conn.lock().unwrap();
        let mut stmt = c
            .prepare("SELECT 1 FROM posted WHERE account_id=?1 AND article_id=?2 LIMIT 1")
            .unwrap();
        stmt.exists(params![account_id, article_id]).unwrap_or(false)
    }

    pub fn upsert_license(&self, l: &License) {
        self.conn
            .lock()
            .unwrap()
            .execute(
                "INSERT OR REPLACE INTO licenses(key,status,expired_at,device_count) VALUES(?1,?2,?3,?4)",
                params![l.key, l.status, l.expired_at, l.device_count],
            )
            .ok();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn posted_dedup_queries() {
        let db = Db::open(":memory:");
        // 按文章 id 去重
        assert!(!db.has_posted("a", "art1"));
        db.record_posted("a", "art1", 0b101);
        assert!(db.has_posted("a", "art1"));
        assert!(!db.has_posted("a", "art2"));
        assert!(!db.has_posted("b", "art1"));

        // 内容 SimHash 去重：相同内容距离 0 命中；差异巨大不命中
        assert!(db.has_simhash("a", 0b101));
        assert!(!db.has_simhash("a", 0xFFFF_FFFF_FFFF_FFF0));
    }

    #[test]
    fn account_roundtrip_includes_dedup_mode() {
        let db = Db::open(":memory:");
        let a = Account {
            id: "x".into(),
            platform: "wechat".into(),
            nickname: String::new(),
            niche: String::new(),
            fp_json: String::new(),
            cookie_path: String::new(),
            schedule_policy: String::new(),
            max_per_day: 1,
            health: String::new(),
            dedup_mode: "article".into(),
        };
        db.insert_account(&a);
        let got = db.get_account("x").unwrap();
        assert_eq!(got.dedup_mode, "article");
    }

    #[test]
    fn ready_draft_becomes_publishable_article() {
        let db = Db::open(":memory:");
        let draft = Draft {
            id: "draft_1".into(),
            title: "标题".into(),
            author: "作者".into(),
            summary: "摘要".into(),
            body_markdown: "# 正文".into(),
            category: "效率工具".into(),
            tags: "a,b".into(),
            cover_id: "img_1".into(),
            status: "ready".into(),
            created_at: 100,
            updated_at: 100,
        };
        db.upsert_draft(&draft);
        assert_eq!(db.list_drafts().len(), 1);
        assert_eq!(db.list_articles().len(), 1);
        let article = db.get_article("draft_1").unwrap();
        assert_eq!(article.title, "标题");
        assert_eq!(article.cover_path, "img_1");

        // 退回写作中后，不应再出现在可发布文章里
        let mut back = draft.clone();
        back.status = "draft".into();
        db.upsert_draft(&back);
        assert!(db.list_articles().is_empty());

        // 删除图片时解除草稿封面引用
        db.upsert_image(&ImageItem {
            id: "img_1".into(),
            name: "cover.png".into(),
            data_url: "data:image/png;base64,AA".into(),
            width: 100,
            height: 100,
            size: 2,
            created_at: 100,
        });
        assert_eq!(db.list_images().len(), 1);
        db.delete_image("img_1");
        assert_eq!(db.list_images().len(), 0);
        assert_eq!(db.list_drafts()[0].cover_id, "");
    }
}
