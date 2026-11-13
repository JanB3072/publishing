import { getRuntime, invoke } from './tauriBridge';
import { loadDrafts, loadImages, persistDrafts, persistImages } from './contentStorage';
import type { Article, Draft, ImageItem } from './types';

// 内容库访问层：真实 Tauri 环境走 SQLite 命令；浏览器预览降级到 localStorage。
// 这样「文章编写 / 草稿箱 / 图库」在两种环境下都是同一套 UI 与数据流。

const isTauri = getRuntime() === 'tauri';

function upsertLocalDraft(d: Draft): boolean {
  const all = loadDrafts();
  const idx = all.findIndex((x) => x.id === d.id);
  const next = [...all];
  if (idx === -1) next.unshift(d);
  else next[idx] = d;
  return persistDrafts(next);
}

function upsertLocalImage(im: ImageItem): boolean {
  const all = loadImages();
  const idx = all.findIndex((x) => x.id === im.id);
  const next = [...all];
  if (idx === -1) next.unshift(im);
  else next[idx] = im;
  return persistImages(next);
}

export const contentApi = {
  async listArticles(): Promise<Article[]> {
    if (!isTauri) return [];
    return invoke<Article[]>('list_articles');
  },

  async listDrafts(): Promise<Draft[]> {
    if (!isTauri) return [...loadDrafts()].sort((a, b) => b.updated_at - a.updated_at);
    return invoke<Draft[]>('list_drafts');
  },

  async upsertDraft(d: Draft): Promise<void> {
    if (!isTauri) {
      upsertLocalDraft(d);
      return;
    }
    await invoke('upsert_draft', { draft: d });
  },

  async deleteDraft(id: string): Promise<void> {
    if (!isTauri) {
      persistDrafts(loadDrafts().filter((x) => x.id !== id));
      return;
    }
    await invoke('delete_draft', { draftId: id });
  },

  async listImages(): Promise<ImageItem[]> {
    if (!isTauri) return [...loadImages()].sort((a, b) => b.created_at - a.created_at);
    return invoke<ImageItem[]>('list_images');
  },

  async upsertImage(im: ImageItem): Promise<void> {
    if (!isTauri) {
      upsertLocalImage(im);
      return;
    }
    await invoke('upsert_image', { image: im });
  },

  async deleteImage(id: string): Promise<void> {
    if (!isTauri) {
      persistImages(loadImages().filter((x) => x.id !== id));
      persistDrafts(loadDrafts().map((d) => (d.cover_id === id ? { ...d, cover_id: '' } : d)));
      return;
    }
    await invoke('delete_image', { imageId: id });
  },

  /// 打开（或复用）一个可见的 DeepSeek 浏览器窗口，供用户登录一次
  async openDeepseek(): Promise<{ port: number; url: string }> {
    return invoke<{ port: number; url: string }>('open_deepseek');
  },

  /// 用浏览器驱动 DeepSeek 网页版生成文章（不调 API），返回 Markdown 文本
  async generateAiArticle(params: AiGenParams): Promise<string> {
    return invoke<string>('generate_ai_article', { params });
  },
};

/** AI 生成参数：来自编辑器「文章信息」的字段 + 额外要求 + 是否用 R1 + 附件路径 */
export interface AiGenParams {
  title: string;
  author: string;
  category: string;
  summary: string;
  tags: string;
  extra: string;
  useR1: boolean;
  files: string[];
}

export const contentBackend = isTauri ? 'sqlite' : 'localStorage';
