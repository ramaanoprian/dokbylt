import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  icon?: ReactNode;
  label: string;
  hint?: string;
  danger?: boolean;
  run: () => void;
}

interface Props {
  /** Isi tombol pemicu. */
  trigger: ReactNode;
  triggerClass?: string;
  title?: string;
  /** Kelompok item; tiap kelompok dipisah garis. */
  groups: MenuItem[][];
  align?: 'left' | 'right';
  /** Buka ke atas (untuk menu di bagian bawah sidebar). */
  up?: boolean;
  wide?: boolean;
}

/** Menu tarik-turun sederhana: klik di luar atau Esc untuk menutup. */
export function Menu({ trigger, triggerClass = 'btn', title, groups, align = 'right', up, wide }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('mousedown', click);
    addEventListener('keydown', key);
    return () => {
      removeEventListener('mousedown', click);
      removeEventListener('keydown', key);
    };
  }, [open]);

  const shown = groups.filter((g) => g.length);
  return (
    <div className={'menu-wrap' + (wide ? ' wide' : '')} ref={ref}>
      <button
        type="button"
        className={triggerClass}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={title}
      >
        {trigger}
      </button>
      {open && (
        <div className={`menu-pop ${align}${up ? ' up' : ''}`} role="menu">
          {shown.map((g, gi) => (
            <div key={gi} className="menu-group">
              {g.map((it) => (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  className={it.danger ? 'danger' : ''}
                  onClick={() => {
                    setOpen(false);
                    it.run();
                  }}
                >
                  {it.icon}
                  <span className="grow">{it.label}</span>
                  {it.hint && <span className="menu-hint">{it.hint}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
