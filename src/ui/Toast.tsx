import { CheckCircle2, Info, XCircle, X } from 'lucide-react';
import { create } from 'zustand';

interface ToastItem {
  id: number;
  message: string;
  kind: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
}

const useToasts = create<{ list: ToastItem[] }>(() => ({ list: [] }));
let tid = 0;

/** Show a short notification. toast('Saved'); toast('Export failed', 'error'); */
export function toast(message: string, kind: ToastItem['kind'] = 'success', opts?: { action?: ToastItem['action']; duration?: number }) {
  const id = ++tid;
  useToasts.setState((s) => ({ list: [...s.list, { id, message, kind, action: opts?.action }] }));
  setTimeout(() => dismiss(id), opts?.duration ?? (kind === 'error' ? 7000 : opts?.action ? 7000 : 3500));
}

function dismiss(id: number) {
  useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) }));
}

export function ToastHost() {
  const list = useToasts((s) => s.list);
  return (
    <div className="toasts">
      {list.map((t) => {
        const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? XCircle : Info;
        return (
          <div key={t.id} className={`toast ${t.kind}`} role="status">
            <Icon />
            <div className="toast-msg">{t.message}</div>
            {t.action && (
              <button
                className="btn sm"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="btn ghost sm icon" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <X />
            </button>
          </div>
        );
      })}
    </div>
  );
}
