import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronUp, FileSpreadsheet, X } from 'lucide-react';
import type { ModuleDef } from './modules';
import type { DocRecord } from './backend';
import { stageClass } from './stats';
import { isBehind } from './records';

interface Props {
  mod: ModuleDef;
  selected: DocRecord[];
  /** Jumlah data di daftar sekarang (semua halaman). */
  total: number;
  /** Ada untuk memilih seluruh daftar bila yang terpilih baru yang tampil saja. */
  onSelectAll?: () => void;
  onMove: (target: string) => void;
  onExport: () => void;
  onClear: () => void;
}

/** Bilah gelap di bawah layar untuk data yang dipilih: pindah tahap, ekspor, atau batal. */
export function BulkBar({ mod, selected, total, onSelectAll, onMove, onExport, onClear }: Props) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Isi terakhir tetap tampil selama bilah meluncur turun.
  const keep = useRef<DocRecord[]>(selected);
  if (selected.length) keep.current = selected;
  const list = selected.length ? selected : keep.current;
  const on = selected.length > 0;

  const statuses = new Set(list.map((r) => r.status));
  const shared = statuses.size === 1 ? list[0]?.status : undefined;
  const sharedIdx = shared ? mod.statuses.indexOf(shared) : -1;
  const next = shared && sharedIdx < mod.statuses.length - 1 ? mod.statuses[sharedIdx + 1] : undefined;
  const movable = (s: string) => list.filter((r) => isBehind(mod, r, s)).length;

  useEffect(() => {
    if (!on) setMenu(false);
  }, [on]);

  useEffect(() => {
    if (!menu) return;
    const click = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setMenu(false);
    };
    addEventListener('mousedown', click);
    addEventListener('keydown', key, true);
    menuRef.current?.querySelector<HTMLElement>('.ux-stage-opt:not(:disabled)')?.focus({ preventScroll: true });
    return () => {
      removeEventListener('mousedown', click);
      removeEventListener('keydown', key, true);
    };
  }, [menu]);

  const move = (s: string) => {
    setMenu(false);
    onMove(s);
  };

  return (
    <div className={'ux-bulk' + (on ? ' on' : '')} role="region" aria-label="Tindakan untuk data terpilih" inert={!on}>
      <div className="ux-bulk-info">
        <span className="ux-bulk-count" aria-live="polite">
          <b>{list.length.toLocaleString('id-ID')}</b> dipilih
        </span>
        {onSelectAll && (
          <button type="button" className="ux-bulk-link" onClick={onSelectAll}>
            Pilih semua {total.toLocaleString('id-ID')}
          </button>
        )}
        <button type="button" className="ux-bulk-x ux-only-phone" onClick={onClear} aria-label="Batal memilih">
          <X size={18} />
        </button>
      </div>
      <div className="ux-bulk-actions">
        <button
          type="button"
          className="ux-bulk-btn"
          onClick={onExport}
          title="Unduh data terpilih sebagai Excel"
          aria-label="Ekspor terpilih"
        >
          <FileSpreadsheet size={16} /> <span>Ekspor terpilih</span>
        </button>
        <div className="ux-bulk-move" ref={menuRef}>
          {next ? (
            <div className="ux-split">
              <button type="button" className="ux-bulk-primary" onClick={() => move(next)} title={`Pindahkan ke ${next}`}>
                <span className="ellipsis">Pindahkan ke {next}</span>
                <ArrowRight size={15} />
              </button>
              <button
                type="button"
                className="ux-bulk-primary ux-caret"
                onClick={() => setMenu(!menu)}
                aria-haspopup="menu"
                aria-expanded={menu}
                aria-label="Pilih tahap lain"
                title="Pilih tahap lain"
              >
                <ChevronUp size={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ux-bulk-primary"
              onClick={() => setMenu(!menu)}
              aria-haspopup="menu"
              aria-expanded={menu}
            >
              <span className="ellipsis">{shared ? 'Sudah di tahap akhir' : 'Pindahkan ke…'}</span>
              <ChevronUp size={16} />
            </button>
          )}
          {menu && (
            <div className="ux-stage-menu" role="menu" aria-label="Pindahkan ke tahap">
              <p className="ux-stage-menu-h">Pindahkan ke tahap</p>
              {mod.statuses.map((s) => {
                const n = movable(s);
                return (
                  <button
                    key={s}
                    type="button"
                    role="menuitem"
                    className="ux-stage-opt"
                    disabled={n === 0}
                    onClick={() => move(s)}
                  >
                    <i className={'dot ' + stageClass(mod, s)} />
                    <span className="grow ellipsis">{s}</span>
                    <span className="ux-stage-n">{n === 0 ? '–' : n === list.length ? `${n}` : `${n} dari ${list.length}`}</span>
                  </button>
                );
              })}
              <p className="ux-stage-menu-f">Data yang sudah di tahap itu atau lebih lanjut tidak ikut dipindah.</p>
            </div>
          )}
        </div>
        <button type="button" className="ux-bulk-btn ghost ux-hide-phone" onClick={onClear}>
          Batal
        </button>
      </div>
    </div>
  );
}
