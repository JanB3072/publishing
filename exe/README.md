# 桌面端（exe / Tauri）

多平台文章同步发布工具桌面端。结构对应《技术设计方案》：

- **M0**：license 激活校验（前端输入 key → Rust 命令调后端 `/license/verify`）
- **M1+/M2**：浏览器实例管理 + CDP 驱动 + 公众号 Adapter + 发布命令
- **M4**：调度队列（定时/间隔/错峰/日频/重试/并发）+ 健康度 + **人工接管** + 平台侧定时（接线路由）

## 环境

- Node >= 18 / Rust 工具链（https://rustup.rs）
- Windows 需 Visual Studio Build Tools + WebView2（Win11 自带）
- 本机已安装 Chrome / Edge（用于 CDP 驱动）

## 运行（开发模式）

```bash
cd ../backend && npm install && npm start        # :8787
cd exe && npm install && npm run tauri dev       # 需 Rust 工具链 + Chrome/Edge + icons
```

> 首次 `tauri dev` 前需图标：在 `src-tauri/icons/` 放图标，或 `npx tauri icon <logo.png>` 生成。

## 校准选择器（无需重编译）

所有平台编辑器的关键选择器集中在 **`src-tauri/selectors.toml`**，修改后重启即可生效：

```toml
[wechat]
url = "https://mp.weixin.qq.com/"
title = "#title"
body  = "iframe.editor"
cover_btn = "#coverBtn"
# ... 其余字段
```

发布前会自动自检，缺失的选择器会在错误信息里列出，方便逐项校准。

## 人工接管（验证码 / 选择器缺失）

- 任务遇到验证码或选择器缺失时，状态置 `need_human`，并通过 Tauri 事件 `task_need_human` 通知前端；
- 前端弹出"需人工接管"面板，点"打开可见浏览器处理"会用**同一 user-data-dir** 启动一个可见 Chromium 窗口供人工扫码/解验证码；
- 处理完后点"我已处理，恢复任务"，任务立即重试（Cookie 已写入同一 profile，自动复用）。

## 源码结构（src-tauri/src）

```
commands.rs          # verify_license / list_accounts / add_account /
                     # publish_article / enqueue_task / list_tasks /
                     # start|stop_scheduler / resume_task / open_account_browser
db/                  # SQLite：accounts/articles/tasks/licenses/daily + CRUD
browser/             # chromium 启动(+可见接管) + cdp 客户端 + anti_detect + 实例管理
adapters/            # Adapter trait + selectors.toml 加载 + 公众号 + 其余 5 平台 + 自检
scheduler/           # 发布编排 + Scheduler（并发/定时/间隔/日频/重试）+ monitor 健康度
content/             # markdown→富文本 / 跨号去重 / 导入
crypto.rs            # Cookie 本地加密
selectors.toml       # 各平台编辑器选择器（校准入口）
```

## 调度说明（mode JSON）

- 立即：`{"type":"immediate"}`
- 定点：`{"type":"fixed","at":<unix秒>}`
- 间隔错峰：`{"type":"interval","every":3600,"jitter":0.2}`（每隔约 1h，±20% 抖动；单号日频上限 `max_per_day`）

任务状态：`pending / running / success / failed / need_human`（验证码或选择器缺失转人工）。

## 已知占位 / 待校准

- 各平台 Adapter 选择器仍是**示意**，必须按真实 DOM 校准 `selectors.toml`；`set_schedule`（平台侧定时）已接线路由并会点击弹层确认，但弹层具体交互需按真实 DOM 校准。
- `crypto.rs` 用固定密钥 + 固定 nonce，仅演示；生产改 OS Keychain + 随机 nonce。
- IP 隔离按方案暂缓（同 IP，靠行为层对冲）。
- 多平台 Adapter 结构已齐，仍需逐平台补真实交互细节。
- 跨号改写 `content/rewrite.rs` 为**确定性占位**（同义词替换 + 段落乱序），生产应替换为 LLM 改写。

## 端到端自测（self_test）

无需真实平台，用本地 mock 页验证整个 CDP 管线是否跑通：

```bash
# 前端点"运行端到端自测"按钮，或在 Rust 里直接 invoke('self_test')
```

它会在 `exe/mock/editor.html` 上无头启动 Chromium，依次执行：自检选择器 → 上传封面 → 填标题/正文/标签 → 提交，并断言 `#status == "published"`。返回形如 `self_test: submit=submitted status="published" published=true`。

`exe/mock/editor.html` 的元素 id 与 `selectors.toml` 默认一致，可用于：
- 本地对照抓取真实平台选择器；
- 点击"模拟出现验证码"注入 `#captcha`，验证人工接管/截图流程。

## 内容层：跨号去重 + 改写

- `content/dedupe.rs`：标准 SimHash（中英混排分词），汉明距离 ≤3 判为相似。
- `content/rewrite.rs`：按账号 id 种子做确定性改写（段落乱序 + 同义词），不同账号得到不同变体，降低"搬运"识别。
- 调度发布时（`scheduler/mod.rs` `run_one`）自动：改写正文 → 算 SimHash → 该账号已发过近似内容则拦截（`posted` 表）；发布成功记录 SimHash。

## 去重策略（可按账号切换）

`posted` 表记录每次发布（账号 + 文章 id + SimHash）。每个账号的 `dedup_mode`：

- `content`（默认）：SimHash 汉明距离 ≤3 判相似，近似内容不重复发（防搬运）。
- `article`：按**文章 id** 去重，同一篇文章对同一账号只发一次（防重复入队），但允许相似的不同文章。
- `off`：关闭去重——**允许同一篇文章定时（interval）重发**。

前端"账号 → 去重策略"下拉可切换；命令 `set_dedup_mode(account_id, mode)`。

## 改写：确定性 + LLM

- 确定性：`content/rewrite.rs::rewrite`（同义词 + 段落乱序），无外部依赖。
- LLM：设置环境变量 `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` 后，`rewrite_async` 自动走真实大模型改写，带内存缓存（同输入+同账号种子直接命中，省 token）。无 key 或调用失败时回退确定性改写。

## 构建注意

- 首版可编译骨架，首次请 `npm run tauri dev` 验证，按编译器提示微调（依赖已写入 Cargo.toml，新增 `toml` / `chrono`）。
- 不调用任何平台 OpenAPI；所有发布通过 CDP 模拟浏览器操作完成。
