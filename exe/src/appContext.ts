import { createContext, useContext } from 'react';
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

export interface AppStore {
  runtime: 'tauri' | 'browser';
  view: ViewId;
  setView: (v: ViewId) => void;
  search: string;
  setSearch: (s: string) => void;

  accounts: Account[];
  tasks: Task[];
  articles: Article[];
  loading: boolean;
  refresh: () => Promise<void>;

  license: LicenseStatus & { backend: string; key: string; checked: boolean };
  setLicenseField: (field: 'backend' | 'key', value: string) => void;
  verifyLicense: () => Promise<void>;

  schedulerRunning: boolean;
  startScheduler: () => Promise<void>;
  stopScheduler: () => Promise<void>;

  addAccount: (platform: string, nickname: string, niche: string) => Promise<boolean>;
  beginAccountLogin: (platform: string) => Promise<LoginSession>;
  fetchAccountProfile: (sessionId: string) => Promise<AccountProfile>;
  finishAccountLogin: (sessionId: string, nickname: string, niche: string) => Promise<boolean>;
  cancelAccountLogin: (sessionId: string) => Promise<void>;
  setDedupMode: (accountId: string, mode: string) => Promise<void>;
  publishNow: (articleId: string, accountId: string) => Promise<void>;
  enqueue: (articleId: string, accountId: string, mode: string) => Promise<void>;
  selfTest: () => Promise<void>;
  openAccountBrowser: (accountId: string) => Promise<void>;

  takeover: Takeover | null;
  dismissTakeover: () => void;
  resumeTask: (taskId?: string) => Promise<void>;
  simulateTakeover: () => void;

  // 选择器校准
  selectorPaths: string[];
  reloadSelectors: () => Promise<void>;

  // 内容库：草稿箱 / 图库 / 文章编写
  drafts: Draft[];
  images: ImageItem[];
  editingDraftId: string | null;
  editorSession: number;
  preselectedArticleId: string | null;
  setPreselectedArticleId: (id: string | null) => void;
  openEditor: (draftId?: string) => void;
  saveDraft: (draft: Draft) => void;
  deleteDraft: (id: string) => void;
  duplicateDraft: (id: string) => void;
  setDraftStatus: (id: string, status: DraftStatus) => void;
  publishDraft: (id: string) => Promise<void>;
  addImages: (items: ImageItem[]) => void;
  deleteImage: (id: string) => void;
  imageById: (id: string) => ImageItem | undefined;
}

export const AppContext = createContext<AppStore | null>(null);

export function useApp(): AppStore {
  const v = useContext(AppContext);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
