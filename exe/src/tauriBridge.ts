import { demoAccounts, demoTasks } from './demoData';
import type { Account, Takeover, Task } from './types';

// Tauri 调用桥接：在浏览器（非 Tauri）环境下提供带状态的 mock 实现，
// 让管理系统可完整预览交互；在真实 Tauri 窗口中仍走真正的 invoke / listen。

const isTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

export function getRuntime(): 'tauri' | 'browser' {
  return isTauri ? 'tauri' : 'browser';
}

// ---------- 浏览器预览模式的可变演示状态 ----------
let mockAccounts: Account[] = demoAccounts();
let mockTasks: Task[] = demoTasks();
let schedulerRunning = false;
let mockLoginPlatform = 'wechat';

/** 预览模式的平台资料演示数据；niche 为空用于演示「平台未提供领域，需手工填写」 */
const MOCK_LOGIN_PROFILES: Record<string, { nickname: string; niche: string; url: string }> = {
  wechat: { nickname: '效率笔记编辑部', niche: '', url: 'https://mp.weixin.qq.com/' },
  toutiao: { nickname: '科技观察局', niche: '科技数码', url: 'https://mp.toutiao.com/' },
  zhihu: { nickname: '知行者', niche: '职场成长', url: 'https://www.zhihu.com/' },
  xiaohongshu: { nickname: '小红书生活家', niche: '', url: 'https://creator.xiaohongshu.com/' },
  baijiahao: { nickname: '百家观察', niche: '财经', url: 'https://baijiahao.baidu.com/' },
  weibo: { nickname: '微博创作者', niche: '', url: 'https://weibo.com/' },
};

type Handler = (e: { payload: unknown }) => void;
const mockListeners = new Map<string, Set<Handler>>();

/** 浏览器预览下模拟后端推送的 task_need_human 事件 */
export function mockEmitTakeover(overrides: Partial<Takeover> = {}) {
  const payload: Takeover = {
    account_id: mockAccounts[0]?.id ?? 'acc_demo',
    task_id: mockTasks.find((t) => t.status === 'need_human')?.id ?? 'task_demo',
    reason: 'captcha',
    message: '登录态校验触发滑块验证，需要人工在可见浏览器中完成。',
    ...overrides,
  };
  mockListeners.get('task_need_human')?.forEach((h) => h({ payload }));
}

export function isSchedulerRunningMock(): boolean {
  return schedulerRunning;
}

