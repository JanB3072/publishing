pub mod monitor;

use crate::adapters;
use crate::browser;
use crate::db::{Account, Article, Db, Task};
use crate::scheduler::monitor::Monitor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::sync::Semaphore;

const MAX_RETRY: i32 = 3;

/// 发布单篇到单账号：取适配器 → 隔离实例 → 走完登录/封面/标题/正文/标签/定时/提交。
/// scheduled_at: 若平台支持侧定时发布，传 Unix 秒；否则由调度器控制执行时机（传 None）。
pub async fn publish(
    article: &Article,
    account: &Account,
    scheduled_at: Option<i64>,
) -> anyhow::Result<String> {
    let adapter = adapters::get(&account.platform);
    let (mut inst, mut cdp) = browser::connect_for_account(account).await?;
    let result = async {
        // 发布前自检：关键选择器缺失则直接报错，提示需校准
        let missing = adapter.self_check(&mut cdp).await;
        if !missing.is_empty() {
            anyhow::bail!("选择器缺失，需校准：{}", missing.join(", "));
        }
        adapter.login(&mut cdp).await?;
        if !article.cover_path.is_empty() {
            adapter.upload_cover(&mut cdp, &article.cover_path).await?;
        }
        adapter.fill_title(&mut cdp, &article.title).await?;
        let html = crate::content::markdown::to_html(&article.body_markdown);
        adapter.fill_body(&mut cdp, &html).await?;
        let tags: Vec<String> = article
            .tags
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        adapter.fill_tags(&mut cdp, &tags).await?;
        if let Some(at) = scheduled_at {
            adapter.set_schedule(&mut cdp, at).await?;
        }
        adapter.submit(&mut cdp).await
    }
    .await;
    let _ = cdp.close().await;
    let _ = inst.child.kill();
    result
}

#[derive(Clone)]
pub enum Mode {
    Immediate,
    Fixed(i64),
    Interval { every: i64, jitter: f32 },
}

/// 解析任务 mode（JSON）：{"type":"fixed","at":123} / {"type":"interval","every":3600,"jitter":0.2} / 其他→立即
pub fn parse_mode(s: &str) -> Mode {
    let v: serde_json::Value = serde_json::from_str(s).unwrap_or(serde_json::Value::Null);
    match v.get("type").and_then(|x| x.as_str()) {
        Some("fixed") => Mode::Fixed(v.get("at").and_then(|x| x.as_i64()).unwrap_or(0)),
        Some("interval") => Mode::Interval {
            every: v.get("every").and_then(|x| x.as_i64()).unwrap_or(3600),
            jitter: v.get("jitter").and_then(|x| x.as_f64()).unwrap_or(0.0) as f32,
        },
        _ => Mode::Immediate,
    }
}

pub(crate) fn now_secs() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

/// 以"天序号"作日频统计的 key（避免引入时区库）
pub(crate) fn today() -> String {
    format!("{}", now_secs() / 86400)
}

pub(crate) fn rand01() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .subsec_nanos();
    (n % 100000) as f64 / 100000.0
}

/// 调度器：并发控制 + 定时/间隔/错峰 + 日频 + 重试 + 健康度 + 人工接管事件
pub struct Scheduler {
    db: Arc<Db>,
    sem: Arc<Semaphore>,
    monitor: Arc<Monitor>,
    running: Arc<AtomicBool>,
    app: Mutex<Option<AppHandle>>,
}

impl Scheduler {
    pub fn new(db: Arc<Db>, concurrency: usize) -> Arc<Self> {
        Arc::new(Self {
            db,
            sem: Arc::new(Semaphore::new(concurrency.max(1))),
            monitor: Arc::new(Monitor::new()),
            running: Arc::new(AtomicBool::new(false)),
            app: Mutex::new(None),
        })
    }

    /// 注入 Tauri AppHandle，用于向前端发"需人工接管"事件
    pub fn set_app(&self, app: AppHandle) {
        *self.app.lock().unwrap() = Some(app);
    }

    pub fn enqueue(&self, task: &Task) {
        self.db.enqueue_task(task);
    }

    pub fn list_tasks(&self) -> Vec<Task> {
        self.db.list_tasks()
    }

    /// 人工处理完后恢复任务：重置为待运行、立即重试
    pub fn reset_task(&self, id: &str) {
        self.db.update_task_status(id, "pending", 0, "0");
    }

