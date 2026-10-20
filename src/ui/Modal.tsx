/* Modal dialog + imperative confirm() / prompt() helpers (rendered by <DialogHost/>). */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { create } from 'zustand';
import { Button } from './Button';
import { isTopOverlay, popOverlay, pushOverlay } from './overlayStack';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  footer?: ReactNode;
  children: ReactNode;
  /** close when clicking the backdrop (default true) */
  dismissable?: boolean;
  headerExtra?: ReactNode;
  bodyStyle?: React.CSSProperties;
}

let openModals = 0;
export function isModalOpen() {
  return openModals > 0;
}

export function Modal({ open, onClose, title, size = 'md', footer, children, dismissable = true, headerExtra, bodyStyle }: ModalProps) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    openModals++;
    const id = pushOverlay();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopOverlay(id)) {
        e.stopPropagation();
        e.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      openModals--;
      popOverlay(id);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (dismissable && e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal ${size}`} role="dialog" aria-modal="true">
        {title != null && (
          <div className="modal-header">
            <h2>{title}</h2>
            <div className="spacer" />
            {headerExtra}
            <Button variant="ghost" size="sm" className="icon" aria-label="Close" onClick={onClose}>
              <X />
            </Button>
          </div>
        )}
        <div className="modal-body" style={bodyStyle}>
          {children}
        </div>
        {footer != null && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------------------------------------------------------- imperative dialogs */

interface DialogReq {
  id: number;
  kind: 'confirm' | 'prompt' | 'alert';
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  defaultValue?: string;
  placeholder?: string;
  multiline?: boolean;
  resolve: (v: any) => void;
}

const useDialogs = create<{ list: DialogReq[] }>(() => ({ list: [] }));
let dialogId = 0;

function push(req: Omit<DialogReq, 'id'>) {
  useDialogs.setState((s) => ({ list: [...s.list, { ...req, id: ++dialogId }] }));
}

function finish(id: number, value: unknown) {
  const req = useDialogs.getState().list.find((d) => d.id === id);
  useDialogs.setState((s) => ({ list: s.list.filter((d) => d.id !== id) }));
  req?.resolve(value);
}

export function confirmDialog(opts: { title: string; message?: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => push({ kind: 'confirm', ...opts, resolve }));
}

export function promptDialog(opts: { title: string; message?: ReactNode; defaultValue?: string; placeholder?: string; confirmLabel?: string; multiline?: boolean }): Promise<string | null> {
  return new Promise((resolve) => push({ kind: 'prompt', ...opts, resolve }));
}

export function alertDialog(opts: { title: string; message?: ReactNode }): Promise<void> {
  return new Promise((resolve) => push({ kind: 'alert', ...opts, resolve }));
}

function PromptBody({ req }: { req: DialogReq }) {
  const [value, setValue] = useState(req.defaultValue ?? '');
  const submit = () => finish(req.id, value);
  return (
    <Modal
      open
      size="sm"
      title={req.title}
      onClose={() => finish(req.id, null)}
      footer={
        <>
          <Button onClick={() => finish(req.id, null)}>{req.cancelLabel ?? 'Cancel'}</Button>
          <Button variant="primary" onClick={submit}>
            {req.confirmLabel ?? 'OK'}
          </Button>
        </>
      }
    >
      {req.message && <div style={{ marginBottom: 10, color: 'var(--text-2)' }}>{req.message}</div>}
      {req.multiline ? (
        <textarea className="textarea" autoFocus value={value} placeholder={req.placeholder} rows={5} onChange={(e) => setValue(e.target.value)} />
      ) : (
        <input
          className="input"
          autoFocus
          value={value}
          placeholder={req.placeholder}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      )}
    </Modal>
  );
}

export function DialogHost() {
  const list = useDialogs((s) => s.list);
  return (
    <>
      {list.map((req) =>
        req.kind === 'prompt' ? (
          <PromptBody key={req.id} req={req} />
        ) : (
          <Modal
            key={req.id}
            open
            size="sm"
            title={req.title}
            onClose={() => finish(req.id, req.kind === 'confirm' ? false : undefined)}
            footer={
              req.kind === 'alert' ? (
                <Button variant="primary" autoFocus onClick={() => finish(req.id, undefined)}>
                  OK
                </Button>
              ) : (
                <>
                  <Button onClick={() => finish(req.id, false)}>{req.cancelLabel ?? 'Cancel'}</Button>
                  <Button variant={req.danger ? 'danger-solid' : 'primary'} autoFocus onClick={() => finish(req.id, true)}>
                    {req.confirmLabel ?? 'OK'}
                  </Button>
                </>
              )
            }
          >
            {req.message && <div style={{ color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>{req.message}</div>}
          </Modal>
        ),
      )}
    </>
  );
}
