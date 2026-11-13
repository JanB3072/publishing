import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useApp } from '../appContext';
import { Badge, Button, Card, EmptyState, Modal, PageHeader } from '../ui';
import { Icon } from '../icons';
import { fileToImage } from '../contentStorage';
import { formatTime } from '../meta';
import { toast } from '../toast';
import type { ImageItem } from '../types';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function Gallery() {
  const { images, addImages, deleteImage, search, drafts, openEditor } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dense, setDense] = useState(false);
  const [detail, setDetail] = useState<ImageItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ImageItem | null>(null);

  const filtered = useMemo(
    () => images.filter((im) => im.name.toLowerCase().includes(search.trim().toLowerCase())),
    [images, search],
  );

  const totalSize = useMemo(() => images.reduce((sum, im) => sum + im.size, 0), [images]);
  const usedBy = (id: string) => drafts.filter((d) => d.cover_id === id).length;

  async function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;

    const valid = files.filter((f) => f.type.startsWith('image/') && f.size <= 8 * 1024 * 1024);
    if (valid.length < files.length) toast('已跳过非图片或超过 8MB 的文件', 'warning');
    if (!valid.length) return;

    setUploading(true);
    try {
      const items = await Promise.all(valid.slice(0, 8).map(fileToImage));
      addImages(items);
      toast(`已上传 ${items.length} 张图片（自动压缩至最长边 1600px）`, 'success');
    } catch (err) {
      toast('上传失败：' + String(err), 'danger');
    } finally {
      setUploading(false);
    }
  }

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      toast('图片 ID 已复制', 'success');
    } catch {
      toast('复制失败，请手动选择', 'warning');
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Assets"
        title="图库"
        desc="统一管理封面与正文配图，上传后自动压缩，可直接设为文章封面。"
        action={
          <>
            <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => void handleFiles(e)} />
            <Button icon="grid" onClick={() => setDense((v) => !v)}>{dense ? '紧凑视图' : '舒适视图'}</Button>
            <Button variant="primary" icon="upload" loading={uploading} onClick={() => inputRef.current?.click()}>上传图片</Button>
          </>
        }
      />

      <div className="toolbar">
        <div className="toolbar__left">
          <Badge tone="primary" dot>{filtered.length} 张素材</Badge>
          <Badge tone="neutral">占用 {formatBytes(totalSize)}</Badge>
          <Badge tone="info">{drafts.filter((d) => d.cover_id).length} 篇草稿已设封面</Badge>
        </div>
        <div className="toolbar__right">
          <span style={{ fontSize: 12, color: '#98a2b3' }}>素材保存在浏览器本地，不上传云端</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon="image"
            title={images.length === 0 ? '图库还是空的' : '没有匹配的图片'}
            desc={images.length === 0 ? '上传 JPG / PNG / WebP / SVG，或直接使用内置的演示封面。' : '换个搜索词试试。'}
            action={<Button variant="primary" icon="upload" onClick={() => inputRef.current?.click()}>上传图片</Button>}
          />
        </Card>
      ) : (
        <div className={`gallery-grid ${dense ? 'gallery-grid--dense' : ''}`}>
          {filtered.map((im) => (
            <div className="gallery-card" key={im.id}>
              <button className="gallery-card__img" onClick={() => setDetail(im)}>
                <img src={im.data_url} alt={im.name} />
                <span className="gallery-card__zoom"><Icon name="eye" size={16} /></span>
              </button>
              <div className="gallery-card__body">
                <div className="gallery-card__name" title={im.name}>{im.name}</div>
                <div className="gallery-card__meta">
                  {im.width ? `${im.width}×${im.height} · ` : ''}{formatBytes(im.size)} · {formatTime(im.created_at).slice(0, 10)}
                </div>
                <div className="gallery-card__foot">
                  {usedBy(im.id) > 0 ? (
                    <Badge tone="success">被 {usedBy(im.id)} 篇引用</Badge>
                  ) : (
                    <Badge tone="neutral">未使用</Badge>
                  )}
                  <div className="row-actions">
                    <Button size="sm" variant="ghost" icon="copy" title="复制图片 ID" onClick={() => void copyId(im.id)} />
                    <Button size="sm" variant="ghost" icon="trash" title="删除" onClick={() => setPendingDelete(im)} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="callout" style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Icon name="info" size={16} style={{ flex: '0 0 auto', marginTop: 2, color: '#3b82f6' }} />
        <span>上传的位图会等比缩放到最长边 1600px 并转为 JPEG（质量 0.82），减少本地存储占用；SVG 保留原始矢量。浏览器 localStorage 通常约 5MB，素材过多时会自动提示。</span>
      </div>

      <Modal
        open={!!detail}
        title="图片详情"
        subtitle={detail?.name}
        onClose={() => setDetail(null)}
        width={720}
        footer={
          <>
            <Button icon="edit" onClick={() => { setDetail(null); openEditor(); }}>去写文章</Button>
            <Button icon="copy" onClick={() => { if (detail) void copyId(detail.id); }}>复制 ID</Button>
            <Button variant="danger" icon="trash" onClick={() => { if (detail) { setPendingDelete(detail); setDetail(null); } }}>删除</Button>
          </>
        }
      >
        {detail && (
          <>
            <div className="gallery-detail__img"><img src={detail.data_url} alt={detail.name} /></div>
            <div style={{ marginTop: 16 }}>
              <div className="kv"><span className="kv__key">尺寸</span><span className="kv__val">{detail.width ? `${detail.width} × ${detail.height}` : '矢量 / 未知'}</span></div>
              <div className="kv"><span className="kv__key">大小</span><span className="kv__val">{formatBytes(detail.size)}</span></div>
              <div className="kv"><span className="kv__key">上传时间</span><span className="kv__val">{formatTime(detail.created_at)}</span></div>
              <div className="kv"><span className="kv__key">引用草稿</span><span className="kv__val">{usedBy(detail.id)} 篇</span></div>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={!!pendingDelete}
        title="删除这张图片？"
        subtitle="引用了它的草稿会自动清除封面设置，此操作不可撤销。"
        onClose={() => setPendingDelete(null)}
        width={440}
        footer={
          <>
            <Button onClick={() => setPendingDelete(null)}>取消</Button>
            <Button variant="danger" icon="trash" onClick={() => {
              if (pendingDelete) {
                deleteImage(pendingDelete.id);
                toast('图片已删除', 'neutral');
              }
              setPendingDelete(null);
            }}>确认删除</Button>
          </>
        }
      >
        <div className="hint-box hint-box--warn">
          <Icon name="alert" size={16} />
          <span>{pendingDelete?.name}</span>
        </div>
      </Modal>
    </>
  );
}
