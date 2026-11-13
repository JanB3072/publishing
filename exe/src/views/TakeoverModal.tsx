import { useApp } from '../appContext';
import { Button, Modal } from '../ui';
import { Icon } from '../icons';

const REASON_LABEL: Record<string, string> = {
  captcha: '验证码 / 滑块',
  selector: '选择器缺失',
};

export default function TakeoverModal() {
  const { takeover, dismissTakeover, openAccountBrowser, resumeTask } = useApp();
  if (!takeover) return null;

  return (
    <Modal
      open
      title="需人工接管"
      subtitle="该任务已挂起，处理完成后可立即恢复重试"
      onClose={dismissTakeover}
      width={560}
      footer={
        <>
          <Button onClick={dismissTakeover}>稍后处理</Button>
          <Button icon="external" onClick={() => void openAccountBrowser(takeover.account_id)}>打开可见浏览器</Button>
          <Button variant="primary" icon="check" onClick={() => void resumeTask()}>我已处理，恢复任务</Button>
        </>
      }
    >
      <div className="takeover__banner">
        <Icon name="alert" size={18} />
        <span><b>{REASON_LABEL[takeover.reason] ?? takeover.reason}</b>：{takeover.message}</span>
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="kv"><span className="kv__key">账号 ID</span><span className="kv__val table__mono">{takeover.account_id}</span></div>
        <div className="kv"><span className="kv__key">任务 ID</span><span className="kv__val table__mono">{takeover.task_id}</span></div>
        <div className="kv"><span className="kv__key">原因类型</span><span className="kv__val">{REASON_LABEL[takeover.reason] ?? takeover.reason}</span></div>
      </div>

      {takeover.screenshot ? (
        <div className="takeover__shot">
          <img src={`data:image/png;base64,${takeover.screenshot}`} alt="当前页面截图" />
        </div>
      ) : (
        <div className="callout" style={{ marginTop: 14 }}>
          打开可见浏览器后会复用该账号的同一 user-data-dir，扫码或完成验证后 Cookie 自动写回，点击「我已处理，恢复任务」即可继续发布。
        </div>
      )}
    </Modal>
  );
}
