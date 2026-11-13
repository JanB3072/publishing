use crate::adapters::{self_check, selectors, Adapter, CaptchaError};
use crate::browser::cdp::CdpClient;
use async_trait::async_trait;

pub struct WeChatAdapter;

#[async_trait]
impl Adapter for WeChatAdapter {
    fn platform(&self) -> &str {
        "wechat"
    }

    async fn login(&self, cdp: &mut CdpClient) -> anyhow::Result<()> {
        let s = selectors::get("wechat");
        cdp.navigate(&s.url).await?;
        Ok(())
    }

    /// 封面两步上传：点上传按钮 → 选文件 → 确认（选择器见 selectors.toml）
    async fn upload_cover(&self, cdp: &mut CdpClient, file: &str) -> anyhow::Result<String> {
        let s = selectors::get("wechat");
        cdp.click(&s.cover_btn).await?;
        cdp.upload_file(&s.cover_input, file).await?;
        cdp.click(&s.cover_confirm).await?;
        Ok(format!("cover:{}", file))
    }

    async fn fill_title(&self, cdp: &mut CdpClient, title: &str) -> anyhow::Result<()> {
        let s = selectors::get("wechat");
        cdp.type_text(&s.title, title).await
    }

    async fn fill_body(&self, cdp: &mut CdpClient, html: &str) -> anyhow::Result<()> {
        let s = selectors::get("wechat");
        let escaped = html
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n");
        let expr = format!(
            "(function(){{ var f=document.querySelector('{}'); var d=f&&f.contentDocument; \
             var el=d?d.body:document.body; el.focus(); \
             document.execCommand('insertHTML', false, \"{}\"); }})()",
            s.body, escaped
        );
        cdp.eval(&expr).await?;
        Ok(())
    }

    async fn fill_tags(&self, cdp: &mut CdpClient, tags: &[String]) -> anyhow::Result<()> {
        let s = selectors::get("wechat");
        for t in tags {
            cdp.type_text(&s.tags, t).await?;
        }
        Ok(())
    }

    /// 平台侧定时发布：打开"定时"开关并填时间（选择器见 selectors.toml，需按真实 DOM 校准）
    async fn set_schedule(&self, cdp: &mut CdpClient, at: i64) -> anyhow::Result<()> {
        let s = selectors::get("wechat");
        cdp.click(&s.schedule_toggle).await?;
        if let Some(dt) = chrono::DateTime::from_timestamp(at, 0) {
            let fmt = dt.format("%Y-%m-%d %H:%M").to_string();
            cdp.type_text(&s.schedule_time, &fmt).await?;
        }
        // 点弹层"确认定时"按钮（选择器见 selectors.toml，需按真实 DOM 校准）
        cdp.click(&s.schedule_confirm).await?;
        Ok(())
    }

    async fn submit(&self, cdp: &mut CdpClient) -> anyhow::Result<String> {
        let s = selectors::get("wechat");
        cdp.click(&s.publish).await?;
        // 发布后检测验证码遮罩，命中则截图并转人工接管
        if cdp.query_selector(&s.captcha).await.is_ok() {
            let shot = cdp.screenshot().await.unwrap_or_default();
            anyhow::bail!(CaptchaError(shot));
        }
        Ok("submitted".to_string())
    }

    async fn self_check(&self, cdp: &mut CdpClient) -> Vec<String> {
        let s = selectors::get("wechat");
        self_check(
            cdp,
            &[
                ("title", s.title.as_str()),
                ("body", s.body.as_str()),
                ("cover_btn", s.cover_btn.as_str()),
                ("cover_input", s.cover_input.as_str()),
                ("cover_confirm", s.cover_confirm.as_str()),
                ("tags", s.tags.as_str()),
                ("publish", s.publish.as_str()),
            ],
        )
        .await
    }
}
