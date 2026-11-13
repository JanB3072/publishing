use crate::db::Account;
use std::net::TcpListener;
use std::process::{Child, Command};

pub struct RunningInstance {
    pub child: Child,
    pub port: u16,
}

/// 找一个空闲端口给 CDP 用
pub fn free_port() -> u16 {
    let l = TcpListener::bind("127.0.0.1:0").unwrap();
    l.local_addr().unwrap().port()
}

/// 探测系统里已安装的 Chromium / Chrome / Edge
pub fn find_chrome() -> String {
    for cand in [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    ] {
        if std::path::Path::new(cand).exists() {
            return cand.to_string();
        }
    }
    "chrome".to_string()
}

/// Chromium 136+ 在使用默认/相对 user-data-dir 时会忽略 --remote-debugging-port，
/// 因此所有实例都统一转成本机绝对路径。
fn resolve_profile_dir(dir: &str) -> String {
    let p = std::path::Path::new(dir);
    if p.is_absolute() {
        return dir.to_string();
    }
    std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join(p)
        .to_string_lossy()
        .to_string()
}

/// 为账号启动一个隔离的 Chromium（独立 user-data-dir + 反自动化启动参数）
pub fn spawn_instance(account: &Account) -> anyhow::Result<RunningInstance> {
    let port = free_port();
    let user_dir = format!("./profiles/{}", account.id);
    let child = Command::new(find_chrome())
        .arg(format!("--user-data-dir={}", resolve_profile_dir(&user_dir)))
        .arg(format!("--remote-debugging-port={}", port))
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg("--disable-blink-features=AutomationControlled")
        .arg("--test-type")
        .arg("--start-maximized")
        .spawn()?;
    Ok(RunningInstance { child, port })
}

/// 启动一个【无头】Chromium（同 user-data-dir），用于自测/CI，不弹窗。
pub fn spawn_instance_headless(account: &Account) -> anyhow::Result<RunningInstance> {
    let port = free_port();
    let user_dir = format!("./profiles/{}", account.id);
    let child = Command::new(find_chrome())
        .arg(format!("--user-data-dir={}", resolve_profile_dir(&user_dir)))
        .arg(format!("--remote-debugging-port={}", port))
        .arg("--headless=new")
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg("--disable-blink-features=AutomationControlled")
        .arg("--test-type")
        .spawn()?;
    Ok(RunningInstance { child, port })
}

/// 启动一个【可见】且带 CDP 调试端口的 Chromium，用于人工登录后回读账号资料。
/// 返回的实例由登录会话持有，保存/取消时统一关闭。
pub fn spawn_visible_with_port(
    profile_dir: &str,
    url: &str,
    port: u16,
) -> anyhow::Result<RunningInstance> {
    let child = Command::new(find_chrome())
        .arg(format!("--user-data-dir={}", resolve_profile_dir(profile_dir)))
        .arg(format!("--remote-debugging-port={}", port))
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg("--disable-blink-features=AutomationControlled")
        .arg("--test-type")
        .arg(format!("--app={}", url))
        .spawn()?;
    Ok(RunningInstance { child, port })
}

/// 打开一个【可见】的 Chromium 窗口（同 user-data-dir），用于人工扫码 / 解验证码。
/// 不跟踪子进程：人工处理完直接关闭即可。
pub fn open_visible(profile_dir: &str, url: &str) -> anyhow::Result<()> {
    Command::new(find_chrome())
        .arg(format!("--user-data-dir={}", resolve_profile_dir(profile_dir)))
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg("--disable-blink-features=AutomationControlled")
        .arg("--test-type")
        .arg(format!("--app={}", url))
        .spawn()?;
    Ok(())
}
