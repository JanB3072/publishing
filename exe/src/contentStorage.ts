import type { Article, Draft, ImageItem } from './types';

// 内容库（草稿 / 图库）保存在浏览器 localStorage。
// Rust 端目前只有 list_accounts / list_tasks 两个查询命令，articles 表没有对外接口，
// 因此这里做前端持久化；接入后端命令后可平移到 SQLite。

const DRAFT_KEY = 'publishing.drafts.v1';
const IMAGE_KEY = 'publishing.images.v1';

const now = () => Math.floor(Date.now() / 1000);

export function uid(prefix: string): string {
  return `${prefix}_${now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function svgCover(no: number, title: string, sub: string, c1: string, c2: string, accent: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600">
<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>
<rect width="960" height="600" fill="url(#g)"/>
<circle cx="800" cy="110" r="240" fill="${accent}" opacity="0.22"/>
<circle cx="690" cy="500" r="170" fill="#ffffff" opacity="0.07"/>
<path d="M0 470 Q 240 350 480 450 T 960 405" stroke="#ffffff" stroke-opacity="0.22" stroke-width="3" fill="none"/>
<text x="64" y="112" fill="#ffffff" opacity="0.78" font-family="Arial,sans-serif" font-size="18" letter-spacing="4">PUBLISHING / ${String(no).padStart(2, '0')}</text>
<text x="64" y="316" fill="#ffffff" font-family="Arial,sans-serif" font-size="60" font-weight="700">${title}</text>
<text x="64" y="368" fill="#ffffff" opacity="0.82" font-family="Arial,sans-serif" font-size="22">${sub}</text>
<rect x="64" y="418" width="72" height="4" rx="2" fill="#ffffff" opacity="0.75"/>
</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function demoImages(): ImageItem[] {
  const defs: Array<[string, string, string, string, string]> = [
    ['CONTENT OPS', 'Multi-platform workflow', '#4f46e5', '#8b5cf6', '#c4b5fd'],
    ['DEEP WORK', 'Focus on what matters', '#0f766e', '#22c55e', '#a7f3d0'],
    ['DATA VIEW', 'Signals behind growth', '#1d4ed8', '#38bdf8', '#bae6fd'],
    ['CALM SPACE', 'Notes from a quiet desk', '#b45309', '#fbbf24', '#fde68a'],
    ['REVIEW 2026', 'What we learned', '#be123c', '#fb7185', '#fecdd3'],
    ['MINIMAL', 'Less but better', '#334155', '#94a3b8', '#e2e8f0'],
  ];
  return defs.map(([title, sub, c1, c2, accent], i) => {
    const data_url = svgCover(i + 1, title, sub, c1, c2, accent);
    return {
      id: `img_demo_${i + 1}`,
      name: `cover-${String(i + 1).padStart(2, '0')}.svg`,
      data_url,
      width: 960,
      height: 600,
      size: Math.round((data_url.length * 3) / 4),
      created_at: now() - (i + 1) * 86400,
    };
  });
}

export function demoDrafts(): Draft[] {
  return [
    {
      id: 'draft_demo_1',
      title: '把内容分发做成一条流水线',
      author: '内容运营组',
      summary: '从选题、改写、去重到错峰发布，拆解一套可复用的多平台分发流程。',
      category: '效率工具',
      tags: '效率,内容运营,自动化',
      cover_id: 'img_demo_1',
      status: 'ready',
      created_at: now() - 86400 * 2,
      updated_at: now() - 3600 * 3,
      body_markdown: `# 把内容分发做成一条流水线

一篇稿子要发到六个平台，最费人的不是写，而是**重复劳动**：改格式、传封面、调标签、卡时间。

## 先固定输入，再谈自动化

统一一篇文章的字段，后面所有环节才有依据：

- 标题、作者、摘要
- 正文 Markdown 与封面
- 分类与标签
- 目标账号列表

> 输入不统一，自动化只会把混乱放大。

## 四个环节

1. 内容改写：按账号种子做差异处理
2. 相似度检测：发布前算 SimHash
3. 调度：定时、间隔加随机抖动
4. 人工兜底：验证码与选择器缺失时挂起

\`\`\`json
{"type":"interval","every":3600,"jitter":0.2}
\`\`\`

![封面示意](data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'/%3E)

节奏比数量重要。先让流程稳定，再考虑加号。`,
    },
    {
      id: 'draft_demo_2',
      title: '账号垂直化到底该怎么选领域',
      author: '林岚',
      summary: '领域不是标签，是给推荐算法的一条稳定信号。',
      category: '运营方法',
      tags: '垂直化,推荐算法',
      cover_id: 'img_demo_3',
      status: 'draft',
      created_at: now() - 86400 * 5,
      updated_at: now() - 86400,
      body_markdown: `# 账号垂直化到底该怎么选领域

很多人把「领域」当成后台里的一个下拉框，随手选一个就完事。

## 一个判断标准

**能不能连续写三十篇而不换主题？** 能，就是领域；不能，那只是热点。

- 太宽：科技
- 刚好：小团队效率工具
- 太窄：某款软件的某个按钮

## 内容和账号要对齐

文章分类与账号领域不一致时，宁可不发。跨号内容雷同会同时伤害推荐和账号权重。`,
    },
    {
      id: 'draft_demo_3',
      title: '一次验证码事故的完整复盘',
      author: '周叙',
      summary: '自动发布最怕的不是失败，而是失败之后没人知道。',
      category: '复盘',
      tags: '风控,复盘,人工接管',
      cover_id: '',
      status: 'draft',
      created_at: now() - 86400 * 9,
      updated_at: now() - 86400 * 4,
      body_markdown: `# 一次验证码事故的完整复盘

某个账号在半小时内连续触发三次滑块验证，任务全部挂起。

## 发生了什么

- 登录态过期后用旧 Cookie 反复重试
- 多账号在同一时刻集中发布
- 没有及时把状态推给前端

## 改动

1. 验证码出现即置为 \`need_human\`，不自动死等
2. 用同一 user-data-dir 打开可见浏览器交给真人
3. 恢复后从同一队列继续，Cookie 自动复用

> 可观测性比自动化程度更值得先做。

现在看板会直接显示待处理异常数，不用翻日志。`,
    },
  ];
}

