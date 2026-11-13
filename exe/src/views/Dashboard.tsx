import { useMemo } from 'react';
import { useApp } from '../appContext';
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar, StatCard } from '../ui';
import { Icon } from '../icons';
import { PLATFORM_META, platformLabel, statusLabel, statusTone, timeAgo } from '../meta';
import type { Tone } from '../types';

const toneColor: Record<Tone, string> = {
  primary: '#5b5bd6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  neutral: '#94a3b8',
};

export default function Dashboard() {
  const { accounts, tasks, articles, license, schedulerRunning, refresh, setView, selfTest, runtime, loading } = useApp();

  const stats = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const todaySec = Math.floor(d.getTime() / 1000);
    const success = tasks.filter((t) => t.status === 'success').length;
    return {
      total: accounts.length,
      today: tasks.filter((t) => t.status === 'success' && t.created_at >= todaySec).length,
      rate: tasks.length ? Math.round((success / tasks.length) * 100) : 0,
      alerts: tasks.filter((t) => t.status === 'need_human' || t.status === 'failed').length,
      articles: articles.length,
    };
  }, [accounts, tasks, articles]);

  const trend = useMemo(() => {
    const keys = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (6 - i));
      return Math.floor(d.getTime() / 1000);
    });
    const counts = keys.map((start, i) => {
      const end = i < 6 ? keys[i + 1] : Number.POSITIVE_INFINITY;
      return tasks.filter((t) => t.created_at >= start && t.created_at < end).length;
    });
    const labels = keys.map((k) => {
      const d = new Date(k * 1000);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    return { counts, labels };
  }, [tasks]);

  const distribution = useMemo(() => {
    const grouped = new Map<string, number>();
    accounts.forEach((a) => grouped.set(a.platform, (grouped.get(a.platform) ?? 0) + 1));
    const rows = [...grouped.entries()].map(([key, count]) => ({
      key,
      label: platformLabel(key),
      tone: (PLATFORM_META[key]?.tone ?? 'neutral') as Tone,
      count,
    }));
    return { rows, max: Math.max(...rows.map((r) => r.count), 1) };
  }, [accounts]);

  const recent = useMemo(
    () => [...tasks].sort((a, b) => b.created_at - a.created_at).slice(0, 5),
    [tasks],
  );

  const W = 620;
  const H = 150;
  const P = 12;
  const max = Math.max(...trend.counts, 1);
  const pts = trend.counts.map((v, i) => [
    P + (i * (W - 2 * P)) / 6,
    H - P - (v / max) * (H - 2 * P),
  ]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)},${H - P} L ${pts[0][0].toFixed(1)},${H - P} Z`;

  const articleTitle = (id: string) => articles.find((a) => a.id === id)?.title ?? id;
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.nickname ?? id;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="工作台"
        desc="多平台内容分发全景：账号、任务与发布节奏一目了然。"
        action={
          <Button icon="refresh" onClick={() => void refresh()} loading={loading}>
            刷新数据
          </Button>
        }
      />

      <div className="stat-grid">
        <StatCard label="接入账号" value={stats.total} hint="独立浏览器 Profile 隔离" icon="users" tone="primary" spark={[2, 3, 3, 4, 5, 5, stats.total || 0]} />
        <StatCard label="今日已发布" value={stats.today} hint={`文章库 ${stats.articles} 篇`} icon="send" tone="success" spark={trend.counts} />
        <StatCard label="任务成功率" value={`${stats.rate}%`} hint={`共 ${tasks.length} 条任务记录`} icon="trending" tone="info" spark={[70, 78, 74, 85, 88, 92, stats.rate]} />
        <StatCard label="待处理异常" value={stats.alerts} hint="失败 / 需人工接管" icon="alert" tone={stats.alerts > 0 ? 'warning' : 'neutral'} spark={[0, 1, 0, 2, 1, 1, stats.alerts]} />
      </div>

      <div className="dash-grid">
        <Card
          title="发布趋势"
          subtitle="近 7 天任务量分布"
          action={<Badge tone="primary" dot>近 7 天</Badge>}
        >
          <svg className="trend-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c5cff" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#7c5cff" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3].map((i) => {
              const y = P + (i * (H - 2 * P)) / 3;
              return <line key={i} x1={P} y1={y} x2={W - P} y2={y} stroke="#eef1f7" strokeWidth="1" strokeDasharray="4 5" />;
            })}
            <path d={area} fill="url(#trendFill)" />
            <path d={line} fill="none" stroke="#6d5ce7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {pts.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r="3.4" fill="#fff" stroke="#6d5ce7" strokeWidth="2" />
            ))}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            {trend.labels.map((l) => (
              <span key={l} style={{ fontSize: 11, color: '#98a2b3' }}>{l}</span>
            ))}
          </div>
          <div className="chart-legend">
            <span><i />每日任务数</span>
            <span style={{ marginLeft: 'auto' }}>峰值 {max} 条</span>
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="平台分布" subtitle="按已接入账号数量">
            {distribution.rows.length === 0 ? (
              <EmptyState icon="layers" title="暂无账号" desc="添加账号后这里会显示平台分布。" />
            ) : (
              <div className="dist-list">
                {distribution.rows.map((r) => (
                  <div className="dist-row" key={r.key}>
                    <div className="dist-row__top">
                      <span className="dist-row__name">
                        <i className="dist-row__dot" style={{ background: toneColor[r.tone] }} />
                        {r.label}
                      </span>
                      <span className="dist-row__val">{r.count} 个账号</span>
                    </div>
                    <ProgressBar value={(r.count / distribution.max) * 100} tone={r.tone} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="系统状态">
            <div className="kv"><span className="kv__key">调度器</span><span className="kv__val"><Badge tone={schedulerRunning ? 'success' : 'neutral'} dot>{schedulerRunning ? '运行中' : '已停止'}</Badge></span></div>
            <div className="kv"><span className="kv__key">运行环境</span><span className="kv__val">{runtime === 'tauri' ? 'Tauri 桌面端' : '浏览器预览'}</span></div>
            <div className="kv"><span className="kv__key">授权状态</span><span className="kv__val"><Badge tone={license.valid ? 'success' : 'warning'} dot>{license.valid ? '已激活' : '未校验'}</Badge></span></div>
            <div className="kv"><span className="kv__key">端到端自测</span><span className="kv__val"><Button size="sm" variant="ghost" icon="activity" onClick={() => void selfTest()}>运行</Button></span></div>
          </Card>
        </div>
      </div>

      <Card
        title="最近任务"
        subtitle="最新 5 条发布任务"
        padded={false}
        action={<Button size="sm" variant="ghost" onClick={() => setView('tasks')}>查看全部 <Icon name="chevron" size={14} /></Button>}
      >
        {recent.length === 0 ? (
          <EmptyState icon="list" title="暂无任务" desc="在「内容发布」中创建一条发布任务。" />
        ) : (
          <div className="mini-list">
            {recent.map((t) => (
              <div className="mini-item" key={t.id}>
                <span className="mini-item__icon"><Icon name="file" size={15} /></span>
                <div className="mini-item__main">
                  <div className="mini-item__title">{articleTitle(t.article_id)}</div>
                  <div className="mini-item__sub">{accountName(t.account_id)} · 尝试 {t.attempts} 次</div>
                </div>
                <Badge tone={statusTone(t.status)} dot>{statusLabel(t.status)}</Badge>
                <span className="mini-item__time" style={{ marginLeft: 6 }}>{timeAgo(t.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
