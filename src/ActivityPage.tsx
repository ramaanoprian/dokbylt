import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { MODULES, moduleById } from './modules';
import type { Activity } from './backend';
import { Icon } from './icons';
import { fmtDate, fmtTime } from './util';

const VERB: Record<string, string> = {
  tambah: 'mencatat',
  'pindah tahap': 'memindahkan',
  'ubah data': 'mengubah',
  hapus: 'menghapus',
};

export const initials = (name: string) =>
  name
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

function describeDetail(a: Activity) {
  if (!a.detail) return '';
  if (a.action === 'ubah data') {
    const mod = moduleById(a.module);
    const labels = a.detail
      .split(',')
      .map((k) => mod?.fields.find((f) => f.key === k.trim())?.label.toLowerCase() ?? k.trim());
    return 'Isian: ' + labels.join(', ');
  }
  if (a.action === 'hapus') return `Tahap terakhir: ${a.detail}`;
  return a.detail;
}

export function ActivityLine({ a, showDate, onOpen }: { a: Activity; showDate?: boolean; onOpen?: () => void }) {
  const mod = moduleById(a.module);
  return (
    <li className={'activity' + (onOpen && a.action !== 'hapus' ? ' clickable' : '')} onClick={a.action !== 'hapus' ? onOpen : undefined}>
      <span className="avatar" title={a.userName}>
        {initials(a.userName)}
      </span>
      <span className="grow">
        <span>
          <b>{a.userName}</b> {VERB[a.action] ?? a.action} {mod?.itemName}{' '}
          {a.label && <span className="quote">“{a.label}”</span>}
        </span>
        <span className="muted small block">{describeDetail(a)}</span>
      </span>
      <span className="meta">
        {mod && <span className="tag hide-sm">{mod.menu}</span>}
        <span className="muted small">{showDate ? fmtDate(a.at) + ' ' : ''}{fmtTime(a.at)}</span>
      </span>
    </li>
  );
}

export function ActivityPage({ activity, go }: { activity: Activity[]; go: (m: Activity['module'], id?: string) => void }) {
  const [who, setWho] = useState('');
  const [mod, setMod] = useState('');
  const [q, setQ] = useState('');
  const users = useMemo(() => [...new Set(activity.map((a) => a.userName))].sort(), [activity]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = activity.filter(
      (a) =>
        (!who || a.userName === who) &&
        (!mod || a.module === mod) &&
        (!needle || `${a.label} ${a.detail} ${a.userName}`.toLowerCase().includes(needle)),
    );
    const out = new Map<string, Activity[]>();
    for (const a of list) {
      const day = fmtDate(a.at);
      out.set(day, [...(out.get(day) ?? []), a]);
    }
    return [...out.entries()];
  }, [activity, who, mod, q]);

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Riwayat Aktivitas</h1>
          <p className="muted">
            Setiap penambahan, perubahan, perpindahan tahap, dan penghapusan tercatat otomatis beserta akun yang
            melakukannya.
          </p>
        </div>
      </header>

      <div className="panel">
        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input type="search" placeholder="Cari…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Semua staf</option>
            {users.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <select value={mod} onChange={(e) => setMod(e.target.value)}>
            <option value="">Semua menu</option>
            {MODULES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.menu}
              </option>
            ))}
          </select>
        </div>
        {groups.length === 0 ? (
          <div className="empty">
            <Icon name="aktivitas" size={24} />
            <p>Belum ada aktivitas yang cocok.</p>
          </div>
        ) : (
          groups.map(([day, items]) => (
            <div key={day} className="day">
              <h3 className="day-head">{day}</h3>
              <ul className="list">
                {items.map((a) => (
                  <ActivityLine key={a.id} a={a} onOpen={a.recordId ? () => go(a.module, a.recordId) : undefined} />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
