pub mod anti_detect;
pub mod cdp;
pub mod chromium;

use crate::db::Account;
use anyhow::Result;
use cdp::CdpClient;
use chromium::RunningInstance;

/// 为某个账号启动一个隔离的 Chromium 实例，连 CDP 并注入反检测。
/// user-data-dir 按账号隔离 → Cookie/存储不串号；每次发布用同一目录即可复用登录态。
/// 实例与连接由调用方负责关闭，避免高阶生命周期约束。
pub async fn connect_for_account(account: &Account) -> Result<(RunningInstance, CdpClient)> {
    let inst = chromium::spawn_instance(account)?;
    // 等调试端口就绪
    tokio::time::sleep(std::time::Duration::from_millis(800)).await;
    let mut cdp = CdpClient::connect(inst.port).await?;
    anti_detect::apply(&mut cdp, &account.fingerprint()?).await?;
    Ok((inst, cdp))
}
