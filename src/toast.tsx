import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, X } from 'lucide-react';

interface ToastAction {
  label: string;
  run: () => void;
}

interface Toast {
  id: number;
  text: string;
  action?: ToastAction;
}

const Ctx = createContext<(text: string, action?: ToastAction) => void>(() => {});

export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (text: string, action?: ToastAction) => {
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-2), { id, text, action }]);
      setTimeout(() => dismiss(id), action ? 6000 : 3500);
    },
    [dismiss],
  );

  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast-item">
            <CheckCircle2 size={18} className="toast-ok" />
            <span className="grow">{t.text}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Tutup">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
