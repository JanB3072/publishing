# 云端授权服务（backend）

仅做 license 签发 / 激活 / 校验 / 支付占位。**不接收任何文章内容**。

## 运行

```bash
cd backend
npm install
npm start          # 默认 http://localhost:8787
```

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/register` | 注册（演示） |
| POST | `/auth/login` | 登录 |
| POST | `/license/issue` | 签发试用 license |
| POST | `/license/activate` | 激活并绑定设备（限设备数） |
| POST | `/license/verify` | EXE 启动校验（返回 valid/message） |
| POST | `/pay/callback` | 支付回调（占位） |

## 说明

- 当前用 `db.json` 文件存储，仅用于 M0 演示；正式环境换 Postgres + 微信/支付宝支付 SDK。
- `verify` 只返回是否有效/到期/套餐，云端不知道用户发了什么。