function read<T>(key: string, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as T;
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // 忽略损坏的本地数据，回退到演示内容
  }
  return fallback();
}

export function loadDrafts(): Draft[] {
  return read<Draft[]>(DRAFT_KEY, demoDrafts);
}

export function loadImages(): ImageItem[] {
  return read<ImageItem[]>(IMAGE_KEY, demoImages);
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function persistDrafts(drafts: Draft[]): boolean {
  return write(DRAFT_KEY, drafts);
}

export function persistImages(images: ImageItem[]): boolean {
  return write(IMAGE_KEY, images);
}

export function emptyDraft(): Draft {
  const t = now();
  return {
    id: uid('draft'),
    title: '',
    author: '',
    summary: '',
    body_markdown: '',
    category: '',
    tags: '',
    cover_id: '',
    status: 'draft',
    created_at: t,
    updated_at: t,
  };
}

/** 草稿投射为发布页可用的 Article 结构 */
export function draftToArticle(d: Draft): Article {
  return {
    id: d.id,
    title: d.title || '未命名草稿',
    author: d.author,
    summary: d.summary,
    body_markdown: d.body_markdown,
    category: d.category,
    cover_path: d.cover_id,
    tags: d.tags,
    created_at: d.created_at,
  };
}

/** 上传图片：等比缩放到最长边 1600px 并转 JPEG，控制 localStorage 占用 */
export async function fileToImage(file: File): Promise<ImageItem> {
  const raw = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('读取文件失败'));
    fr.readAsDataURL(file);
  });

  let dataUrl = raw;
  let width = 0;
  let height = 0;

  if (/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('图片解析失败'));
      im.src = raw;
    });
    width = img.naturalWidth;
    height = img.naturalHeight;
    const scale = Math.min(1, 1600 / Math.max(width, height, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    }
  }

  return {
    id: uid('img'),
    name: file.name,
    data_url: dataUrl,
    width,
    height,
    size: Math.round((dataUrl.length * 3) / 4),
    created_at: now(),
  };
}
