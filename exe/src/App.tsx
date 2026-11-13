import type { ReactNode } from 'react';
import { AppProvider } from './store';
import { useApp } from './appContext';
import { Icon, type IconName } from './icons';
import { toast } from './toast';
import { ToastHost } from './ToastHost';
import Dashboard from './views/Dashboard';
import Accounts from './views/Accounts';
import Editor from './views/Editor';
import Drafts from './views/Drafts';
import Gallery from './views/Gallery';
import Articles from './views/Articles';
import Tasks from './views/Tasks';
import Settings from './views/Settings';
import TakeoverModal from './views/TakeoverModal';
import type { ViewId } from './types';

interface NavItem {
  id: ViewId;
  label: string;
  icon: IconName;
}

const NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: '工作台',
    items: [
      { id: 'dashboard', label: '概览', icon: 'layout' },
      { id: 'accounts', label: '账号管理', icon: 'users' },
    ],
  },
  {
    group: '内容中心',
    items: [
      { id: 'editor', label: '文章编写', icon: 'edit' },
      { id: 'drafts', label: '草稿箱', icon: 'draft' },
      { id: 'gallery', label: '图库', icon: 'image' },
      { id: 'articles', label: '内容发布', icon: 'send' },
      { id: 'tasks', label: '任务调度', icon: 'list' },
    ],
  },
  {
    group: '系统',
    items: [{ id: 'settings', label: '系统设置', icon: 'settings' }],
  },
];

const VIEW_LABEL: Record<ViewId, string> = {
  dashboard: '概览',
  accounts: '账号管理',
  editor: '文章编写',
  drafts: '草稿箱',
  gallery: '图库',
  articles: '内容发布',
  tasks: '任务调度',
  settings: '系统设置',
};

function Sidebar() {
  const { view, setView, accounts, tasks, drafts, license, runtime } = useApp();
  const alerts = tasks.filter((t) => t.status === 'need_human' || t.status === 'failed').length;
  const ready = drafts.filter((d) => d.status === 'ready').length;

  const badgeFor = (id: ViewId): string | null => {
    if (id === 'accounts' && accounts.length) return String(accounts.length);
    if (id === 'drafts' && ready) return String(ready);
    if (id === 'tasks' && alerts) return String(alerts);
    return null;
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="brand-mark"><Icon name="layers" size={20} /></span>
        <div>
          <div className="brand-name">多平台发布工具</div>
          <div className="brand-sub">PUBLISHING CONSOLE</div>
        </div>
      </div>

      {NAV.map((g) => (
        <div className="nav-group" key={g.group}>
          <div className="nav-label">{g.group}</div>
          {g.items.map((item) => {
            const badge = badgeFor(item.id);
            return (
              <button
                key={item.id}
                className={`nav-item ${view === item.id ? 'nav-item--active' : ''}`}
                onClick={() => setView(item.id)}
              >
                <span className="nav-icon"><Icon name={item.icon} size={17} /></span>
                <span>{item.label}</span>
                {badge && <span className="nav-badge">{badge}</span>}
              </button>
            );
          })}
        </div>
      ))}

      <div className="sidebar__foot">
        <div className="license-mini">
          <div className="license-mini__top">
            <i className={`license-mini__dot ${license.valid ? '' : 'license-mini__dot--off'}`} />
            {license.valid ? '专业版已激活' : '授权未校验'}
          </div>
          <div className="license-mini__desc">
            {runtime === 'tauri' ? '本地发布 · 内容不上云' : '预览模式 · 数据为演示内容'}
          </div>
          <div className="license-mini__bar"><i /></div>
        </div>
      </div>
    </aside>
  );
}

function Topbar() {
  const { view, search, setSearch, setView, tasks } = useApp();
  const alerts = tasks.filter((t) => t.status === 'need_human' || t.status === 'failed').length;

  return (
    <header className="topbar">
      <div className="topbar__crumb">
        <Icon name="layout" size={15} />
        <span>工作台</span>
        <Icon name="chevron" size={13} />
        <b>{VIEW_LABEL[view]}</b>
      </div>
      <div className="topbar__right">
        <div className="topbar__search">
          <Icon name="search" size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索账号、任务、文章…"
          />
        </div>
        <button
          className="icon-btn topbar__bell"
          onClick={() => {
            setView('tasks');
            toast(alerts ? `有 ${alerts} 条任务需要关注` : '暂无待处理告警', alerts ? 'warning' : 'info');
          }}
          title="通知"
        >
          <Icon name="bell" size={17} />
          {alerts > 0 && <i />}
        </button>
        <div className="topbar__divider" />
        <div className="topbar__user">
          <span className="topbar__avatar">PT</span>
          <div>
            <div className="topbar__uname">管理员</div>
            <div className="topbar__urole">本地工作台</div>
          </div>
        </div>
      </div>
    </header>
  );
}

function Views() {
  const { view, editorSession } = useApp();
  const map: Record<ViewId, ReactNode> = {
    dashboard: <Dashboard />,
    accounts: <Accounts />,
    editor: <Editor key={editorSession} />,
    drafts: <Drafts />,
    gallery: <Gallery />,
    articles: <Articles />,
    tasks: <Tasks />,
    settings: <Settings />,
  };
  return <div className="content" key={view}>{map[view]}</div>;
}

function Shell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main">
        <Topbar />
        <Views />
      </div>
      <ToastHost />
      <TakeoverModal />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
