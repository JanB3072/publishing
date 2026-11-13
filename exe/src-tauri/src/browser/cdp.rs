use anyhow::{anyhow, Result};
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::MaybeTlsStream;
use tokio_tungstenite::{connect_async, WebSocketStream};
use tokio::net::TcpStream;

type Ws = WebSocketStream<MaybeTlsStream<TcpStream>>;

/// 轻量 CDP 客户端：连调试端口 → 发命令 → 按 id 收结果
pub struct CdpClient {
    ws: Ws,
    next_id: u32,
}

impl CdpClient {
    pub async fn connect(port: u16) -> Result<Self> {
        // 先拿 webSocketDebuggerUrl
        let ver: Value = reqwest::get(format!("http://127.0.0.1:{}/json/version", port))
            .await?
            .json()
            .await?;
        let ws_url = ver["webSocketDebuggerUrl"]
            .as_str()
            .ok_or_else(|| anyhow!("no webSocketDebuggerUrl"))?;
        let (ws, _) = connect_async(ws_url.to_owned()).await?;
        let mut c = Self { ws, next_id: 1 };
        c.enable_dom().await;
        Ok(c)
    }

    /// 启用 Page / DOM 域（幂等，失败忽略），让 query_selector / screenshot 更稳。
    async fn enable_dom(&mut self) {
        let _ = self.send("Page.enable", serde_json::json!({})).await;
        let _ = self.send("DOM.enable", serde_json::json!({})).await;
    }

    /// 连接到浏览器里的页面 target（而非 browser target），用于读取页面 DOM 资料。
    /// Chromium 冷启动到调试端口就绪需要 1~3 秒，这里做短轮询避免用户手动重试。
    pub async fn connect_page(port: u16) -> Result<Self> {
        let url = format!("http://127.0.0.1:{}/json/list", port);
        let client = reqwest::Client::new();
        for _ in 0..15 {
            if let Ok(resp) = client
                .get(url.as_str())
                .timeout(std::time::Duration::from_millis(800))
                .send()
                .await
            {
                if let Ok(list) = resp.json::<Value>().await {
                    let found = list.as_array().and_then(|arr| {
                        arr.iter()
                            .find(|v| {
                                v.get("type").and_then(|x| x.as_str()) == Some("page")
                                    && !v
                                        .get("url")
                                        .and_then(|x| x.as_str())
                                        .unwrap_or("")
                                        .starts_with("devtools://")
                            })
                            .and_then(|v| v.get("webSocketDebuggerUrl"))
                            .and_then(|x| x.as_str())
                            .map(|s| s.to_owned())
                    });
                    if let Some(ws_url) = found {
                        if let Ok((ws, _)) = connect_async(ws_url).await {
                            let mut c = Self { ws, next_id: 1 };
                            c.enable_dom().await;
                            return Ok(c);
                        }
                    }
                }
            }
            tokio::time::sleep(std::time::Duration::from_millis(350)).await;
        }
        Err(anyhow!("浏览器页面尚未就绪，请稍后重试"))
    }

    /// 发送一个 CDP 命令并等待匹配 id 的结果
    pub async fn send(&mut self, method: &str, params: Value) -> Result<Value> {
        let id = self.next_id;
        self.next_id += 1;
        let msg = serde_json::json!({ "id": id, "method": method, "params": params });
        self.ws.send(Message::Text(msg.to_string())).await?;

        while let Some(ok) = self.ws.next().await {
            let msg = ok?;
            if let Message::Text(t) = msg {
                let v: Value = serde_json::from_str(&t)?;
                if v.get("id").and_then(|x| x.as_u64()) == Some(id as u64) {
                    if let Some(err) = v.get("error") {
                        return Err(anyhow!("cdp error: {}", err));
                    }
                    return Ok(v.get("result").cloned().unwrap_or(Value::Null));
                }
            }
        }
        Err(anyhow!("cdp stream closed"))
    }

    pub async fn close(mut self) -> Result<()> {
        let _ = self.ws.close(None).await;
        Ok(())
    }

    // ---- 常用原语 ----

    pub async fn navigate(&mut self, url: &str) -> Result<()> {
        self.send("Page.navigate", serde_json::json!({ "url": url }))
            .await?;
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        Ok(())
    }

    pub async fn query_selector(&mut self, selector: &str) -> Result<u32> {
        let r = self
            .send("DOM.querySelector", serde_json::json!({ "nodeId": 1, "selector": selector }))
            .await?;
        r.get("nodeId")
            .and_then(|x| x.as_u64())
            .map(|x| x as u32)
            .ok_or_else(|| anyhow!("selector not found: {}", selector))
    }

