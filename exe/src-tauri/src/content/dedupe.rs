/// 跨号内容去重：标准 SimHash。
/// 把分词后的 token 哈希累加成 64 维向量，按正负位生成指纹；
/// 两指纹汉明距离不超过 SIMHASH_THRESHOLD 视为高度相似（雷同需拦截）。
pub fn simhash(text: &str) -> u64 {
    let mut vec = [0i64; 64];
    for tok in tokenize(text) {
        let h = fnv(&tok);
        for i in 0..64 {
            if (h >> i) & 1 == 1 {
                vec[i] += 1;
            } else {
                vec[i] -= 1;
            }
        }
    }
    let mut out = 0u64;
    for i in 0..64 {
        if vec[i] > 0 {
            out |= 1 << i;
        }
    }
    out
}

/// 短中文文本的经验阈值：轻微改写距离约 6，完全不同主题约 21，取 10 留足余量。
pub const SIMHASH_THRESHOLD: u32 = 10;

/// 两指纹汉明距离不超过阈值视为相似
pub fn similar(a: u64, b: u64) -> bool {
    (a ^ b).count_ones() <= SIMHASH_THRESHOLD
}

/// 分词：英文/数字按空白切，中文按单字切（覆盖中英混排文章）
fn tokenize(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for seg in text.split_whitespace() {
        let mut buf = String::new();
        for ch in seg.chars() {
            if ch.is_ascii_alphanumeric() {
                buf.push(ch);
            } else {
                if !buf.is_empty() {
                    out.push(std::mem::take(&mut buf));
                }
                if ch.is_alphabetic() && !ch.is_ascii() {
                    // 中日韩等表意文字：单字成词
                    out.push(ch.to_string());
                }
            }
        }
        if !buf.is_empty() {
            out.push(buf);
        }
    }
    out
}

fn fnv(s: &str) -> u64 {
    let mut h: u64 = 14695981039346656037;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(1099511628211);
    }
    h
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_near_duplicates() {
        let a = simhash("今天天气真好我们去公园散步吧");
        let b = simhash("今天天气真好我们到公园散步呀");
        assert!(similar(a, b), "轻微改写应被判为相似");
        let c = simhash("量子计算正在重塑密码学基础设施");
        assert!(!similar(a, c), "不同主题不应相似");
    }
}