function mockInvoke<T = unknown>(cmd: string, args?: Record<string, unknown>): T {
  const str = (k: string, fallback = '') => String(args?.[k] ?? fallback);
  switch (cmd) {
    case 'verify_license':
      return {
        valid: str('key').trim().length > 0,
        message: str('key').trim()
          ? '（演示）授权有效 · 专业版 · 剩余 268 天'
          : '请输入 License Key',
      } as unknown as T;

    case 'list_accounts':
      return mockAccounts.map((a) => ({ ...a })) as unknown as T;

    case 'add_account': {
      const id = 'acc_' + Math.floor(Date.now() / 1000);
      const acc: Account = {
        id,
        platform: str('platform', 'wechat'),
        nickname: str('nickname') || '未命名账号',
        niche: str('niche') || '未分类',
        fp_json: JSON.stringify({ ua: 'Mozilla/5.0', tz: 'Asia/Shanghai', w: 1440, h: 900 }),
        cookie_path: `./profiles/${id}/cookies`,
        schedule_policy: '',
        max_per_day: 2,
        health: '',
        dedup_mode: 'content',
      };
      mockAccounts = [acc, ...mockAccounts];
      return id as unknown as T;
    }

    case 'set_dedup_mode': {
      const id = str('accountId');
      const mode = str('mode', 'content');
      mockAccounts = mockAccounts.map((a) => (a.id === id ? { ...a, dedup_mode: mode } : a));
      return undefined as unknown as T;
    }

    case 'publish_article':
      return (
        '（演示）已提交发布：文章 ' +
        str('articleId', '—') +
        ' → 账号 ' +
        str('accountId', '—') +
        '，适配器返回 submitted'
      ) as unknown as T;

    case 'enqueue_task': {
      const now = Math.floor(Date.now() / 1000);
      const id = `t${now}_${Math.random().toString(36).slice(2, 6)}`;
      const task: Task = {
        id,
        article_id: str('articleId'),
        account_id: str('accountId'),
        mode: str('mode', '{"type":"immediate"}'),
        status: 'pending',
        attempts: 0,
        next_run: String(now + 60),
        created_at: now,
      };
      mockTasks = [task, ...mockTasks];
      return id as unknown as T;
    }

    case 'list_tasks':
      return mockTasks.map((t) => ({ ...t })) as unknown as T;

    case 'start_scheduler':
      schedulerRunning = true;
      return undefined as unknown as T;

    case 'stop_scheduler':
      schedulerRunning = false;
      return undefined as unknown as T;

    case 'resume_task': {
      const id = str('taskId');
      mockTasks = mockTasks.map((t) =>
        t.id === id ? { ...t, status: 'pending', next_run: String(Math.floor(Date.now() / 1000)) } : t,
      );
      return undefined as unknown as T;
    }

    case 'reload_selectors':
      return '（预览模式）选择器请在 src-tauri/selectors.toml 校准，启动桌面端后点此生效' as unknown as T;

    case 'selector_paths':
      return ['src-tauri/selectors.toml'] as unknown as T;

    case 'begin_account_login': {
      mockLoginPlatform = str('platform', 'wechat');
      const p = MOCK_LOGIN_PROFILES[mockLoginPlatform] ?? MOCK_LOGIN_PROFILES.wechat;
      const sessionId = 'acc_' + Math.floor(Date.now() / 1000);
      return {
        session_id: sessionId,
        platform: mockLoginPlatform,
        url: p.url,
        port: 0,
      } as unknown as T;
    }

    case 'fetch_account_profile': {
      const p = MOCK_LOGIN_PROFILES[mockLoginPlatform] ?? MOCK_LOGIN_PROFILES.wechat;
      return {
        nickname: p.nickname,
        niche: p.niche,
        url: p.url,
        title: '创作者中心（演示）',
        need_login: false,
      } as unknown as T;
    }

    case 'finish_account_login': {
      const id = str('sessionId');
      const acc: Account = {
        id,
        platform: mockLoginPlatform,
        nickname: str('nickname'),
        niche: str('niche'),
        fp_json: '',
        cookie_path: `./profiles/${id}/cookies`,
        schedule_policy: '',
        max_per_day: 2,
        health: '',
        dedup_mode: 'content',
      };
      mockAccounts = [acc, ...mockAccounts];
      return id as unknown as T;
    }

    case 'cancel_account_login':
      return undefined as unknown as T;

    case 'open_account_browser':
    case 'self_test':
      return (cmd === 'self_test'
        ? 'self_test: submit=submitted status="published" published=true （演示模式：跳过 CDP，模拟通过）'
        : undefined) as unknown as T;

    case 'open_deepseek':
      return { port: 0, url: 'https://chat.deepseek.com/' } as unknown as T;

    case 'generate_ai_article': {
      const p = (args?.params ?? {}) as Record<string, unknown>;
      const title = String(p.title ?? '');
      const category = String(p.category ?? '');
      const tags = String(p.tags ?? '');
      const extra = String(p.extra ?? '');
      return (
        `# ${title || '未命名文章'}\n\n` +
        `（演示）以下为通过浏览器驱动 DeepSeek 网页版生成的示例内容。\n\n` +
        (category ? `> 领域：${category}\n\n` : '') +
        `## 核心要点\n- 第一点：先讲清楚背景与痛点。\n- 第二点：给出可落地的步骤。\n- 第三点：用案例佐证结论。\n\n` +
        (tags ? `## 标签\n${tags}\n\n` : '') +
        (extra ? `## 额外要求\n${extra}\n\n` : '') +
        `## 小结\n把复杂的事拆成小步，一步步做就对了。`
      ) as unknown as T;
    }

    default:
      return undefined as unknown as T;
  }
}

export async function invoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri) {
    await new Promise((r) => setTimeout(r, 260));
    return mockInvoke<T>(cmd, args);
  }
  // v2 正确路径：@tauri-apps/api/core（v1 的 /tauri 子路径不存在）
  const { invoke: realInvoke } = await import('@tauri-apps/api/core');
  return realInvoke<T>(cmd, args);
}

export async function listen<T = unknown>(
  event: string,
  handler: (e: { payload: T }) => void,
): Promise<() => void> {
  if (!isTauri) {
    let set = mockListeners.get(event);
    if (!set) {
      set = new Set();
      mockListeners.set(event, set);
    }
    const h = handler as Handler;
    set.add(h);
    return () => set?.delete(h);
  }
  const { listen: realListen } = await import('@tauri-apps/api/event');
  return realListen<T>(event, handler);
}
