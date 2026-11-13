import { useState } from 'react';
import { Button, Field, Modal } from '../ui';
import { Icon } from '../icons';
import { contentApi } from '../contentApi';
import { toast } from '../toast';
import { getRuntime, invoke } from '../tauriBridge';

export type InsertMode = 'append' | 'replace';

export interface ArticleInfo {
  title: string;
  author: string;
  category: string;
  summary: string;
  tags: string;
}

export default function AiGenerateModal({
  open,
  article,
  onClose,
  onInsert,
}: {
  open: boolean;
  article: ArticleInfo;
  onClose: () => void;
  onInsert: (text: string, mode: InsertMode) => void;
}) {
  const [extra, setExtra] = useState('');
  const [useR1, setUseR1] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  function reset() {
    setResult('');
    setError('');
    setCopied(false);
  }

  async function handlePickFiles() {
    if (getRuntime() !== 'tauri') {
      toast('预览模式下无法选择本地文件，请用桌面版选择', 'danger');
      return;
    }
    try {
      const sel = await invoke<string | string[]>('plugin:dialog|open', {
        multiple: true,
        filters: [{ name: 'Word 文档', extensions: ['docx'] }],
      });
      const picked = Array.isArray(sel) ? sel : sel ? [sel] : [];
      setFiles((prev) => [...prev, ...picked].slice(0, 2));
    } catch (e) {
      toast(String(e), 'danger');
    }
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleLogin() {
    try {
      await contentApi.openDeepseek();
      toast('已打开 DeepSeek 浏览器，请在其中登录一次', 'success');
    } catch (e) {
      toast(String(e), 'danger');
    }
  }

  async function handleGenerate() {
    setLoading(true);
    setError('');
    setResult('');
    try {
      const text = await contentApi.generateAiArticle({ ...article, extra, useR1, files });
      if (!text.trim()) {
        setError('DeepSeek 未返回内容（可能未登录、被风控或页面结构变化，请确认浏览器状态后重试）');
      } else {
        setResult(text);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      toast('已复制到剪贴板', 'success');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('复制失败，请手动选择文本复制', 'danger');
    }
  }

  const infoRows: Array<[string, string]> = [
    ['标题', article.title],
    ['作者', article.author],
    ['分类 / 领域', article.category],
    ['摘要', article.summary],
    ['标签', article.tags],
  ];

  return (
    <Modal
      open={open}
      title="AI 生成（DeepSeek 浏览器）"
      subtitle="把「文章信息」作为参数发给 DeepSeek 生成，不调用任何接口"
      onClose={onClose}
      width={600}
      footer={
        <>
          <Button icon="external" onClick={handleLogin}>登录 DeepSeek</Button>
          {result && (
            <>
              <Button icon="copy" onClick={handleCopy}>{copied ? '已复制' : '复制'}</Button>
              <Button size="sm" onClick={() => onInsert(result, 'append')}>插入到末尾</Button>
              <Button variant="primary" size="sm" icon="check" onClick={() => onInsert(result, 'replace')}>替换正文</Button>
            </>
          )}
        </>
      }
    >
      <div className="callout" style={{ marginBottom: 14 }}>
        首次使用请先点「登录 DeepSeek」在弹出的浏览器窗口里登录一次；登录态会保存在本地 profile，之后可重复使用。
      </div>

      <div className="ai-params">
        <div className="ai-params__head"><Icon name="file" size={14} /> <span>将随生成一起发送的文章信息</span></div>
        {infoRows.map(([label, value]) => (
          <div className="kv" key={label}>
            <span className="kv__key">{label}</span>
            <span className="kv__val" style={{ textAlign: 'left' }}>
              {value?.trim() ? value : <span style={{ color: 'var(--faint)' }}>（未填写{label === '标题' ? '，AI 会自行拟定' : ''}）</span>}
            </span>
          </div>
        ))}
      </div>

      <Field label="额外要求（可选）" hint="补充字数、风格、必含要点等，例如：800 字左右，口语化，带 3 个实操步骤">
        <textarea
          className="textarea"
          rows={3}
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="对生成的额外要求…"
          disabled={loading}
        />
      </Field>

      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: files.length ? 8 : 0, flexWrap: 'wrap' }}>
          <Button size="sm" icon="upload" onClick={handlePickFiles} disabled={loading || files.length >= 2}>
            选择 docx 文件（最多 2 个）
          </Button>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>作为参考素材随提示词一起发给 DeepSeek</span>
        </div>
        {files.map((f, i) => (
          <div className="kv" key={f + i}>
            <span className="kv__key">附件 {i + 1}</span>
            <span className="kv__val" style={{ textAlign: 'left' }}>{f.split(/[\\/]/).pop()}</span>
            {!loading && (
              <button
                type="button"
                onClick={() => removeFile(i)}
                style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
                aria-label="移除"
              >
                <Icon name="x" size={13} />
              </button>
            )}
          </div>
        ))}
      </div>

      <label className="checkbox" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={useR1} onChange={(e) => setUseR1(e.target.checked)} disabled={loading} />
        <span>使用 DeepSeek-R1（深度思考，耗时更长）</span>
      </label>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <Button variant="primary" icon="sparkles" loading={loading} onClick={handleGenerate}>
          {loading ? '正在用浏览器生成…' : '生成'}
        </Button>
        {result && !loading && (
          <Button size="sm" icon="refresh" onClick={reset}>重新生成</Button>
        )}
      </div>

      {error && (
        <div className="callout callout--danger" style={{ marginTop: 14 }}>
          <Icon name="alert" size={16} /> <span>{error}</span>
        </div>
      )}

      {result && !loading && (
        <div className="ai-result">
          <div className="ai-result__head">
            <Icon name="sparkles" size={15} /> <span>生成结果（Markdown）</span>
          </div>
          <pre className="ai-result__body">{result}</pre>
        </div>
      )}
    </Modal>
  );
}
