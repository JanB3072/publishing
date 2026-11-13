import express from 'express';
import { db } from './store.js';
import { issueLicense, verifyLicense } from './license.js';

const app = express();
app.use(express.json());

let store = db.load();
const persist = () => db.save(store);

// 注册（极简，仅演示）
app.post('/auth/register', (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username required' });
  const user = { id: 'u_' + store.users.length, username, createdAt: Date.now() };
  store.users.push(user);
  persist();
  res.json({ user });
});

// 登录
app.post('/auth/login', (req, res) => {
  const { username } = req.body || {};
  const user = store.users.find((u) => u.username === username);
  if (!user) return res.status(401).json({ error: 'not found' });
  res.json({ user });
});

// 签发 license（演示：调用即发试用）
app.post('/license/issue', (req, res) => {
  const lic = issueLicense();
  store.licenses.push(lic);
  persist();
  res.json({ license: lic });
});

// 激活（绑定设备，限制设备数）
app.post('/license/activate', (req, res) => {
  const { key, deviceId } = req.body || {};
  const lic = store.licenses.find((l) => l.key === key);
  if (!lic) return res.status(404).json({ error: 'license not found' });
  if (lic.boundDevices.length >= lic.maxDevices && !lic.boundDevices.includes(deviceId))
    return res.status(403).json({ error: 'device limit reached' });
  if (!lic.boundDevices.includes(deviceId)) lic.boundDevices.push(deviceId);
  persist();
  res.json({ ok: true, license: lic });
});

// 校验（EXE 启动调用，仅返回是否有效/到期/套餐，不含文章内容）
app.post('/license/verify', (req, res) => {
  const { key } = req.body || {};
  res.json(verifyLicense(store.licenses, key));
});

// 支付回调（占位）
app.post('/pay/callback', (req, res) => {
  res.json({ received: true });
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`[auth-server] listening on :${PORT}`));