    pub fn start(self: &Arc<Self>) {
        if self.running.swap(true, Ordering::SeqCst) {
            return; // 已在运行
        }
        let s = self.clone();
        tauri::async_runtime::spawn(async move {
            while s.running.load(Ordering::SeqCst) {
                s.run_pending().await;
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
        });
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }

    async fn run_pending(self: &Arc<Self>) {
        let now = now_secs();
        for t in self.db.list_due_tasks(now) {
            if self.monitor.should_pause(&t.account_id) {
                continue;
            }
            // 并发已满则跳过，下一轮再试（不阻塞循环）
            let permit = match self.sem.clone().try_acquire_owned() {
                Ok(p) => p,
                Err(_) => continue,
            };
            let s = self.clone();
            tauri::async_runtime::spawn(async move {
                let _permit = permit;
                s.run_one(t).await;
            });
        }
    }

    async fn run_one(self: &Arc<Self>, t: Task) {
        // 日频上限
        let account = match self.db.get_account(&t.account_id) {
            Some(a) => a,
            None => {
                self.db.update_task_status(&t.id, "failed", t.attempts, &t.next_run);
                return;
            }
        };
        let day = today();
        if self.db.daily_count(&t.account_id, &day) >= account.max_per_day as i32 {
            // 超日频：推到明天同一秒
            self.db.update_task_status(
                &t.id,
                "pending",
                t.attempts,
                &(now_secs() + 86400).to_string(),
            );
            return;
        }
        self.db.inc_daily(&t.account_id, &day);
        self.db
            .update_task_status(&t.id, "running", t.attempts, &t.next_run);

        let mut article = match self.db.get_article(&t.article_id) {
            Some(a) => a,
            None => {
                self.db.update_task_status(&t.id, "failed", t.attempts, &t.next_run);
                return;
            }
        };

        // 跨号改写（有 LLM key 走真实改写并缓存，否则确定性改写）
        let variant = crate::content::rewrite::rewrite_async(&article.body_markdown, &account.id).await;
        let h = crate::content::dedupe::simhash(&variant);

        // 去重策略：off=不查重（允许同文定时重发）；article=按文章 id；content=SimHash 近似
        let duplicate = match account.dedup_mode.as_str() {
            "off" => false,
            "article" => self.db.has_posted(&account.id, &t.article_id),
            _ => self.db.has_simhash(&account.id, h),
        };
        if duplicate {
            self.db
                .update_task_status(&t.id, "failed", t.attempts, &t.next_run);
            return;
        }
        article.body_markdown = variant;

        // 定点任务：把平台侧定时时间传下去
        let scheduled_at = match parse_mode(&t.mode) {
            Mode::Fixed(at) => Some(at),
            _ => None,
        };

        match publish(&article, &account, scheduled_at).await {
            Ok(_) => {
                self.monitor.record_success(&t.account_id);
                self.db.record_posted(&account.id, &t.article_id, h);
                match parse_mode(&t.mode) {
                    Mode::Interval { every, jitter } => {
                        // 错峰：间隔 ± jitter 抖动
                        let jitter_secs =
                            (every as f64 * jitter as f64 * (rand01() * 2.0 - 1.0)) as i64;
                        let next = now_secs() + every + jitter_secs;
                        self.db
                            .update_task_status(&t.id, "pending", 0, &next.to_string());
                    }
                    _ => {
                        self.db
                            .update_task_status(&t.id, "success", t.attempts, &t.next_run);
                    }
                }
            }
            Err(e) => {
                let msg = e.to_string();
                if let Some(ce) = e.downcast_ref::<crate::adapters::CaptchaError>() {
                    // 验证码 → 转人工，附截图，暂停该号
                    self.monitor.record_captcha(&t.account_id);
                    self.db
                        .update_task_status(&t.id, "need_human", t.attempts, &t.next_run);
                    self.emit_need_human(&account.id, &t.id, "captcha", "captcha", &ce.0);
                } else if msg.contains("缺失") {
                    // 选择器缺失 → 转人工校准
                    self.monitor.record_failure(&t.account_id);
                    self.db
                        .update_task_status(&t.id, "need_human", t.attempts, &t.next_run);
                    self.emit_need_human(&account.id, &t.id, "selector", &msg, "");
                } else {
                    // 其他错误 → 指数退避重试
                    self.monitor.record_failure(&t.account_id);
                    let attempts = t.attempts + 1;
                    if attempts < MAX_RETRY {
                        let backoff = (2i64.pow(attempts.max(0) as u32)) * 60; // 60, 120, 240...
                        let next = now_secs() + backoff;
                        self.db
                            .update_task_status(&t.id, "pending", attempts, &next.to_string());
                    } else {
                        self.db
                            .update_task_status(&t.id, "failed", attempts, &t.next_run);
                    }
                }
            }
        }
    }

    fn emit_need_human(
        &self,
        account_id: &str,
        task_id: &str,
        reason: &str,
        message: &str,
        screenshot: &str,
    ) {
        let guard = self.app.lock().unwrap();
        if let Some(app) = guard.as_ref() {
            let _ = app.emit(
                "task_need_human",
                serde_json::json!({
                    "account_id": account_id,
                    "task_id": task_id,
                    "reason": reason,
                    "message": message,
                    "screenshot": screenshot,
                }),
            );
        }
    }
}
