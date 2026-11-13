use crate::browser::cdp::CdpClient;
use serde::Deserialize;
use serde_json::json;

/// 每账号一组固定指纹（从 Account.fp_json 解析），单次会话内保持一致
#[derive(Debug, Clone, Deserialize)]
pub struct Fingerprint {
    pub ua: String,
    pub lang: String,
    pub tz: String,
    pub platform: String,
    pub w: u32,
    pub h: u32,
}

/// 抹掉自动化痕迹（免费、最高杠杆）
pub async fn apply(cdp: &mut CdpClient, fp: &Fingerprint) -> anyhow::Result<()> {
    // 1) 关自动化标志
    cdp.send("Emulation.setAutomationOverride", json!({ "enabled": false }))
        .await?;
    // 2) UA / 语言 / 平台
    cdp.send(
        "Emulation.setUserAgentOverride",
        json!({ "userAgent": fp.ua, "acceptLanguage": fp.lang, "platform": fp.platform }),
    )
    .await?;
    // 3) 时区
    cdp.send("Emulation.setTimezoneOverride", json!({ "timezoneId": fp.tz }))
        .await?;
    // 4) 分辨率
    cdp.send(
        "Emulation.setDeviceMetricsOverride",
        json!({ "width": fp.w, "height": fp.h, "deviceScaleFactor": 1, "mobile": false }),
    )
    .await?;
    // 5) 页面内注入，覆盖 webdriver / cdc_ 痕迹
    let script = r#"
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      for (const k of Object.getOwnPropertyNames(window))
        if (/^\$?cdc_/.test(k)) delete window[k];
    "#;
    cdp.send(
        "Page.addScriptToEvaluateOnNewDocument",
        json!({ "source": script }),
    )
    .await?;
    Ok(())
}
