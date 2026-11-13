// 与 Rust 端 db/models.rs 保持一致：所有返回字段均为 snake_case

export interface Account {
  id: string;
  platform: string;
  nickname: string;
  niche: string;
  fp_json: string;
  cookie_path: string;
  schedule_policy: string;
  max_per_day: number;
  health: string;
  dedup_mode?: string;
}

export interface Article {
  id: string;
  title: string;
  author: string;
  summary: string;
  body_markdown: string;
  category: string;
  cover_path: string;
  tags: string;
  created_at: number;
}

export interface Task {
  id: string;
  article_id: string;
  account_id: string;
  mode: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'need_human' | string;
  attempts: number;
  next_run: string;
  created_at: number;
}

/** 打开平台登录窗口后返回的会话；session_id 同时是账号 id 与 Cookie 目录名 */
export interface LoginSession {
  session_id: string;
  platform: string;
  url: string;
  port: number;
}

/** 从平台页面回读的账号资料，领域为空时需要用户手工填写 */
export interface AccountProfile {
  nickname: string;
  niche: string;
  url: string;
  title: string;
  need_login: boolean;
}

export interface LicenseStatus {
  valid: boolean;
  message: string;
}

export interface Takeover {
  account_id: string;
  task_id: string;
  reason: string;
  message: string;
  screenshot?: string;
}

export type ViewId =
  | 'dashboard'
  | 'accounts'
  | 'editor'
  | 'drafts'
  | 'gallery'
  | 'articles'
  | 'tasks'
  | 'settings';

export type DraftStatus = 'draft' | 'ready';

/** 草稿：字段对齐 articles 表，另加编辑态元数据 */
export interface Draft {
  id: string;
  title: string;
  author: string;
  summary: string;
  body_markdown: string;
  category: string;
  tags: string;
  cover_id: string;
  status: DraftStatus;
  created_at: number;
  updated_at: number;
}

/** 图库素材：预览模式下以 dataURL 保存在浏览器本地 */
export interface ImageItem {
  id: string;
  name: string;
  data_url: string;
  width: number;
  height: number;
  size: number;
  created_at: number;
}

export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
