import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Moon, Plus, Search, Sun } from 'lucide-react';
import { MODULES, type ModuleId } from './modules';
import type { DataStore } from './backend';
import { Icon, type IconName } from './icons';
import { fmtDate } from './util';

interface Item {
  id: string;
  icon: IconName | 'plus' | 'theme';
  mod?: ModuleId;
  title: string;
  sub: string;
  run: () => void;
}

interface Props {
  data: DataStore;
  dark: boolean;
  onClose: () => void;
  go: (p: ModuleId | 'ringkasan' | 'aktivitas', openId?: string) => void;
  toggleTheme: () => void;
}

const label = (v: Record<string, string>) => v.perihal || v.kegiatan || v.uraian || v.tujuan || v.asal || '(tanpa judul)';

export function CommandPalette({ data, dark, onClose, go, toggleTheme }: Props) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase();
    const actions: Item[] = [
      ...MODULES.map((m) => ({
        id: 'new-' + m.id,
        icon: 'plus' as const,
        mod: m.id,
        title: `Catat ${m.itemName} baru`,
        sub: m.title,
        run: () => go(m.id, 'baru'),
      })),
      { id: 'go-ringkasan', icon: 'ringkasan', title: 'Buka Ringkasan', sub: 'Halaman', run: () => go('ringkasan') },
      ...MODULES.map((m) => ({ id: 'go-' + m.id, icon: m.icon, mod: m.id, title: `Buka ${m.title}`, sub: 'Halaman', run: () => go(m.id) })),
      { id: 'go-aktivitas', icon: 'aktivitas', title: 'Buka Riwayat Aktivitas', sub: 'Halaman', run: () => go('aktivitas') },
      { id: 'theme', icon: 'theme', title: dark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap', sub: 'Tampilan', run: toggleTheme },
    ];
    if (!needle) return actions.filter((a) => a.id.startsWith('new-') || a.id === 'theme');
    const matchedActions = actions.filter((a) => `${a.title} ${a.sub}`.toLowerCase().includes(needle));
    const records: Item[] = MODULES.flatMap((m) =>
      data[m.id]
        .filter((r) => Object.values(r.values).some((v) => String(v ?? '').toLowerCase().includes(needle)))
        .map((r) => ({
          id: r.id,
          icon: m.icon,
          mod: m.id,
          title: label(r.values),
          sub: `${m.menu} · ${r.status} · ${fmtDate(r.values[m.dateField])}`,
          run: () => go(m.id, r.id),
        })),
    ).slice(0, 30);
    return [...records, ...matchedActions];
  }, [q, data, dark, go, toggleTheme]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const pick = (it: Item) => {
    onClose();
    it.run();
  };

  return (
    <div className="palette-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Pencarian cepat">
        <div className="palette-input">
          <Search size={18} />
          <input
            autoFocus
            placeholder="Cari dokumen, surat, resi, kegiatan… atau ketik perintah"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(items.length - 1, s + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter' && items[sel]) {
                pick(items[sel]);
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-list" ref={listRef}>
          {items.length === 0 && <li className="palette-empty">Tidak ada yang cocok dengan “{q}”.</li>}
          {items.map((it, i) => (
            <li
              key={it.id}
              aria-selected={i === sel}
              onMouseMove={() => setSel(i)}
              onClick={() => pick(it)}
            >
              <span className={`chip-icon sm ${it.mod ? 'c-' + it.mod : 'c-aktivitas'}`}>
                {it.icon === 'plus' ? (
                  <Plus size={14} />
                ) : it.icon === 'theme' ? (
                  dark ? <Sun size={14} /> : <Moon size={14} />
                ) : (
                  <Icon name={it.icon} size={14} />
                )}
              </span>
              <span className="grow">
                <span className="ellipsis block">{it.title}</span>
                <span className="muted small ellipsis block">{it.sub}</span>
              </span>
              {i === sel && <CornerDownLeft size={14} className="muted" />}
            </li>
          ))}
        </ul>
        <div className="palette-foot muted small">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> pilih
          </span>
          <span>
            <kbd>Enter</kbd> buka
          </span>
          <span>
            <kbd>N</kbd> tambah di halaman menu
          </span>
        </div>
      </div>
    </div>
  );
}
