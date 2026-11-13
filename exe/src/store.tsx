import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  getRuntime,
  invoke,
  isSchedulerRunningMock,
  listen,
  mockEmitTakeover,
} from './tauriBridge';
import { AppContext, type AppStore } from './appContext';
import { DEMO_ARTICLES } from './demoData';
import { draftToArticle, loadDrafts, loadImages, uid } from './contentStorage';
import { contentApi } from './contentApi';
import { toast } from './toast';
import type {
  Account,
  Article,
  Draft,
  DraftStatus,
  ImageItem,
  LicenseStatus,
  LoginSession,
  AccountProfile,
  Takeover,
  Task,
  ViewId,
} from './types';

export function AppProvider({ children }: { children: ReactNode }) {
  const runtime = getRuntime();
  const [view, setView] = useState<ViewId>('dashboard');
  const [search, setSearch] = useState('');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // 浏览器预览用同步初值避免闪烁；Tauri 环境由 reloadContent 异步加载
  const [drafts, setDrafts] = useState<Draft[]>(() => (runtime === 'browser' ? loadDrafts() : []));
  const [images, setImages] = useState<ImageItem[]>(() => (runtime === 'browser' ? loadImages() : []));
  const [backendArticles, setBackendArticles] = useState<Article[]>([]);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editorSession, setEditorSession] = useState(0);
  const [preselectedArticleId, setPreselectedArticleId] = useState<string | null>(null);
  const [selectorPaths, setSelectorPaths] = useState<string[]>([]);

  // 预览：演示文章 + 本地草稿；桌面端：SQLite 中真正可发布的 articles
  const articles = useMemo<Article[]>(
    () =>
      runtime === 'browser'
        ? [...DEMO_ARTICLES, ...drafts.filter((d) => d.title.trim()).map(draftToArticle)]
        : backendArticles,
    [drafts, runtime, backendArticles],
  );

  const [license, setLicense] = useState({
    backend: 'http://localhost:8787',
    key: '',
    valid: false,
    message: '',
    checked: false,
  });

  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [takeover, setTakeover] = useState<Takeover | null>(null);

  const reloadArticles = useCallback(async () => {
    if (runtime !== 'tauri') return;
    const list = await invoke<Article[]>('list_articles');
    setBackendArticles(Array.isArray(list) ? list : []);
  }, [runtime]);

  const reloadContent = useCallback(async () => {
    try {
      const [d, i] = await Promise.all([contentApi.listDrafts(), contentApi.listImages()]);
      setDrafts(d);
      setImages(i);
      await reloadArticles();
    } catch (e) {
      toast('加载内容库失败：' + String(e), 'danger');
    }
  }, [reloadArticles]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [a, t] = await Promise.all([
        invoke<Account[]>('list_accounts'),
        invoke<Task[]>('list_tasks'),
      ]);
      setAccounts(Array.isArray(a) ? a : []);
      setTasks(Array.isArray(t) ? t : []);
      if (runtime === 'browser') setSchedulerRunning(isSchedulerRunningMock());
      await reloadArticles();
    } catch (e) {
      toast('加载数据失败：' + String(e), 'danger');
      setAccounts([]);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [runtime, reloadArticles]);

  useEffect(() => {
    void refresh();
    void reloadContent();
  }, [refresh, reloadContent]);

  useEffect(() => {
    if (runtime !== 'tauri') return;
    void invoke<string[]>('selector_paths')
      .then((p) => setSelectorPaths(Array.isArray(p) ? p : []))
      .catch(() => setSelectorPaths([]));
  }, [runtime]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen<Takeover>('task_need_human', (e) => {
      setTakeover(e.payload);
      toast('有任务需要人工接管', 'warning');
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const setLicenseField = useCallback((field: 'backend' | 'key', value: string) => {
    setLicense((p) => ({ ...p, [field]: value }));
  }, []);

  const verifyLicense = useCallback(async () => {
    try {
      const r = await invoke<LicenseStatus>('verify_license', {
        key: license.key,
        backend: license.backend,
      });
      setLicense((p) => ({ ...p, valid: r.valid, message: r.message, checked: true }));
      toast(r.valid ? '授权校验通过' : r.message, r.valid ? 'success' : 'warning');
    } catch (e) {
      toast('校验失败：' + String(e), 'danger');
    }
  }, [license.key, license.backend]);

  const startScheduler = useCallback(async () => {
    try {
      await invoke('start_scheduler');
      setSchedulerRunning(true);
      toast('调度器已启动', 'success');
    } catch (e) {
      toast('启动失败：' + String(e), 'danger');
    }
  }, []);

  const stopScheduler = useCallback(async () => {
    try {
      await invoke('stop_scheduler');
      setSchedulerRunning(false);
      toast('调度器已停止', 'neutral');
    } catch (e) {
      toast('停止失败：' + String(e), 'danger');
    }
  }, []);

  const addAccount = useCallback(
    async (platform: string, nickname: string, niche: string) => {
      try {
        await invoke<string>('add_account', { platform, nickname, niche });
        await refresh();
        toast('账号已添加：' + nickname, 'success');
        return true;
      } catch (e) {
        toast('添加失败：' + String(e), 'danger');
        return false;
      }
    },
    [refresh],
  );

  const beginAccountLogin = useCallback(
    async (platform: string): Promise<LoginSession> =>
      await invoke<LoginSession>('begin_account_login', { platform }),
    [],
  );

  const fetchAccountProfile = useCallback(
    async (sessionId: string): Promise<AccountProfile> =>
      await invoke<AccountProfile>('fetch_account_profile', { sessionId }),
    [],
  );

  const finishAccountLogin = useCallback(
    async (sessionId: string, nickname: string, niche: string) => {
      try {
        await invoke<string>('finish_account_login', { sessionId, nickname, niche });
        await refresh();
        toast('账号已添加：' + nickname, 'success');
        return true;
      } catch (e) {
        toast('添加失败：' + String(e), 'danger');
        return false;
      }
    },
    [refresh],
  );

  const cancelAccountLogin = useCallback(async (sessionId: string) => {
    try {
      await invoke('cancel_account_login', { sessionId });
    } catch {
      // 关闭浏览器失败不打断用户操作
    }
  }, []);

  const setDedupMode = useCallback(
    async (accountId: string, mode: string) => {
      try {
        await invoke('set_dedup_mode', { accountId, mode });
        setAccounts((prev) =>
          prev.map((a) => (a.id === accountId ? { ...a, dedup_mode: mode } : a)),
        );
        toast('去重策略已更新', 'success');
      } catch (e) {
        toast('更新失败：' + String(e), 'danger');
      }
    },
    [],
  );

  const publishNow = useCallback(
    async (articleId: string, accountId: string) => {
      try {
        const r = await invoke<string>('publish_article', { articleId, accountId });
        toast(r, 'success');
      } catch (e) {
        toast('发布失败：' + String(e), 'danger');
      }
    },
    [],
  );

  const enqueue = useCallback(
    async (articleId: string, accountId: string, mode: string) => {
      try {
        const id = await invoke<string>('enqueue_task', { articleId, accountId, mode });
        await refresh();
        toast('任务已入队：' + id, 'success');
      } catch (e) {
        toast('入队失败：' + String(e), 'danger');
      }
    },
    [refresh],
  );

  const selfTest = useCallback(async () => {
    toast('正在运行端到端自测…', 'info');
    try {
      const r = await invoke<string>('self_test');
      toast(String(r), 'success');
    } catch (e) {
      toast('自测失败：' + String(e), 'danger');
    }
  }, []);

  const openAccountBrowser = useCallback(async (accountId: string) => {
    try {
      await invoke('open_account_browser', { accountId });
      toast('已打开可见浏览器，请人工处理验证码或登录', 'info');
    } catch (e) {
      toast('打开失败：' + String(e), 'danger');
    }
  }, []);

  /** 乐观更新后落盘单条草稿，并刷新可发布文章列表 */
  const persistDraft = useCallback(
    async (d: Draft) => {
      try {
        await contentApi.upsertDraft(d);
        await reloadArticles();
      } catch (e) {
        toast('草稿同步失败：' + String(e), 'danger');
      }
    },
    [reloadArticles],
  );

  const removeDraft = useCallback(
    async (id: string) => {
      try {
        await contentApi.deleteDraft(id);
        await reloadArticles();
      } catch (e) {
        toast('删除失败：' + String(e), 'danger');
      }
    },
    [reloadArticles],
  );

  const reloadSelectors = useCallback(async () => {
    try {
      const r = await invoke<string>('reload_selectors');
      toast(r, 'success');
    } catch (e) {
      toast('选择器加载失败：' + String(e), 'danger');
    }
  }, []);

  const imageById = useCallback(
    (id: string) => images.find((im) => im.id === id),
    [images],
  );

  const openEditor = useCallback((draftId?: string) => {
    setEditingDraftId(draftId ?? null);
    setEditorSession((s) => s + 1);
    setView('editor');
  }, []);

  const saveDraft = useCallback((draft: Draft) => {
    const record: Draft = { ...draft, updated_at: Math.floor(Date.now() / 1000) };
    setDrafts((prev) => {
      const idx = prev.findIndex((d) => d.id === draft.id);
      if (idx === -1) return [record, ...prev];
      const next = [...prev];
      next[idx] = record;
      return next;
    });
    setEditingDraftId(draft.id);
    void persistDraft(record);
  }, [persistDraft]);

  const deleteDraft = useCallback((id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    void removeDraft(id);
  }, [removeDraft]);

  const duplicateDraft = useCallback((id: string) => {
    const src = drafts.find((d) => d.id === id);
    if (!src) return;
    const t = Math.floor(Date.now() / 1000);
    const copy: Draft = {
      ...src,
      id: uid('draft'),
      title: `${src.title || '未命名草稿'}（副本）`,
      status: 'draft',
      created_at: t,
      updated_at: t,
    };
    setDrafts((prev) => [copy, ...prev]);
    void persistDraft(copy);
  }, [drafts, persistDraft]);

  const setDraftStatus = useCallback((id: string, status: DraftStatus) => {
    const src = drafts.find((d) => d.id === id);
    if (!src) return;
    const updated: Draft = { ...src, status, updated_at: Math.floor(Date.now() / 1000) };
    setDrafts((prev) => prev.map((d) => (d.id === id ? updated : d)));
    void persistDraft(updated);
  }, [drafts, persistDraft]);

  const publishDraft = useCallback(async (id: string) => {
    const target = drafts.find((d) => d.id === id);
    if (!target?.title.trim()) {
      toast('请先补上文章标题再发布', 'warning');
      setEditingDraftId(id);
      setView('editor');
      return;
    }
    const updated: Draft = {
      ...target,
      status: 'ready',
      updated_at: Math.floor(Date.now() / 1000),
    };
    setDrafts((prev) => prev.map((d) => (d.id === id ? updated : d)));
    try {
      // 先确保文章写入 SQLite，再跳转发布页，避免发布时查不到
      await contentApi.upsertDraft(updated);
      await reloadArticles();
    } catch (e) {
      toast('同步文章失败：' + String(e), 'danger');
      return;
    }
    setPreselectedArticleId(id);
    setView('articles');
    toast('已标记待发布，请在内容发布页选择目标账号', 'success');
  }, [drafts, reloadArticles]);

  const addImages = useCallback((items: ImageItem[]) => {
    setImages((prev) => [...items, ...prev]);
    void (async () => {
      try {
        for (const im of items) await contentApi.upsertImage(im);
      } catch (e) {
        toast('图片保存失败：' + String(e), 'danger');
      }
    })();
  }, []);

  const deleteImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((im) => im.id !== id));
    setDrafts((prev) => prev.map((d) => (d.cover_id === id ? { ...d, cover_id: '' } : d)));
    void contentApi.deleteImage(id).catch((e) => toast('图片删除失败：' + String(e), 'danger'));
  }, []);

  const dismissTakeover = useCallback(() => setTakeover(null), []);

  const resumeTask = useCallback(async (taskId?: string) => {
    const id = taskId ?? takeover?.task_id;
    if (!id) return;
    try {
      await invoke('resume_task', { taskId: id });
      if (!taskId) setTakeover(null);
      await refresh();
      toast('任务已恢复，调度将重试', 'success');
    } catch (e) {
      toast('恢复失败：' + String(e), 'danger');
    }
  }, [takeover, refresh]);

  const simulateTakeover = useCallback(() => {
    if (runtime !== 'browser') {
      toast('该演示仅在浏览器预览模式可用', 'warning');
      return;
    }
    mockEmitTakeover();
  }, [runtime]);

  const value: AppStore = {
    runtime,
    view,
    setView,
    search,
    setSearch,
    accounts,
    tasks,
    articles,
    loading,
    refresh,
    license,
    setLicenseField,
    verifyLicense,
    schedulerRunning,
    startScheduler,
    stopScheduler,
    addAccount,
    beginAccountLogin,
    fetchAccountProfile,
    finishAccountLogin,
    cancelAccountLogin,
    setDedupMode,
    publishNow,
    enqueue,
    selfTest,
    openAccountBrowser,
    takeover,
    dismissTakeover,
    resumeTask,
    simulateTakeover,
    selectorPaths,
    reloadSelectors,
    drafts,
    images,
    editingDraftId,
    editorSession,
    preselectedArticleId,
    setPreselectedArticleId,
    openEditor,
    saveDraft,
    deleteDraft,
    duplicateDraft,
    setDraftStatus,
    publishDraft,
    addImages,
    deleteImage,
    imageById,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
