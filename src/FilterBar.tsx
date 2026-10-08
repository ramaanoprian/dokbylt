import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import type { Field, ModuleDef } from './modules';
import type { DocRecord } from './backend';

/** Saringan unit dan bulan pada halaman menu. Kosong berarti semua. */
export interface Saring {
  unit: string;
  month: string;
}

export const NO_SARING: Saring = { unit: '', month: '' };

/** Field pilihan unit untuk saringan: `unit`, atau `tujuan` bila menu tidak punya unit. */
export const unitFieldOf = (mod: ModuleDef): Field | undefined =>
  ['unit', 'tujuan'].map((k) => mod.fields.find((f) => f.key === k && f.type === 'select' && f.options)).find(Boolean);

/** Bulan (YYYY-MM) dari tanggal utama data, atau kosong bila tanggalnya tidak ada. */
export function monthOf(mod: ModuleDef, r: DocRecord) {
  const m = (r.values[mod.dateField] ?? '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(m) ? m : '';
}

/** "2026-10" menjadi "Oktober 2026". */
export function monthLabel(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

const storeKey = (mod: string) => `dokbylt:saring:${mod}`;

/** Saringan diingat per menu selama sesi browser (hilang saat tab ditutup). */
export function readSaring(mod: ModuleDef): Saring {
  try {
    const v = JSON.parse(sessionStorage.getItem(storeKey(mod.id)) ?? '{}') as Partial<Saring>;
    const unit = typeof v.unit === 'string' && unitFieldOf(mod)?.options?.includes(v.unit) ? v.unit : '';
    const month = typeof v.month === 'string' && /^\d{4}-\d{2}$/.test(v.month) ? v.month : '';
    return { unit, month };
  } catch {
    return NO_SARING;
  }
}

export function writeSaring(mod: ModuleDef, s: Saring) {
  try {
    if (s.unit || s.month) sessionStorage.setItem(storeKey(mod.id), JSON.stringify(s));
    else sessionStorage.removeItem(storeKey(mod.id));
  } catch {
    /* abaikan */
  }
}

export interface ChipOption {
  value: string;
  label: string;
  count: number;
}

interface ChipProps {
  /** Nama saringan, mis. "Unit". */
  name: string;
  /** Pilihan pertama untuk membuang saringan, mis. "Semua unit". */
  all: string;
  value: string;
  options: ChipOption[];
  onChange: (v: string) => void;
}

/** Chip tarik-turun kecil; berwarna biru dengan tombol × saat sedang dipakai. */
export function FilterChip({ name, all, value, options, onChange }: ChipProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cur = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => !wrapRef.current?.contains(e.target as Node) && setOpen(false);
    // Esc hanya menutup pilihan ini, tidak ikut menutup panel atau pilihan data di halaman.
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      btnRef.current?.focus();
    };
    addEventListener('mousedown', click);
    addEventListener('keydown', key, true);
    const list = listRef.current;
    (list?.querySelector<HTMLElement>('[aria-selected="true"]') ?? list?.querySelector<HTMLElement>('button'))?.focus({
      preventScroll: true,
    });
    return () => {
      removeEventListener('mousedown', click);
      removeEventListener('keydown', key, true);
    };
  }, [open]);

  const pick = (v: string) => {
    setOpen(false);
    onChange(v);
    btnRef.current?.focus();
  };

  // Panah atas/bawah berpindah di antara pilihan.
  const arrows = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    e.stopPropagation();
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    items[next]?.focus();
  };

  return (
    <div className="ux-chip-wrap" ref={wrapRef}>
      <div className={'ux-chip' + (value ? ' on' : '') + (open ? ' open' : '')}>
        <button
          ref={btnRef}
          type="button"
          className="ux-chip-main"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && !open) {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          {value ? (
            <>
              <span className="ux-chip-k">{name}</span>
              <span className="ux-chip-v">{cur?.label ?? value}</span>
            </>
          ) : (
            name
          )}
          <ChevronDown size={14} className="ux-chip-caret" aria-hidden />
        </button>
        {value && (
          <button type="button" className="ux-chip-x" onClick={() => onChange('')} aria-label={`Hapus saringan ${name.toLowerCase()}`}>
            <X size={13} strokeWidth={2.6} />
          </button>
        )}
      </div>
      {open && (
        <div className="ux-pop" role="listbox" aria-label={name} ref={listRef} onKeyDown={arrows}>
          <button type="button" role="option" aria-selected={!value} onClick={() => pick('')}>
            <span className="grow ellipsis">{all}</span>
            <span className="ux-pop-check">{!value && <Check size={15} />}</span>
          </button>
          <hr />
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={o.count ? '' : 'zero'}
              onClick={() => pick(o.value)}
            >
              <span className="grow ellipsis">{o.label}</span>
              <span className="ux-pop-n">{o.count.toLocaleString('id-ID')}</span>
              <span className="ux-pop-check">{o.value === value && <Check size={15} />}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
