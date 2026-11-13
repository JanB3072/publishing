import type { Tone } from './types';

export const PLATFORM_META: Record<string, { label: string; short: string; tone: Tone }> = {
  wechat: { label: '微信公众号', short: '微信', tone: 'success' },
  toutiao: { label: '今日头条', short: '头条', tone: 'danger' },
  zhihu: { label: '知乎', short: '知乎', tone: 'info' },
  xiaohongshu: { label: '小红书', short: '小红书', tone: 'warning' },
  baijiahao: { label: '百家号', short: '百家', tone: 'primary' },
  weibo: { label: '微博', short: '微博', tone: 'neutral' },
};

export const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  pending: { label: '等待中', tone: 'neutral' },
  running: { label: '执行中', tone: 'info' },
  success: { label: '已发布', tone: 'success' },
  failed: { label: '失败', tone: 'danger' },
  need_human: { label: '需人工', tone: 'warning' },
};

export const DEDUP_LABELS: Record<string, string> = {
  content: '内容相似度',
  article: '按文章 ID',
  off: '关闭',
};

export function platformLabel(key: string): string {
  return PLATFORM_META[key]?.label ?? key;
}

export function platformShort(key: string): string {
  return PLATFORM_META[key]?.short ?? key.slice(0, 2);
}

export function statusLabel(key: string): string {
  return STATUS_META[key]?.label ?? key;
}

export function statusTone(key: string): Tone {
  return STATUS_META[key]?.tone ?? 'neutral';
}

/** created_at 是 unix 秒（number），next_run 是字符串数字 */
export function formatTime(value: number | string | undefined): string {
  if (value === undefined || value === null || value === '' || value === '0') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n) || n <= 0) return String(value);
  const d = new Date(n * 1000);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function timeAgo(value: number): string {
  const diff = Math.floor(Date.now() / 1000) - value;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return formatTime(value);
}

function shortDateTime(sec: number): string {
  const d = new Date(sec * 1000);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** mode 是 JSON 字符串，转成中文简述 */
export function formatMode(mode: string): string {
  if (!mode) return '立即发布';
  try {
    const m = JSON.parse(mode);
    if (m.type === 'fixed') return `定时 · ${shortDateTime(Number(m.at))}`;
    if (m.type === 'interval') {
      const mins = Math.round((Number(m.every) || 0) / 60);
      return `间隔 · 每 ${mins} 分钟 ±${Math.round((Number(m.jitter) || 0) * 100)}%`;
    }
    return '立即发布';
  } catch {
    return mode;
  }
}