    /// 用页面内 JS 聚焦元素（把光标放到目标上，供后续 Input.insertText / dispatchKeyEvent 使用）。
    /// 不依赖 CDP DOM 的 nodeId，规避「Could not find node with given id」。
    pub async fn focus_selector(&mut self, selector: &str) -> Result<bool> {
        let expr = format!(
            r#"(function(){{ try {{ var el = document.querySelector({sel:?}); if (el) {{ el.focus(); if (el.setSelectionRange && el.value !== undefined) {{ try {{ el.setSelectionRange(el.value.length, el.value.length); }} catch(e){{}} }} return true; }} }} catch(e){{}} return false; }})()"#,
            sel = selector
        );
        match self.eval(&expr).await {
            Ok(Value::Bool(true)) => Ok(true),
            _ => Ok(false),
        }
    }

    /// 用页面内 JS 直接触发元素 click（能正确被 React 等合成事件捕获），无需 nodeId。
    pub async fn click_selector(&mut self, selector: &str) -> Result<bool> {
        let expr = format!(
            r#"(function(){{ try {{ var el = document.querySelector({sel:?}); if (el) {{ el.click(); return true; }} }} catch(e){{}} return false; }})()"#,
            sel = selector
        );
        match self.eval(&expr).await {
            Ok(Value::Bool(true)) => Ok(true),
            _ => Ok(false),
        }
    }

    pub async fn click(&mut self, selector: &str) -> Result<()> {
        if !self.click_selector(selector).await? {
            anyhow::bail!("selector not found: {}", selector);
        }
        Ok(())
    }

    pub async fn type_text(&mut self, selector: &str, text: &str) -> Result<()> {
        // 优先：聚焦后用 Input.insertText 逐片插入（拟人节奏，且能绕过受控组件限制）
        if !self.focus_selector(selector).await? {
            // 兜底：直接写值并派发 input 事件（受控组件可能不触发，但至少不报错）
            let expr = format!(
                r#"(function(){{ try {{ var el = document.querySelector({sel:?}); if (el) {{ var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; setter.call(el, {val:?}); el.dispatchEvent(new Event('input', {{ bubbles: true }})); return true; }} }} catch(e){{}} return false; }})()"#,
                sel = selector,
                val = text
            );
            if !matches!(self.eval(&expr).await, Ok(Value::Bool(true))) {
                anyhow::bail!("selector not found: {}", selector);
            }
            return Ok(());
        }
        // 按「字符」分片（而非字节），中文等多字节字符不会被切断成乱码
        let chars: Vec<char> = text.chars().collect();
        for chunk in chars.chunks(120) {
            let part: String = chunk.iter().collect();
            self.send("Input.insertText", serde_json::json!({ "text": part }))
                .await?;
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        }
        Ok(())
    }

    pub async fn upload_file(&mut self, selector: &str, path: &str) -> Result<()> {
        // 先取文档根节点，避免 nodeId 1 失效导致「Could not find node with given id」
        let doc = self
            .send("DOM.getDocument", serde_json::json!({ "depth": -1, "pierce": false }))
            .await?;
        let root = doc
            .get("root")
            .and_then(|r| r.get("nodeId"))
            .and_then(|n| n.as_u64())
            .unwrap_or(1) as u32;
        let r = self
            .send(
                "DOM.querySelector",
                serde_json::json!({ "nodeId": root, "selector": selector }),
            )
            .await?;
        let node_id = r
            .get("nodeId")
            .and_then(|n| n.as_u64())
            .ok_or_else(|| anyhow!("selector not found: {}", selector))? as u32;
        self.send(
            "DOM.setFileInputFiles",
            serde_json::json!({ "nodeId": node_id, "files": [path] }),
        )
        .await?;
        Ok(())
    }

    /// 向当前聚焦元素派发一次按键（keydown + keyup），用于「回车发送」等场景。
    /// 调用前应先用 `query_selector` + `DOM.focus` 把焦点放到目标元素上。
    pub async fn press_key(&mut self, key: &str) -> Result<()> {
        let vk = match key {
            "Enter" => 13,
            "Escape" => 27,
            "Tab" => 9,
            _ => 0,
        };
        let payload = |t: &str| {
            serde_json::json!({
                "type": t,
                "key": key,
                "code": if key == "Enter" { "Enter" } else { key },
                "windowsVirtualKeyCode": vk,
            })
        };
        self.send("Input.dispatchKeyEvent", payload("keyDown")).await?;
        self.send("Input.dispatchKeyEvent", payload("keyUp")).await?;
        Ok(())
    }

    pub async fn eval(&mut self, expr: &str) -> Result<Value> {
        let r = self
            .send(
                "Runtime.evaluate",
                serde_json::json!({ "expression": expr, "returnByValue": true }),
            )
            .await?;
        Ok(r.get("result")
            .and_then(|v| v.get("value"))
            .cloned()
            .unwrap_or(Value::Null))
    }

    /// 截图当前页面，返回 base64 PNG 数据（不含 data: 前缀）
    pub async fn screenshot(&mut self) -> Result<String> {
        let r = self
            .send(
                "Page.captureScreenshot",
                serde_json::json!({ "format": "png" }),
            )
            .await?;
        Ok(r.get("data")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string())
    }
}
