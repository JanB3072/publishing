import { useMemo, useState } from 'react';
import { useApp } from '../appContext';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, StatCard } from '../ui';
import { Icon } from '../icons';
import { wordCount } from '../markdown';
import { formatTime, timeAgo } from '../meta';
import { toast } from '../toast';
import type { Draft } from '../types';

type Filter = 'all' | 'draft' | 'ready';

export default function Drafts() {
  const {
    drafts, search, openEditor, deleteDraft, duplicateDraft, setDraftStatus, publishDraft, imageById,
  } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [pendingDelete, setPendingDelete] = useState<Draft | null>(null);

  const stats = useMemo(() => ({
    all: drafts.length,
    draft: drafts.filter((d) => d.status === 'draft').length,
    ready: drafts.filter((d) => d.status === 'ready').length,
    words: drafts.reduce((sum, d) => sum + wordCount(d.body_markdown), 0),
  }), [drafts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...drafts]
      .filter((d) => filter === 'all' || d.status === filter)
      .filter((d) => !q || [d.title, d.author, d.category, d.tags, d.summary].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => b.updated_at - a.updated_at);
  }, [drafts, filter, search]);

  return (
    <>
      <PageHeader
        eyebrow="Drafts"
        title="草稿箱"
        desc="本地保存的写作进度，可随时继续编辑、标记待发布或投放到发布队列。"
        action={<Button variant="primary" icon="plus" onClick={() => openEditor()}>新建草稿</Button>}
      />

      <div className="stat-grid">
        <StatCard label="全部草稿" value={stats.all} hint="保存在浏览器本地" icon="draft" tone="primary" />
        <StatCard label="写作中" value={stats.draft} hint="尚未标记发布" icon="edit" tone="neutral" />
        <StatCard label="待发布" value={stats.ready} hint="可直接投放账号" icon="check" tone="success" />
        <StatCard label="累计字数" value={stats.words.toLocaleString()} hint="按中文字符与英文词计" icon="activity" tone="info" />
      </div>

      <div className="toolbar">
        <div className="toolbar__left">
          <div className="filter-pills">
            {([
              ['all', `全部 ${stats.all}`],
              ['draft', `写作中 ${stats.draft}`],
              ['ready', `待发布 ${stats.ready}`],
            ] as [Filter, string][]).map(([k, label]) => (
              <button key={k} className={`pill ${filter === k ? 'pill--active' : ''}`} onClick={() => setFilter(k)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="toolbar__right">
          <Button size="sm" icon="image" onClick={() => openEditor()}>继续写作</Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon="draft"
            title={drafts.length === 0 ? '草稿箱是空的' : '当前筛选下没有草稿'}
            desc={drafts.length === 0 ? '新建一篇草稿，写作过程会自动保存。' : '切换上方筛选或换个搜索词。'}
            action={<Button variant="primary" icon="plus" onClick={() => openEditor()}>新建草稿</Button>}
          />
        </Card>
      ) : (
        <div className="draft-list">
          {filtered.map((d) => {
            const cover = d.cover_id ? imageById(d.cover_id) : undefined;
            return (
              <div className="draft-row" key={d.id}>
                <div className="draft-row__cover">
                  {cover ? <img src={cover.data_url} alt={d.title} /> : <Icon name="draft" size={22} />}
                </div>
                <div className="draft-row__main">
                  <div className="draft-row__title">
                    {d.title || '未命名草稿'}
                    <Badge tone={d.status === 'ready' ? 'success' : 'neutral'} dot>
                      {d.status === 'ready' ? '待发布' : '写作中'}
                    </Badge>
                  </div>
                  <div className="draft-row__summary">{d.summary || '暂无摘要'}</div>
                  <div className="draft-row__meta">
                    {d.category && <Badge tone="primary">{d.category}</Badge>}
                    <span>{d.author || '佚名'}</span>
                    <span>·</span>
                    <span>{wordCount(d.body_markdown)} 字</span>
                    <span>·</span>
                    <span>更新于 {timeAgo(d.updated_at)}</span>
                    <span>·</span>
                    <span>{formatTime(d.created_at)} 创建</span>
                  </div>
                </div>
                <div className="draft-row__actions">
                  <Button size="sm" variant="secondary" icon="edit" onClick={() => openEditor(d.id)}>编辑</Button>
                  <Button size="sm" variant="ghost" icon={d.status === 'ready' ? 'refresh' : 'pin'} title={d.status === 'ready' ? '退回草稿' : '标记待发布'} onClick={() => {
                    const next = d.status === 'ready' ? 'draft' : 'ready';
                    setDraftStatus(d.id, next);
                    toast(next === 'ready' ? '已标记待发布' : '已退回写作中', 'success');
                  }} />
                  <Button size="sm" variant="ghost" icon="copy" title="复制草稿" onClick={() => { duplicateDraft(d.id); toast('已创建副本', 'success'); }} />
                  <Button size="sm" variant="ghost" icon="trash" title="删除" onClick={() => setPendingDelete(d)} />
                  <Button size="sm" variant="primary" icon="send" onClick={() => publishDraft(d.id)}>去发布</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!pendingDelete}
        title="删除这篇草稿？"
        subtitle="删除后无法恢复，图库中的封面素材不会被删除。"
        onClose={() => setPendingDelete(null)}
        width={440}
        footer={
          <>
            <Button onClick={() => setPendingDelete(null)}>取消</Button>
            <Button variant="danger" icon="trash" onClick={() => {
              if (pendingDelete) {
                deleteDraft(pendingDelete.id);
                toast('草稿已删除', 'neutral');
              }
              setPendingDelete(null);
            }}>确认删除</Button>
          </>
        }
      >
        <div className="hint-box hint-box--warn">
          <Icon name="alert" size={16} />
          <span>{pendingDelete?.title || '未命名草稿'}</span>
        </div>
      </Modal>
    </>
  );
}
