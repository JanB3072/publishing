use crate::adapters::Adapter;
use crate::browser::cdp::CdpClient;
use async_trait::async_trait;

/// 未实装平台的占位适配器（统一返回"未实现"，待补 DOM 逻辑）
pub struct StubAdapter {
    platform: String,
}

impl StubAdapter {
    pub fn new(p: &str) -> Self {
        Self {
            platform: p.to_string(),
        }
    }
}

#[async_trait]
impl Adapter for StubAdapter {
    fn platform(&self) -> &str {
        &self.platform
    }
    async fn login(&self, _: &mut CdpClient) -> anyhow::Result<()> {
        Err(anyhow::anyhow!("{} adapter 未实现", self.platform))
    }
    async fn upload_cover(&self, _: &mut CdpClient, _: &str) -> anyhow::Result<String> {
        Err(anyhow::anyhow!("{} adapter 未实现", self.platform))
    }
    async fn fill_title(&self, _: &mut CdpClient, _: &str) -> anyhow::Result<()> {
        Err(anyhow::anyhow!("{} adapter 未实现", self.platform))
    }
    async fn fill_body(&self, _: &mut CdpClient, _: &str) -> anyhow::Result<()> {
        Err(anyhow::anyhow!("{} adapter 未实现", self.platform))
    }
    async fn fill_tags(&self, _: &mut CdpClient, _: &[String]) -> anyhow::Result<()> {
        Err(anyhow::anyhow!("{} adapter 未实现", self.platform))
    }
    async fn set_schedule(&self, _: &mut CdpClient, _: i64) -> anyhow::Result<()> {
        Err(anyhow::anyhow!("{} adapter 未实现", self.platform))
    }
    async fn submit(&self, _: &mut CdpClient) -> anyhow::Result<String> {
        Err(anyhow::anyhow!("{} adapter 未实现", self.platform))
    }
}
