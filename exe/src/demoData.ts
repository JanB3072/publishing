import type { Account, Article, Task } from './types';

// 仅用于「浏览器预览模式」的演示数据；真实 Tauri 环境一律走后端命令。
// 字段类型严格对齐 Rust 端：created_at = unix 秒(number)，next_run = 字符串数字，mode = JSON 字符串。

const now = () => Math.floor(Date.now() / 1000);
const day = 86400;

export const DEMO_ARTICLES: Article[] = [
  {
    id: 'art_2026_001',
    title: '小团队如何把内容分发效率提升 3 倍',
    author: '内容运营组',
    summary: '从选题、改写、去重到错峰发布，拆解一套可复用的多平台分发流程。',
    body_markdown: '# 小团队如何把内容分发效率提升 3 倍\n\n...',
    category: '效率工具',
    cover_path: '',
    tags: '效率,内容运营,自动化',
    created_at: now() - day * 0.3,
  },
  {
    id: 'art_2026_002',
    title: '2026 年内容平台的推荐逻辑变了什么',
    author: '内容运营组',
    summary: '垂直领域、原创度、互动质量成为三个最关键的权重。',
    body_markdown: '# 推荐逻辑观察\n\n...',
    category: '行业观察',
    cover_path: '',
    tags: '推荐算法,行业观察',
    created_at: now() - day * 1.2,
  },
  {
    id: 'art_2026_003',
    title: '写给运营新人的账号冷启动清单',
    author: '林岚',
    summary: '资料完善、低频起步、稳定登录环境，比追热点更重要。',
    body_markdown: '# 账号冷启动清单\n\n...',
    category: '运营方法',
    cover_path: '',
    tags: '冷启动,养号,清单',
    created_at: now() - day * 2.6,
  },
  {
    id: 'art_2026_004',
    title: '一次发布事故后的复盘：相似度为何要提前算',
    author: '内容运营组',
    summary: '跨号内容雷同会同时伤害推荐与账号权重，发布前拦截更划算。',
    body_markdown: '# 复盘\n\n...',
    category: '复盘',
    cover_path: '',
    tags: '去重,复盘,风控',
    created_at: now() - day * 4.1,
  },
  {
    id: 'art_2026_005',
    title: '把定时发布做对：错峰、抖动与日频上限',
    author: '周叙',
    summary: '机械规律是最容易被识别的信号，节奏要留随机余量。',
    body_markdown: '# 定时发布\n\n...',
    category: '调度策略',
    cover_path: '',
    tags: '调度,错峰',
    created_at: now() - day * 5.8,
  },
];

const rawAccounts: Array<[string, string, string, string, string, number, string]> = [
  ['acc_wx_01', 'wechat', '深度效率笔记', '效率工具', 'content', 2, ''],
  ['acc_wx_02', 'wechat', '内容运营观察', '行业观察', 'content', 2, ''],
  ['acc_tt_01', 'toutiao', '科技早知道', '科技资讯', 'article', 3, ''],
  ['acc_zh_01', 'zhihu', '林岚的方法论', '运营方法', 'content', 1, ''],
  ['acc_xhs_01', 'xiaohongshu', '小岚的手帐', '生活方式', 'off', 1, ''],
  ['acc_bjh_01', 'baijiahao', '商业笔记簿', '商业财经', 'content', 2, ''],
];

export function demoAccounts(): Account[] {
  return rawAccounts.map(([id, platform, nickname, niche, dedup, max, health]) => ({
    id,
    platform,
    nickname,
    niche,
    fp_json: JSON.stringify({ ua: 'Mozilla/5.0', tz: 'Asia/Shanghai', w: 1440, h: 900 }),
    cookie_path: `./profiles/${id}/cookies`,
    schedule_policy: '',
    max_per_day: max,
    health,
    dedup_mode: dedup,
  }));
}

const statusCycle: Task['status'][] = [
  'success',
  'success',
  'success',
  'failed',
  'success',
  'need_human',
  'success',
  'success',
  'running',
  'success',
  'pending',
  'success',
  'success',
  'failed',
  'success',
  'success',
];

const modes = [
  '{"type":"immediate"}',
  '{"type":"immediate"}',
  JSON.stringify({ type: 'fixed', at: now() + 7200 }),
  '{"type":"immediate"}',
  '{"type":"interval","every":3600,"jitter":0.2}',
  '{"type":"immediate"}',
];

const hourOffsets = [2, 4, 26, 28, 30, 51, 74, 76, 78, 99, 122, 124, 146, 148, 170, 172];

export function demoTasks(): Task[] {
  return statusCycle.map((status, i) => {
    const created = now() - hourOffsets[i] * 3600;
    const acc = rawAccounts[i % rawAccounts.length][0];
    const art = DEMO_ARTICLES[i % DEMO_ARTICLES.length].id;
    return {
      id: `t${created}_${String(i).padStart(3, '0')}`,
      article_id: art,
      account_id: acc,
      mode: modes[i % modes.length],
      status,
      attempts: status === 'failed' ? 3 : status === 'pending' ? 0 : 1,
      next_run: status === 'pending' ? String(now() + 1800) : '0',
      created_at: created,
    };
  });
}
