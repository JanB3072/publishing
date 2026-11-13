import { useApp } from '../appContext';
import { Badge, Button, Card, Field, PageHeader } from '../ui';
import { Icon } from '../icons';

export default function Settings() {
  const {
    license, setLicenseField, verifyLicense, runtime, schedulerRunning,
    selfTest, refresh, simulateTakeover, accounts, tasks, loading,
    selectorPaths, reloadSelectors,
  } = useApp();

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="系统设置"
        desc="授权校验、运行环境与诊断工具。"
        action={<Badge tone={runtime === 'tauri' ? 'success' : 'info'} dot>{runtime === 'tauri' ? '桌面端已连接' : '浏览器预览模式'}</Badge>}
      />

      <div className="settings-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="授权激活" subtitle="仅在启动时向授权服务校验，云端不接触文章内容">
            <Field label="授权服务地址" hint="对应云端 /license/verify 接口">
              <input className="input" value={license.backend} onChange={(e) => setLicenseField('backend', e.target.value)} placeholder="http://localhost:8787" />
            </Field>
            <Field label="License Key" hint="格式形如 PT-XXXX-XXXX">
              <input className="input" value={license.key} onChange={(e) => setLicenseField('key', e.target.value)} placeholder="PT-..." />
            </Field>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Button variant="primary" icon="shield" onClick={() => void verifyLicense()}>校验并激活</Button>
              {license.checked && (
                <Badge tone={license.valid ? 'success' : 'danger'} dot>
                  {license.valid ? '已激活' : '未通过'} · {license.message}
                </Badge>
              )}
            </div>
            {runtime === 'browser' && (
              <div className="hint-box" style={{ marginTop: 16 }}>
                <Icon name="info" size={16} />
                <span>当前为浏览器预览模式，校验请求由本地模拟返回，不会真正访问授权服务。</span>
              </div>
            )}
          </Card>

          <Card title="诊断工具" subtitle="无需真实平台即可验证 CDP 管线与人工接管流程">
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              <Button icon="activity" onClick={() => void selfTest()}>运行端到端自测</Button>
              <Button icon="refresh" onClick={() => void refresh()} loading={loading}>重新加载数据</Button>
              {runtime === 'browser' && (
                <Button icon="alert" onClick={simulateTakeover}>模拟人工接管</Button>
              )}
            </div>
            <div className="callout" style={{ marginTop: 14 }}>
              自测会在本地 <span className="table__mono">mock/editor.html</span> 上启动无头 Chromium，依次执行选择器自检、上传封面、填标题/正文/标签与提交，并断言页面状态变为 published。
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="运行环境">
            <div className="kv"><span className="kv__key">运行形态</span><span className="kv__val">{runtime === 'tauri' ? 'Tauri 2 桌面端' : '浏览器（Vite 预览）'}</span></div>
            <div className="kv"><span className="kv__key">调度器</span><span className="kv__val"><Badge tone={schedulerRunning ? 'success' : 'neutral'} dot>{schedulerRunning ? '运行中' : '已停止'}</Badge></span></div>
            <div className="kv"><span className="kv__key">本地账号</span><span className="kv__val">{accounts.length} 个</span></div>
            <div className="kv"><span className="kv__key">任务记录</span><span className="kv__val">{tasks.length} 条</span></div>
            <div className="kv"><span className="kv__key">数据存储</span><span className="kv__val">{runtime === 'tauri' ? '本地 SQLite（文章 / 草稿 / 图库）' : '浏览器 localStorage（预览）'}</span></div>
            <div className="kv"><span className="kv__key">文章内容</span><span className="kv__val"><Badge tone="success" dot>不上传云端</Badge></span></div>
          </Card>

          <Card title="选择器校准" subtitle="按真实平台 DOM 调整后立即生效，无需重启">
            <div className="callout">
              各平台编辑器的关键 DOM 选择器集中在 <span className="table__mono">selectors.toml</span>。发布前会自动自检，缺失项会列出并转人工接管。修改文件后点下面的按钮即可热加载。
            </div>
            <div style={{ display: 'flex', gap: 9, marginTop: 12, flexWrap: 'wrap' }}>
              <Button size="sm" icon="refresh" onClick={() => void reloadSelectors()}>重新加载选择器</Button>
            </div>
            {selectorPaths.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="field__label" style={{ marginBottom: 4 }}>候选路径（按优先级）</div>
                {selectorPaths.map((p, i) => (
                  <div className="kv" key={p} style={{ padding: '7px 0' }}>
                    <span className="kv__key">{i + 1}</span>
                    <span className="kv__val table__mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>{p}</span>
                  </div>
                ))}
              </div>
            )}
            {runtime === 'browser' && (
              <div className="hint-box" style={{ marginTop: 12 }}>
                <Icon name="info" size={16} />
                <span>浏览器预览模式不加载真实选择器。启动 Tauri 桌面端后，用「打开可见浏览器」对照真实平台编辑页抓取，再写入配置文件。</span>
              </div>
            )}
          </Card>

          <Card title="关于与合规">
            <div className="hint-box hint-box--warn">
              <Icon name="alert" size={16} />
              <span>本工具通过 CDP 模拟真人浏览器操作完成发布，不调用任何平台 OpenAPI，属技术灰区。平台可能因此限流或封号，请低频自用、保持账号垂直与内容差异，并自行评估风险。</span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
