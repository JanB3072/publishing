use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

/// 跨号改写：同一篇文章发到不同账号时，生成语义相近但文本不同的变体，
/// 降低平台"跨号搬运/重复"识别风险。
///
/// `rewrite` 为**确定性**占位实现（无 LLM）：按账号 id 做种子，
/// 1) 段落乱序；2) 同义词替换表。
/// `rewrite_async` 在配置了 `OPENAI_API_KEY` 时走真实 LLM 改写并带内存缓存，
/// 否则回退到 `rewrite`。

static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<String, String>> {
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 主入口（同步、确定性）：输入原文 + 账号种子，输出改写后的 Markdown
pub fn rewrite(text: &str, seed: &str) -> String {
    let mut rng = fnv64(seed);
    let mut paras: Vec<&str> = text
        .split("\n\n")
        .filter(|s| !s.trim().is_empty())
        .collect();
    // 确定性段落乱序
    for i in (1..paras.len()).rev() {
        rng = next_rng(rng);
        let j = (rng % (i as u64 + 1)) as usize;
        paras.swap(i, j);
    }
    let joined = paras.join("\n\n");
    substitute(&joined, rng)
}

/// 主入口（异步）：优先 LLM 改写（带缓存），失败/无 key 回退确定性改写
pub async fn rewrite_async(text: &str, seed: &str) -> String {
    let key = format!("{}:{}", fnv64(text), fnv64(seed));
    if let Some(cached) = cache().lock().unwrap().get(&key) {
        return cached.clone();
    }
    let result = match call_llm(text).await {
        Some(out) if !out.trim().is_empty() => out,
        _ => rewrite(text, seed),
    };
    cache().lock().unwrap().insert(key, result.clone());
    result
}

async fn call_llm(text: &str) -> Option<String> {
    let key = std::env::var("OPENAI_API_KEY").ok()?;
    let base = std::env::var("OPENAI_BASE_URL")
        .unwrap_or_else(|_| "https://api.openai.com/v1".to_string());
    let model = std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-4o-mini".to_string());
    let client = reqwest::Client::new();
    let prompt = format!(
        "你是多平台内容分发助手。下面是一篇 Markdown 文章，请在不改变核心事实、结构和篇幅的前提下，\
         用不同的措辞、连接词与句式重写一遍，使其与原文明显不同但语义一致，以降低平台对“搬运/重复”的识别。\
         只输出重写后的 Markdown，不要任何解释。\n\n---\n{}",
        text
    );
    let body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "temperature": 0.8,
    });
    let resp = client
        .post(format!("{}/chat/completions", base.trim_end_matches('/')))
        .bearer_auth(key)
        .json(&body)
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let v: serde_json::Value = resp.json().await.ok()?;
    v.get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .map(|s| s.to_string())
}

/// 同义词替换：每个词有多个候选，由账号种子派生的伪随机序列挑选，
/// 保证同账号稳定、不同账号得到不同变体（单段落文本同样生效）。
fn substitute(text: &str, mut rng: u64) -> String {
    let rules: &[(&str, &[&str])] = &[
        ("我们", &["咱们", "大家"]),
        ("因此", &["所以", "故而"]),
        ("然而", &["不过", "但"]),
        ("首先", &["第一", "先"]),
        ("其次", &["接着", "再者"]),
        ("例如", &["比如", "举例说"]),
        ("重要", &["关键", "要紧"]),
        ("可以", &["能够", "可"]),
        ("需要", &["得", "须要"]),
        ("很多", &["不少", "许多"]),
    ];
    let mut s = text.to_string();
    for (a, bs) in rules {
        rng = next_rng(rng);
        let b = bs[((rng >> 8) as usize) % bs.len()];
        s = s.replace(a, b);
    }
    s
}

fn fnv64(s: &str) -> u64 {
    let mut h: u64 = 14695981039346656037;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(1099511628211);
    }
    h
}

fn next_rng(x: u64) -> u64 {
    let mut x = x | 1;
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    x
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrite_is_deterministic_and_changes_text() {
        let src = "我们因此很重要。例如需要很多时间。";
        let a = rewrite(src, "acc_1");
        let b = rewrite(src, "acc_1");
        assert_eq!(a, b, "同种子应稳定");
        assert_ne!(a, src, "应发生同义词替换");
        let c = rewrite(src, "acc_2");
        assert_ne!(a, c, "不同账号应得到不同变体");
    }

    #[tokio::test]
    async fn rewrite_async_falls_back_without_key() {
        // 未设置 OPENAI_API_KEY 时应回退确定性改写，且返回非空
        std::env::remove_var("OPENAI_API_KEY");
        let out = rewrite_async("我们因此很重要。例如需要很多时间。", "acc_1").await;
        assert!(!out.is_empty());
    }
}
