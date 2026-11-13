use crate::adapters::{self_check, selectors, Adapter, CaptchaError};
use crate::browser::cdp::CdpClient;
use async_trait::async_trait;

/// 用宏批量生成"结构一致、选择器各异"的平台适配器；选择器全部来自 selectors.toml。
macro_rules! platform_adapter {
    ($name:ident, $plat:literal) => {
        pub struct $name;

        #[async_trait]
        impl Adapter for $name {
            fn platform(&self) -> &str {
                $plat
            }
            async fn login(&self, cdp: &mut CdpClient) -> anyhow::Result<()> {
                let s = selectors::get($plat);
                cdp.navigate(&s.url).await?;
                Ok(())
            }
            async fn upload_cover(&self, cdp: &mut CdpClient, file: &str) -> anyhow::Result<String> {
                let s = selectors::get($plat);
                cdp.click(&s.cover_btn).await?;
                cdp.upload_file(&s.cover_input, file).await?;
                cdp.click(&s.cover_confirm).await?;
                Ok(format!("cover:{}", file))
            }
            async fn fill_title(&self, cdp: &mut CdpClient, title: &str) -> anyhow::Result<()> {
                let s = selectors::get($plat);
                cdp.type_text(&s.title, title).await
            }
            async fn fill_body(&self, cdp: &mut CdpClient, html: &str) -> anyhow::Result<()> {
                let s = selectors::get($plat);
                let escaped = html
                    .replace('\\', "\\\\")
                    .replace('"', "\\\"")
                    .replace('\n', "\\n");
                let expr = format!(
                    "(function(){{ var el=document.querySelector('{}')||document.body; \
                     el.focus(); document.execCommand('insertHTML', false, \"{}\"); }})()",
                    s.body, escaped
                );
                cdp.eval(&expr).await?;
                Ok(())
            }
            async fn fill_tags(&self, cdp: &mut CdpClient, tags: &[String]) -> anyhow::Result<()> {
                let s = selectors::get($plat);
                for t in tags {
                    cdp.type_text(&s.tags, t).await?;
                }
                Ok(())
            }
            async fn set_schedule(&self, _cdp: &mut CdpClient, _at: i64) -> anyhow::Result<()> {
                Ok(())
            }
            async fn submit(&self, cdp: &mut CdpClient) -> anyhow::Result<String> {
                let s = selectors::get($plat);
                cdp.click(&s.publish).await?;
                if cdp.query_selector(&s.captcha).await.is_ok() {
                    let shot = cdp.screenshot().await.unwrap_or_default();
                    anyhow::bail!(CaptchaError(shot));
                }
                Ok("submitted".to_string())
            }
            async fn self_check(&self, cdp: &mut CdpClient) -> Vec<String> {
                let s = selectors::get($plat);
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
    };
}

platform_adapter!(ToutiaoAdapter, "toutiao");
platform_adapter!(ZhihuAdapter, "zhihu");
platform_adapter!(XiaohongshuAdapter, "xiaohongshu");
platform_adapter!(BaijiahaoAdapter, "baijiahao");
platform_adapter!(WeiboAdapter, "weibo");
