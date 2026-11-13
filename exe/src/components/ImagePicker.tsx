import { useMemo, useState } from 'react';
import { useApp } from '../appContext';
import { Button, EmptyState, Modal } from '../ui';
import { Icon } from '../icons';

export function ImagePicker({
  open,
  currentId,
  onClose,
  onSelect,
}: {
  open: boolean;
  currentId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const { images } = useApp();
  const [q, setQ] = useState('');

  const filtered = useMemo(
    () => images.filter((im) => im.name.toLowerCase().includes(q.trim().toLowerCase())),
    [images, q],
  );

  return (
    <Modal
      open={open}
      title="从图库选择封面"
      subtitle={`共 ${images.length} 张素材，点击即可选用`}
      onClose={onClose}
      width={760}
      footer={<Button onClick={onClose}>取消</Button>}
    >
      <div className="topbar__search" style={{ width: '100%', marginBottom: 14 }}>
        <Icon name="search" size={15} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索图片名称…" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="image" title="没有匹配的图片" desc="先到图库上传素材，或换个关键词试试。" />
      ) : (
        <div className="picker-grid">
          {filtered.map((im) => (
            <button
              key={im.id}
              className={`picker-item ${currentId === im.id ? 'picker-item--on' : ''}`}
              onClick={() => {
                onSelect(im.id);
                onClose();
              }}
            >
              <img src={im.data_url} alt={im.name} />
              <span className="picker-item__name">{im.name}</span>
              {currentId === im.id && (
                <span className="picker-item__check"><Icon name="check" size={14} /></span>
              )}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
