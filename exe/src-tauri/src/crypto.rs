use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;

// 占位密钥：生产环境必须从 OS Keychain 取，且 nonce 需随机化（此处固定 nonce 仅演示）
const KEY: &[u8] = b"0123456789abcdef0123456789abcdef";
const NONCE: &[u8; 12] = b"publishingex";

/// 加密 Cookie / 凭据后本地存储
pub fn encrypt(plain: &str) -> anyhow::Result<String> {
    let cipher = Aes256Gcm::new_from_slice(KEY)?;
    let nonce = Nonce::from_slice(NONCE);
    let ct = cipher
        .encrypt(nonce, plain.as_bytes())
        .map_err(|_| anyhow::anyhow!("aes-gcm encrypt failed"))?;
    Ok(STANDARD.encode(ct))
}

/// 解密本地存储的凭据
pub fn decrypt(b64: &str) -> anyhow::Result<String> {
    let cipher = Aes256Gcm::new_from_slice(KEY)?;
    let nonce = Nonce::from_slice(NONCE);
    let ct = STANDARD.decode(b64)?;
    let pt = cipher
        .decrypt(nonce, ct.as_ref())
        .map_err(|_| anyhow::anyhow!("aes-gcm decrypt failed"))?;
    Ok(String::from_utf8(pt)?)
}
