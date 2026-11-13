use crate::browser::cdp::CdpClient;

pub mod others;
pub mod selectors;
pub mod stubs;
pub mod wechat;

/// 验证码错误：携带截图（base64 PNG），供前端人工接管时预览
#[derive(Debug)]
pub struct CaptchaError(pub String);

impl std::fmt::Display for CaptchaError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "captcha")
    }
}

impl std::error::Error for CaptchaError {}

#[async_trait::async_trait]
pub trait Adapter: Send + Sync {
    fn platform(&self) -> &str;
    /// 登录/恢复登录态（依赖 user-data-dir 中已存的 Cookie；首次需人工扫码）
    async fn login(&self, cdp: &mut CdpClient) -> anyhow::Result<()>;
    /// 上传封面/素材，返回素材 URL 或引用标识
    async fn upload_cover(&self, cdp: &mut CdpClient, file: &str) -> anyhow::Result<String>;
    async fn fill_title(&self, cdp: &mut CdpClient, title: &str) -> anyhow::Result<()>;
    /// html 为 Markdown 转换后的富文本
    async fn fill_body(&self, cdp: &mut CdpClient, html: &str) -> anyhow::Result<()>;
    async fn fill_tags(&self, cdp: &mut CdpClient, tags: &[String]) -> anyhow::Result<()>;
    /// at 为 Unix 秒；不设置则立即发布（当前由调度器控制执行时机）
    async fn set_schedule(&self, cdp: &mut CdpClient, at: i64) -> anyhow::Result<()>;
    /// 提交发布，返回平台状态串
    async fn submit(&self, cdp: &mut CdpClient) -> anyhow::Result<String>;
    /// 发布前自检：返回缺失的关键选择器名（空=通过）
    async fn self_check(&self, _cdp: &mut CdpClient) -> Vec<String> {
        Vec::new()
    }
}

/// 按名称批量检测选择器是否存在，返回缺失项
pub async fn self_check(cdp: &mut CdpClient, sels: &[(&str, &str)]) -> Vec<String> {
    let mut missing = Vec::new();
    for (name, sel) in sels {
        if cdp.query_selector(sel).await.is_err() {
            missing.push((*name).to_string());
        }
    }
    missing
}

/// 按平台取适配器
pub fn get(platform: &str) -> Box<dyn Adapter> {
    match platform {
        "wechat" => Box::new(wechat::WeChatAdapter),
        "toutiao" => Box::new(others::ToutiaoAdapter),
        "zhihu" => Box::new(others::ZhihuAdapter),
        "xiaohongshu" => Box::new(others::XiaohongshuAdapter),
        "baijiahao" => Box::new(others::BaijiahaoAdapter),
        "weibo" => Box::new(others::WeiboAdapter),
        other => Box::new(stubs::StubAdapter::new(other)),
    }
}
