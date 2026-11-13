import { useMemo, useState } from 'react';
import { useApp } from '../appContext';
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader } from '../ui';
import { Icon } from '../icons';
import { DEDUP_LABELS, PLATFORM_META, platformLabel, platformShort, timeAgo } from '../meta';
import { toast } from '../toast';
import type { AccountProfile, LoginSession, Tone } from '../types';

const toneBg: Record<Tone, string> = {
  primary: 'linear-gradient(135deg,#5b5bd6,#8b5cf6)',
  success: 'linear-gradient(135deg,#059669,#34d399)',
  warning: 'linear-gradient(135deg,#d97706,#fbbf24)',
  danger: 'linear-gradient(135deg,#dc2626,#f87171)',
  info: 'linear-gradient(135deg,#2563eb,#60a5fa)',
  neutral: 'linear-gradient(135deg,#475569,#94a3b8)',
};

const PLATFORM_OPTIONS = ['wechat', 'toutiao', 'zhihu', 'xiaohongshu', 'baijiahao', 'weibo'];
const DEDUP_OPTIONS = ['content', 'article', 'off'];

type AddStep = 'choose' | 'browser' | 'profile';

export default function Accounts() {
  const {
    accounts, tasks, search, setDedupMode, openAccountBrowser, refresh, loading,
    beginAccountLogin, fetchAccountProfile, finishAccountLogin, cancelAccountLogin,
  } = useApp();
  const [platformFilter, setPlatformFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [addStep, setAddStep] = useState<AddStep>('choose');
  const [platform, setPlatform] = useState('wechat');
  const [session, setSession] = useState<LoginSession | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [manualNiche, setManualNiche] = useState('');
  const [busy, setBusy] = useState(false);

  const platforms = useMemo(() => {
    const s = new Set(accounts.map((a) => a.platform));
    return ['all', ...PLATFORM_OPTIONS.filter((p) => s.has(p))];
  }, [accounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (platformFilter !== 'all' && a.platform !== platformFilter) return false;
      if (!q) return true;
      return [a.nickname, a.niche, a.id, a.platform].some((v) => v.toLowerCase().includes(q));
    });
  }, [accounts, platformFilter, search]);

  function resetAdd() {
    setModalOpen(false);
    setAddStep('choose');
    setPlatform('wechat');
    setManualNiche('');
    setProfile(null);
    setSession(null);
    setBusy(false);
  }

  function openModal() {
    setAddStep('choose');
    setPlatform('wechat');
    setManualNiche('');
    setProfile(null);
    setSession(null);
    setBusy(false);
    setModalOpen(true);
  }

  function closeModal() {
    if (session) void cancelAccountLogin(session.session_id);
    resetAdd();
  }

  async function startLogin() {
    setBusy(true);
    try {
      if (session) await cancelAccountLogin(session.session_id);
      const s = await beginAccountLogin(platform);
      setSession(s);
      setProfile(null);
      setManualNiche('');
      setAddStep('browser');
    } catch (e) {
      toast('打开浏览器失败：' + String(e), 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function readProfile() {
    if (!session) return;
    setBusy(true);
    try {
      const p = await fetchAccountProfile(session.session_id);
      if (p.need_login || !p.nickname.trim()) {
        toast('还没读到账号信息，请在浏览器里完成登录后重试', 'warning');
        return;
      }
      setProfile(p);
      setManualNiche('');
      setAddStep('profile');
    } catch (e) {
      toast('读取账号资料失败：' + String(e), 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!session || !profile) return;
    const niche = profile.niche.trim() || manualNiche.trim();
    if (!niche) {
      toast('该平台未提供领域，请手工填写', 'warning');
      return;
    }
    setBusy(true);
    const ok = await finishAccountLogin(session.session_id, profile.nickname.trim(), niche);
    setBusy(false);
    if (ok) {
      setSession(null);
      resetAdd();
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="账号管理"
        desc="每个账号拥有独立浏览器 Profile 与指纹，Cookie 全程留在本机。"
        action={<Button variant="primary" icon="plus" onClick={openModal}>添加账号</Button>}
      />

      <div className="toolbar">
        <div className="toolbar__left">
          <div className="filter-pills">
            {platforms.map((p) => (
              <button
                key={p}
                className={`pill ${platformFilter === p ? 'pill--active' : ''}`}
                onClick={() => setPlatformFilter(p)}
              >
                {p === 'all' ? '全部平台' : platformShort(p)}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar__right">
          <Badge tone="neutral">共 {filtered.length} 个账号</Badge>
          <Button icon="refresh" onClick={() => void refresh()} loading={loading}>刷新</Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon="users"
            title={accounts.length === 0 ? '还没有接入账号' : '没有匹配的账号'}
            desc={accounts.length === 0 ? '点击右上角「添加账号」开始配置第一个平台账号。' : '试试调整搜索词或平台筛选。'}
            action={accounts.length === 0 ? <Button variant="primary" icon="plus" onClick={openModal}>添加账号</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="account-grid">
          {filtered.map((a) => {
            const tone = (PLATFORM_META[a.platform]?.tone ?? 'neutral') as Tone;
            const own = tasks.filter((t) => t.account_id === a.id);
            const published = own.filter((t) => t.status === 'success').length;
            const alerts = own.filter((t) => t.status === 'need_human' || t.status === 'failed').length;
            const d = new Date(); d.setHours(0, 0, 0, 0);
            const today = own.filter((t) => t.created_at >= Math.floor(d.getTime() / 1000)).length;
            const last = own.length ? Math.max(...own.map((t) => t.created_at)) : 0;
            return (
              <div className="account-card" key={a.id}>
                <div className="account-card__head">
                  <span className="account-avatar" style={{ background: toneBg[tone] }}>{platformShort(a.platform)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="account-card__name">{a.nickname}</div>
                    <div className="account-card__id">{a.id}</div>
                  </div>
                  <Badge tone={alerts > 0 ? 'warning' : 'success'} dot>{alerts > 0 ? `${alerts} 项待处理` : '运行正常'}</Badge>
                </div>

                <div className="account-card__tags">
                  <Badge tone={tone}>{platformLabel(a.platform)}</Badge>
                  {a.niche && <Badge tone="neutral">{a.niche}</Badge>}
                  {a.dedup_mode && <Badge tone="info">{DEDUP_LABELS[a.dedup_mode] ?? a.dedup_mode}</Badge>}
                </div>

                <div className="account-card__stats">
                  <div>
                    <div className="account-stat__label">累计发布</div>
                    <div className="account-stat__value">{published}</div>
                  </div>
                  <div>
                    <div className="account-stat__label">今日 / 上限</div>
                    <div className="account-stat__value">{today} <span style={{ color: '#98a2b3', fontWeight: 500, fontSize: 12 }}>/ {a.max_per_day}</span></div>
                  </div>
                  <div>
                    <div className="account-stat__label">最近活动</div>
                    <div className="account-stat__value" style={{ fontSize: 12.5 }}>{last ? timeAgo(last) : '—'}</div>
                  </div>
                </div>

                <div className="account-card__foot">
                  <select
                    className="select"
                    value={a.dedup_mode ?? 'content'}
                    onChange={(e) => void setDedupMode(a.id, e.target.value)}
                    title="切换去重策略"
                  >
                    {DEDUP_OPTIONS.map((m) => <option key={m} value={m}>去重：{DEDUP_LABELS[m]}</option>)}
                  </select>
                  <Button size="sm" variant="secondary" icon="external" onClick={() => void openAccountBrowser(a.id)}>
                    打开浏览器
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        title={
          addStep === 'choose' ? '添加平台账号'
            : addStep === 'browser' ? '登录平台并读取资料'
              : '确认账号资料'
        }
        subtitle="账号名称由平台自动读取，资料仅保存在本地 SQLite。"
        onClose={closeModal}
        footer={
          addStep === 'choose' ? (
            <>
              <Button onClick={closeModal}>取消</Button>
              <Button variant="primary" icon="external" loading={busy} onClick={() => void startLogin()}>打开浏览器登录</Button>
            </>
          ) : addStep === 'browser' ? (
            <>
              <Button onClick={closeModal}>取消</Button>
              <Button variant="secondary" icon="refresh" loading={busy} onClick={() => void startLogin()}>重新打开</Button>
              <Button variant="primary" icon="check" loading={busy} onClick={() => void readProfile()}>已登录，读取账号信息</Button>
            </>
          ) : (
            <>
              <Button onClick={closeModal}>取消</Button>
              <Button variant="primary" icon="check" loading={busy} onClick={() => void submit()}>确认添加</Button>
            </>
          )
        }
      >
        {addStep === 'choose' && (
          <>
            <Field label="平台" hint="选择该账号所属的内容平台">
              <select className="select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {PLATFORM_OPTIONS.map((p) => <option key={p} value={p}>{platformLabel(p)}</option>)}
              </select>
            </Field>
            <div className="hint-box" style={{ marginTop: 4 }}>
              <Icon name="info" size={16} />
              <span>点击后会打开平台浏览器窗口，请先完成登录。账号名称由平台自动读取，无需输入；平台未提供领域时会请你手工填写。</span>
            </div>
          </>
        )}

        {addStep === 'browser' && session && (
          <>
            <div className="kv"><span className="kv__key">平台</span><span className="kv__val">{platformLabel(session.platform)}</span></div>
            <div className="kv"><span className="kv__key">登录地址</span><span className="kv__val">{session.url}</span></div>
            <div className="kv"><span className="kv__key">状态</span><span className="kv__val">等待登录</span></div>
            <div className="hint-box" style={{ marginTop: 12 }}>
              <Icon name="info" size={16} />
              <span>请在刚打开的浏览器窗口里完成扫码 / 账号登录，再回到这里点「已登录，读取账号信息」。登录态保存在本机独立 Profile，供后续发布复用。</span>
            </div>
          </>
        )}

        {addStep === 'profile' && profile && (
          <>
            <div className="kv"><span className="kv__key">账号名称</span><span className="kv__val">{profile.nickname}</span></div>
            <div className="kv"><span className="kv__key">领域</span><span className="kv__val">{profile.niche || '平台未提供'}</span></div>
            {!profile.niche.trim() && (
              <Field label="领域 / 垂直方向" hint="该平台没有公开领域信息，请手工填写；内容按领域路由到对应账号">
                <input className="input" placeholder="例如：效率工具" value={manualNiche} onChange={(e) => setManualNiche(e.target.value)} />
              </Field>
            )}
            <div className="hint-box" style={{ marginTop: 4 }}>
              <Icon name="info" size={16} />
              <span>账号名称取自平台页面，不需要也不能手工输入。如果显示不对，可关闭后重新打开浏览器登录。</span>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
