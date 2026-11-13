import crypto from 'node:crypto';

// 签发 license（演示：默认 30 天试用、1 设备）
export function issueLicense(plan = 'trial', days = 30, maxDevices = 1) {
  const key = 'PT-' + crypto.randomBytes(12).toString('hex').toUpperCase();
  return {
    key,
    plan,
    issuedAt: Date.now(),
    expiredAt: Date.now() + days * 86400000,
    maxDevices,
    boundDevices: [],
    active: true,
  };
}

// 校验 license（EXE 启动调用）
export function verifyLicense(licenses, key) {
  const lic = licenses.find((l) => l.key === key);
  if (!lic) return { valid: false, message: 'license 不存在' };
  if (!lic.active) return { valid: false, message: 'license 已停用' };
  if (lic.expiredAt < Date.now()) return { valid: false, message: 'license 已过期' };
  return { valid: true, message: 'ok', plan: lic.plan, expiredAt: lic.expiredAt };
}
