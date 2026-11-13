import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../appContext';
import { Badge, Button, Card, EmptyState, Field, PageHeader } from '../ui';
import { Icon } from '../icons';
import { formatTime, platformShort } from '../meta';
import { toast } from '../toast';

type ModeType = 'immediate' | 'fixed' | 'interval';

export default function Articles() {
  const {
    articles, accounts, publishNow, enqueue, runtime,
    preselectedArticleId, setPreselectedArticleId,
  } = useApp();
  const [articleId, setArticleId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [modeType, setModeType] = useState<ModeType>('immediate');
  const [fixedAt, setFixedAt] = useState('');
  const [everyMin, setEveryMin] = useState(60);
  const [jitter, setJitter] = useState(20);
  const [busy, setBusy] = useState(false);

  // 从草稿箱「去发布」过来时，直接选中那篇草稿
  useEffect(() => {
    if (preselectedArticleId) {
      setArticleId(preselectedArticleId);
      setPreselectedArticleId(null);
    }
  }, [preselectedArticleId, setPreselectedArticleId]);

  useEffect(() => {
    // 有草稿指定目标时，不要被默认选中逻辑覆盖
    if (preselectedArticleId) return;
    if (articles.length && !articleId) setArticleId(articles[0].id);
  }, [articles, articleId, preselectedArticleId]);

  useEffect(() => {
    if (accounts.length && selected.length === 0) setSelected([accounts[0].id]);
  }, [accounts, selected.length]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedArticle = useMemo(() => articles.find((a) => a.id === articleId), [articles, articleId]);

  function toggleAccount(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function buildMode(forceImmediate = false): string {
    if (forceImmediate || modeType === 'immediate') return '{"type":"immediate"}';
    if (modeType === 'fixed') {
      const at = fixedAt ? Math.floor(new Date(fixedAt).getTime() / 1000) : Math.floor(Date.now() / 1000) + 3600;
      return JSON.stringify({ type: 'fixed', at });
    }
    return JSON.stringify({ type: 'interval', every: Math.max(1, everyMin) * 60, jitter: jitter / 100 });
  }

  function validate(): boolean {
    if (!articleId.trim()) {
      toast('请先选择或填写文章 ID', 'warning');
      return false;
    }
    if (selected.length === 0) {
      toast('请至少选择一个目标账号', 'warning');
      return false;
    }
    return true;
  }

  async function execute() {
    if (!validate()) return;
    setBusy(true);
    const id = articleId.trim();
    const mode = buildMode();
    try {
      await Promise.all(
        selected.map((acc) =>
          modeType === 'immediate' ? publishNow(id, acc) : enqueue(id, acc, mode),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function queueOnly() {
    if (!validate()) return;
    setBusy(true);
    try {
      await Promise.all(selected.map((acc) => enqueue(articleId.trim(), acc, buildMode(true))));
    } finally {
      setBusy(false);
    }
  }

  const dateTimeDefault = useMemo(() => {
    const d = new Date(Date.now() + 3600 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Publishing"
        title="内容发布"
        desc="选择文章与目标账号，即时发布或交给调度器错峰执行。"
        action={<Badge tone="primary" dot>{accounts.length} 个可用账号</Badge>}
      />

      <div className="publish-grid">
        <Card title="发布配置" subtitle="一次可投递到多个平台账号">
          <Field label="文章 ID" hint={selectedArticle ? `当前选择：${selectedArticle.title}` : '可从下方文章库选择，或手动填写文章 ID'}>
            <input
              className="input"
              value={articleId}
              onChange={(e) => setArticleId(e.target.value)}
              placeholder="例如：art_2026_001"
              list="article-options"
            />
            <datalist id="article-options">
              {articles.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </datalist>
          </Field>

          {articles.length > 0 && (
            <div style={{ margin: '-6px 0 16px' }}>
              <div className="article-list" style={{ maxHeight: 152, border: '1px solid var(--border)', borderRadius: 10 }}>
                {articles.map((a) => (
                  <div
                    key={a.id}
                    className={`article-row ${articleId === a.id ? 'article-row--active' : ''}`}
                    onClick={() => setArticleId(a.id)}
                  >
                    <span className="article-row__icon"><Icon name="file" size={14} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div className="article-row__title">{a.title}</div>
                      <div className="article-row__meta">{a.category} · {formatTime(a.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="field">
            <span className="field__label">目标账号（已选 {selected.length} 个）</span>
            {accounts.length === 0 ? (
              <div className="callout">暂无账号，请先在「账号管理」中添加。</div>
            ) : (
              <div className="target-grid">
                {accounts.map((a) => (
                  <label key={a.id} className={`target-item ${selectedSet.has(a.id) ? 'target-item--on' : ''}`}>
                    <input type="checkbox" checked={selectedSet.has(a.id)} onChange={() => toggleAccount(a.id)} />
                    <span style={{ minWidth: 0 }}>
                      <span className="target-item__name">{a.nickname}</span>
                      <span className="target-item__sub" style={{ display: 'block' }}>{platformShort(a.platform)} · 日上限 {a.max_per_day}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <span className="field__label">发布方式</span>
            <div className="seg">
              {([
                ['immediate', '立即发布'],
                ['fixed', '定时发布'],
                ['interval', '间隔错峰'],
              ] as [ModeType, string][]).map(([k, label]) => (
                <button key={k} className={`seg__item ${modeType === k ? 'seg__item--active' : ''}`} onClick={() => setModeType(k)}>{label}</button>
              ))}
            </div>
          </div>

          {modeType === 'fixed' && (
            <Field label="发布时间" hint="到点后由调度器触发，任务持久化在本地 SQLite">
              <input className="input" type="datetime-local" defaultValue={dateTimeDefault} onChange={(e) => setFixedAt(e.target.value)} />
            </Field>
          )}

          {modeType === 'interval' && (
            <div className="form-row">
              <Field label="间隔（分钟）" hint="建议按小时级设置，避免机械规律">
                <input className="input" type="number" min={1} value={everyMin} onChange={(e) => setEveryMin(Number(e.target.value))} />
              </Field>
              <Field label="随机抖动（%）" hint="在间隔上叠加 ± 抖动">
                <input className="input" type="number" min={0} max={50} value={jitter} onChange={(e) => setJitter(Number(e.target.value))} />
              </Field>
            </div>
          )}

          <div style={{ display: 'flex', gap: 9, marginTop: 20, flexWrap: 'wrap' }}>
            <Button variant="primary" icon={modeType === 'immediate' ? 'send' : 'calendar'} loading={busy} onClick={() => void execute()}>
              {modeType === 'immediate' ? '立即发布' : '创建调度任务'}
            </Button>
            <Button icon="list" loading={busy} onClick={() => void queueOnly()}>仅加入队列</Button>
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="发布链路" subtitle="每一步都在本机完成">
            <div className="step-list">
              {[
                ['选择内容', '读取本地文章库中的 Markdown 正文与封面'],
                ['路由账号', '按领域匹配账号，分配独立浏览器 Profile'],
                ['改写去重', '按账号种子改写，并用 SimHash 拦截跨号雷同'],
                ['调度发布', 'CDP 驱动真实网页填表、上传素材并提交'],
              ].map(([t, d], i) => (
                <div className="step" key={t}>
                  <span className="step__num">{i + 1}</span>
                  <div><div className="step__title">{t}</div><div className="step__desc">{d}</div></div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="风险提示">
            <div className="hint-box hint-box--warn">
              <Icon name="alert" size={16} />
              <span>平台服务条款通常禁止自动化发布。请保持低频、账号垂直、内容不雷同，并在触发验证码时及时人工接管。文章内容与 Cookie 不会上传云端。</span>
            </div>
          </Card>
        </div>
      </div>

      <Card
        title="文章库"
        subtitle={runtime === 'browser' ? '演示文章 + 草稿箱中保存的内容' : '草稿箱中保存的内容'}
        padded={false}
        className="card--spaced"
        action={<Badge tone="neutral">{articles.length} 篇</Badge>}
      >
        {articles.length === 0 ? (
          <EmptyState icon="database" title="暂无可读的文章列表" desc="Rust 端目前只提供 list_accounts / list_tasks 两个查询命令。发布时可直接填写文章 ID。" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>标题</th><th>分类</th><th>作者</th><th>标签</th><th>创建时间</th><th style={{ textAlign: 'right' }}>操作</th></tr>
              </thead>
              <tbody>
                {articles.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="table__strong">
                        {a.title}{' '}
                        {a.id.startsWith('draft_') && <Badge tone="warning">草稿</Badge>}
                      </div>
                      <div className="table__sub table__mono">{a.id}</div>
                    </td>
                    <td><Badge tone="primary">{a.category}</Badge></td>
                    <td>{a.author}</td>
                    <td style={{ color: '#667085' }}>{a.tags.split(',').slice(0, 2).join(' / ')}</td>
                    <td style={{ color: '#667085' }}>{formatTime(a.created_at)}</td>
                    <td>
                      <div className="row-actions">
                        <Button size="sm" variant="ghost" onClick={() => { setArticleId(a.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>选用</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
