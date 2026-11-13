import { useEffect, useState } from 'react';
import { Icon } from './icons';
import { subscribeToast, type ToastItem } from './toast';

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeToast((item) => {
      setItems((prev) => [...prev, item]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== item.id));
      }, 3600);
    });
  }, []);

  return (
    <div className="toast-host">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          <span className="toast__icon">
            <Icon
              name={
                t.tone === 'success'
                  ? 'check'
                  : t.tone === 'danger' || t.tone === 'warning'
                    ? 'alert'
                    : 'info'
              }
              size={16}
            />
          </span>
          <span className="toast__msg">{t.message}</span>
          <button
            className="toast__close"
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
            aria-label="关闭"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
