import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../appContext';
import { Badge, Button, Card, Field, PageHeader } from '../ui';
import { Icon, type IconName } from '../icons';
import { ImagePicker } from '../components/ImagePicker';
import AiGenerateModal, { type InsertMode } from '../components/AiGenerateModal';
import { emptyDraft } from '../contentStorage';
import { readingMinutes, renderMarkdown, wordCount } from '../markdown';
import { formatTime } from '../meta';
import { toast } from '../toast';
import type { Draft, DraftStatus } from '../types';

type PaneMode = 'split' | 'write' | 'preview';

export default function Editor() {
  const {
    drafts, editingDraftId, images, imageById,
    saveDraft, publishDraft, openEditor,
  } = useApp();

  // Views 会按 editingDraftId 给本组件设 key，切换目标时重新挂载
  const [draft, setDraft] = useState<Draft>(() => {
    const found = drafts.find((d) => d.id === editingDraftId);
    return found ? { ...found } : emptyDraft();
  });
  const [mode, setMode] = useState<PaneMode>('split');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const cover = draft.cover_id ? imageById(draft.cover_id) : undefined;
  const words = useMemo(() => wordCount(draft.body_markdown), [draft.body_markdown]);
  const minutes = useMemo(() => readingMinutes(draft.body_markdown), [draft.body_markdown]);
  const previewHtml = useMemo(
    () => renderMarkdown(draft.body_markdown || '> 从左边开始写，这里会实时显示排版效果。'),
    [draft.body_markdown],
  );

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  // 停止输入 2.2 秒后自动落盘
  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => {
      saveDraft(draft);
      setDirty(false);
      setSavedAt(Math.floor(Date.now() / 1000));
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, saveDraft]);

  function save(status?: DraftStatus) {
    const next: Draft = status ? { ...draft, status } : draft;
    setDraft(next);
    saveDraft(next);
    setDirty(false);
    setSavedAt(Math.floor(Date.now() / 1000));
    toast(status === 'ready' ? '已标记为待发布' : '草稿已保存', 'success');
  }

  function insertAtCursor(before: string, after = '', placeholder = '') {
    const ta = textareaRef.current;
    const s = ta?.selectionStart ?? draft.body_markdown.length;
    const e = ta?.selectionEnd ?? s;
    const sel = draft.body_markdown.slice(s, e) || placeholder;
    const text = before + sel + after;
    update('body_markdown', draft.body_markdown.slice(0, s) + text + draft.body_markdown.slice(e));
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  }

  function linePrefix(prefix: string) {
    const ta = textareaRef.current;
    const s = ta?.selectionStart ?? 0;
    const lineStart = draft.body_markdown.lastIndexOf('\n', s - 1) + 1;
    update('body_markdown', draft.body_markdown.slice(0, lineStart) + prefix + draft.body_markdown.slice(lineStart));
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(s + prefix.length, s + prefix.length);
    });
  }

  function insertAi(text: string, mode: InsertMode) {
    if (mode === 'replace') {
      update('body_markdown', text);
    } else {
      const cur = draft.body_markdown;
      const sep = cur.trim() ? '\n\n' : '';
      update('body_markdown', cur.trimEnd() + sep + text);
    }
    setAiOpen(false);
    toast('已插入 AI 生成内容', 'success');
  }

  const tools: Array<{ icon: IconName; title: string; run: () => void }> = [
    { icon: 'heading', title: '二级标题', run: () => linePrefix('## ') },
    { icon: 'bold', title: '加粗', run: () => insertAtCursor('**', '**', '重点') },
    { icon: 'italic', title: '斜体', run: () => insertAtCursor('*', '*', '强调') },
    { icon: 'list', title: '无序列表', run: () => linePrefix('- ') },
    { icon: 'quote', title: '引用', run: () => linePrefix('> ') },
    { icon: 'link', title: '链接', run: () => insertAtCursor('[', '](https://)', '链接文字') },
    { icon: 'image', title: '插入图片', run: () => insertAtCursor('![', '](图片地址)', '图片说明') },
    { icon: 'code', title: '代码块', run: () => insertAtCursor('\n```\n', '\n```\n', '代码') },
    { icon: 'file', title: '分割线', run: () => insertAtCursor('\n---\n', '', '') },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Compose"
        title="文章编写"
        desc="Markdown 写作、实时预览，草稿自动保存在本地。"
        action={
          <>
            <Badge tone={draft.status === 'ready' ? 'success' : 'neutral'} dot>
              {draft.status === 'ready' ? '待发布' : '草稿'}
            </Badge>
            <Button icon="sparkles" onClick={() => setAiOpen(true)}>AI 生成</Button>
            <Button icon="plus" onClick={() => openEditor()}>新建</Button>
            <Button variant="primary" icon="save" onClick={() => save()}>保存草稿</Button>
          </>
        }
      />

      <div className="editor-meta">
        <Card title="文章信息" subtitle="这些信息会随文章一起投递到各平台">
          <Field label="标题">
            <input className="input" value={draft.title} onChange={(e) => update('title', e.target.value)} placeholder="给这篇文章起个名字" />
          </Field>
          <div className="form-row">
            <Field label="作者">
              <input className="input" value={draft.author} onChange={(e) => update('author', e.target.value)} placeholder="署名" />
            </Field>
            <Field label="分类 / 领域" hint="用于按领域路由到对应账号">
              <input className="input" value={draft.category} onChange={(e) => update('category', e.target.value)} placeholder="例如：效率工具" />
            </Field>
          </div>
          <Field label="摘要">
            <textarea className="textarea" value={draft.summary} onChange={(e) => update('summary', e.target.value)} placeholder="一两句话概括文章内容" />
          </Field>
          <Field label="标签" hint="用英文逗号分隔，例如：效率,内容运营">
            <input className="input" value={draft.tags} onChange={(e) => update('tags', e.target.value)} placeholder="效率,内容运营" />
          </Field>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="封面" subtitle="从图库选用，删除素材时会自动解除引用">
            <div className="cover-box">
              {cover ? (
                <img src={cover.data_url} alt={cover.name} />
              ) : (
                <div className="cover-box__empty">
                  <Icon name="image" size={28} />
                  <span>尚未设置封面</span>
                </div>
              )}
            </div>
            <div className="cover-box__meta">{cover ? cover.name : '封面会出现在文章预览顶部'}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Button size="sm" variant="primary" icon="image" onClick={() => setPickerOpen(true)}>从图库选择</Button>
              {cover && <Button size="sm" icon="x" onClick={() => update('cover_id', '')}>移除</Button>}
            </div>
          </Card>

          <Card title="写作状态">
            <div className="kv"><span className="kv__key">正文字数</span><span className="kv__val">{words} 字</span></div>
            <div className="kv"><span className="kv__key">预计阅读</span><span className="kv__val">{minutes} 分钟</span></div>
            <div className="kv"><span className="kv__key">图库素材</span><span className="kv__val">{images.length} 张</span></div>
            <div className="kv"><span className="kv__key">创建时间</span><span className="kv__val">{formatTime(draft.created_at)}</span></div>
            <div className="kv">
              <span className="kv__key">保存状态</span>
              <span className="kv__val">
                <Badge tone={dirty ? 'warning' : 'success'} dot>
                  {dirty ? '正在编辑…' : savedAt ? '已自动保存' : '已是最新'}
                </Badge>
              </span>
            </div>
          </Card>
        </div>
      </div>

      <Card
        title="正文"
        subtitle="支持标题、列表、引用、链接、图片与代码块"
        className="card--spaced"
        action={
          <div className="seg">
            {([
              ['split', '分栏', 'columns'],
              ['write', '编辑', 'edit'],
              ['preview', '预览', 'eye'],
            ] as [PaneMode, string, IconName][]).map(([k, label, icon]) => (
              <button key={k} className={`seg__item ${mode === k ? 'seg__item--active' : ''}`} onClick={() => setMode(k)}>
                <Icon name={icon} size={13} /> {label}
              </button>
            ))}
          </div>
        }
      >
        <div className="md-toolbar">
          {tools.map((t) => (
            <button key={t.title} className="md-tool" title={t.title} onClick={t.run}>
              <Icon name={t.icon} size={15} />
            </button>
          ))}
          <span className="md-toolbar__hint">Markdown</span>
        </div>

        <div className={`editor-panes editor-panes--${mode}`}>
          {mode !== 'preview' && (
            <textarea
              ref={textareaRef}
              className="md-editor"
              value={draft.body_markdown}
              onChange={(e) => update('body_markdown', e.target.value)}
              placeholder={'# 从这里开始\n\n用 **Markdown** 写作，右侧会实时排版。'}
              spellCheck={false}
            />
          )}
          {mode !== 'write' && (
            <div className="md-preview">
              <div className="md-preview__head">
                <h1>{draft.title || '未命名文章'}</h1>
                <div className="md-preview__byline">
                  {draft.author || '佚名'} · {draft.category || '未分类'} · {minutes} 分钟阅读
                </div>
                {draft.summary && <p className="md-preview__summary">{draft.summary}</p>}
                {cover && <img className="md-preview__cover" src={cover.data_url} alt="封面" />}
              </div>
              <div className="prose" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          )}
        </div>

        <div className="editor-foot">
          <span>{words} 字 · {minutes} 分钟阅读 · 本地自动保存</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button size="sm" icon="save" onClick={() => save()}>保存</Button>
            <Button size="sm" icon="check" onClick={() => save('ready')}>标记待发布</Button>
            <Button size="sm" variant="primary" icon="send" onClick={() => { saveDraft(draft); publishDraft(draft.id); }}>去发布</Button>
          </div>
        </div>
      </Card>

      <ImagePicker
        open={pickerOpen}
        currentId={draft.cover_id}
        onClose={() => setPickerOpen(false)}
        onSelect={(id) => {
          update('cover_id', id);
          toast('封面已设置', 'success');
        }}
      />

      <AiGenerateModal
        open={aiOpen}
        article={{
          title: draft.title,
          author: draft.author,
          category: draft.category,
          summary: draft.summary,
          tags: draft.tags,
        }}
        onClose={() => setAiOpen(false)}
        onInsert={insertAi}
      />
    </>
  );
}
