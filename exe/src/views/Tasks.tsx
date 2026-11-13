import { useMemo, useState } from 'react';
import { useApp } from '../appContext';
import { Badge, Button, Card, EmptyState, PageHeader } from '../ui';
import { Icon } from '../icons';
import { formatMode, formatTime, statusLabel, statusTone } from '../meta';

const FILTERS = [
  ['all', '全部'],
  ['pending', '等待中'],
  ['running', '执行中'],
  ['success', '已发布'],
  ['failed', '失败'],
  ['need_human', '需人工'],
] as const;

export default function Tasks() {
  const {
    tasks, accounts, articles, search, schedulerRunning, startScheduler, stopScheduler,
    refresh, selfTest, openAccountBrowser, resumeTask, simulateTakeover, runtime, loading,
  } = useApp();
  const [filter, setFilter] = useState<string>('all');

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    tasks.forEach((t) => m.set(t.status, (m.get(t.status) ?? 0) + 1));
    return m;
  }, [tasks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...tasks]
      .filter((t) => filter === 'all' || t.status === filter)
      .filter((t) => {
        if (!q) return true;
        const title = articles.find((a) => a.id === t.article_id)?.title ?? '';
        const nick = accounts.find((a) => a.id === t.account_id)?.nickname ?? '';
        return [t.id, t.article_id, t.account_id, title, nick].some((v) => v.toLowerCase().includes(q));
      })
      .sort((a, b) => b.created_at - a.created_at);
  }, [tasks, filter, search, articles, accounts]);

  const articleTitle = (id: string) => articles.find((a) => a.id === id)?.title ?? id;
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.nickname ?? id;

  return (
    <>
      <PageHeader
        eyebrow="Scheduler"
        title="任务调度"
        desc="队列持久化在本地 SQLite，支持定时、间隔错峰、日频上限与失败重试。"
        action={
          schedulerRunning ? (
            <Button icon="pause" onClick={() => void stopScheduler()}>停止调度</Button>
          ) : (
            <Button variant="primary" icon="play" onClick={() => void startScheduler()}>启动调度</Button>
          )
        }
      />

      <div className="toolbar">
        <div className="toolbar__left">
          <div className="filter-pills">
            {FILTERS.map(([k, label]) => (
              <button key={k} className={`pill ${filter === k ? 'pill--active' : ''}`} onClick={() => setFilter(k)}>
                {label}{k === 'all' ? ` ${tasks.length}` : counts.get(k) ? ` ${counts.get(k)}` : ''}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar__right">
          <Badge tone={schedulerRunning ? 'success' : 'neutral'} dot>{schedulerRunning ? '调度运行中' : '调度已停止'}</Badge>
          {runtime === 'browser' && (
            <Button size="sm" variant="ghost" icon="alert" onClick={simulateTakeover}>模拟接管事件</Button>
          )}
          <Button size="sm" icon="activity" onClick={() => void selfTest()}>端到端自测</Button>
          <Button size="sm" icon="refresh" onClick={() => void refresh()} loading={loading}>刷新</Button>
        </div>
      </div>

      <Card padded={false}>
        {filtered.length === 0 ? (
          <EmptyState
            icon="list"
            title={tasks.length === 0 ? '队列里还没有任务' : '当前筛选下没有任务'}
            desc={tasks.length === 0 ? '在「内容发布」中创建一条发布任务，或先启动调度器。' : '切换上方状态筛选查看其他任务。'}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>任务</th>
                  <th>文章 / 账号</th>
                  <th>调度模式</th>
                  <th>状态</th>
                  <th>时间 / 重试</th>
                  <th style={{ textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className="table__mono">{t.id.length > 20 ? t.id.slice(0, 20) + '…' : t.id}</div>
                    </td>
                    <td>
                      <div className="table__strong" style={{ maxWidth: 210, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{articleTitle(t.article_id)}</div>
                      <div className="table__sub">{accountName(t.account_id)}</div>
                    </td>
                    <td style={{ color: '#667085', whiteSpace: 'nowrap' }}>{formatMode(t.mode)}</td>
                    <td><Badge tone={statusTone(t.status)} dot>{statusLabel(t.status)}</Badge></td>
                    <td style={{ color: '#667085', whiteSpace: 'nowrap' }}>
                      {formatTime(t.created_at)}
                      <div className="table__sub">重试 {t.attempts} 次 · 下次 {formatTime(t.next_run)}</div>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Button size="sm" variant="ghost" icon="external" title="打开该账号的可见浏览器" onClick={() => void openAccountBrowser(t.account_id)} />
                        <Button size="sm" variant="secondary" icon="refresh" title="重新排队执行" onClick={() => void resumeTask(t.id)}>
                          重跑
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="callout" style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Icon name="info" size={16} style={{ flex: '0 0 auto', marginTop: 2, color: '#3b82f6' }} />
        <span>任务状态：<b>pending</b> 等待中 / <b>running</b> 执行中 / <b>success</b> 已发布 / <b>failed</b> 失败 / <b>need_human</b> 需人工接管。遇到验证码或选择器缺失时会自动挂起并弹出接管面板。</span>
      </div>
    </>
  );
}
