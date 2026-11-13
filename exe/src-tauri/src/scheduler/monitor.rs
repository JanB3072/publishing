use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Default, Clone)]
struct AccountHealth {
    failures: u32,
    captchas: u32,
}

/// 账号健康度：失败次数 / 验证码次数超阈值则暂停该号发布（风控）。
pub struct Monitor {
    inner: Mutex<HashMap<String, AccountHealth>>,
}

impl Monitor {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    pub fn record_success(&self, id: &str) {
        let mut m = self.inner.lock().unwrap();
        let h = m.entry(id.to_string()).or_default();
        h.failures = 0;
        h.captchas = 0;
    }

    pub fn record_failure(&self, id: &str) {
        let mut m = self.inner.lock().unwrap();
        m.entry(id.to_string()).or_default().failures += 1;
    }

    pub fn record_captcha(&self, id: &str) {
        let mut m = self.inner.lock().unwrap();
        m.entry(id.to_string()).or_default().captchas += 1;
    }

    /// 验证码 ≥5 或 连续失败 ≥10 → 暂停该号，避免被风控盯上
    pub fn should_pause(&self, id: &str) -> bool {
        let m = self.inner.lock().unwrap();
        match m.get(id) {
            Some(h) => h.captchas >= 5 || h.failures >= 10,
            None => false,
        }
    }
}
