import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { MODULES, moduleById } from './modules';
import type { Activity } from './backend';
import { Icon } from './icons';
import { Hero, LocalNav } from './LocalNav';
import { fmtDate, fmtTime, quoteList } from './util';

type Range = '7' | '30' | 'bulan';
const RANGES: [Range, string][] = [
  ['7', '7 hari'],
  ['30', '30 hari'],
  ['bulan', 'Bulan ini'],
];
function rangeStart(r: Range) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (r === 'bulan') d.setDate(1);
  else d.setDate(d.getDate() - (Number(r) - 1));
  return d.getTime();
}

/** Jumlah aktivitas yang ditampilkan dulu; sisanya lewat tombol "Tampilkan 50 lagi". */
const PAGE = 50;
const nf = (n: number) => n.toLocaleString('id-ID');

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
      .map((k) => mod?.fields.find((f) => f.key === k.trim())?.label ?? k.trim());
    return 'Isian ' + quoteList(labels);
  }
  if (a.action === 'hapus') return `Tahap terakhir: ${a.detail}`;
  return a.detail;
}

export function ActivityLine({ a, showDate, onOpen }: { a: Activity; showDate?: boolean; onOpen?: () => void }) {
  const mod = moduleById(a.module);
  return (
    <li
      className={'activity' + (onOpen && a.action !== 'hapus' ? ' clickable' : '')}
      onClick={a.action !== 'hapus' ? onOpen : undefined}
    >
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
        <span className="muted small">
          {showDate ? fmtDate(a.at) + ' ' : ''}
          {fmtTime(a.at)}
        </span>
      </span>
    </li>
  );
}

export function ActivityPage({
  activity,
  go,
}: {
  activity: Activity[];
  go: (m: Activity['module'], id?: string) => void;
}) {
  const [who, setWho] = useState('');
  const [mod, setMod] = useState('');
  const [q, setQ] = useState('');
  const users = useMemo(() => [...new Set(activity.map((a) => a.userName))].sort(), [activity]);
  const [range, setRange] = useState<Range>('7');

  // Ringkasan per staf dalam rentang waktu yang dipilih.
  const team = useMemo(() => {
    const from = rangeStart(range);
    const inRange = activity.filter((a) => new Date(a.at).getTime() >= from);
    const by = new Map<string, Activity[]>();
    for (const a of inRange) by.set(a.userName, [...(by.get(a.userName) ?? []), a]);
    const people = [...by.entries()]
      .map(([name, list]) => ({
        name,
        total: list.length,
        added: list.filter((a) => a.action === 'tambah').length,
        moved: list.filter((a) => a.action === 'pindah tahap').length,
        edited: list.filter((a) => a.action === 'ubah data').length,
        perMod: MODULES.map((m) => ({ m, n: list.filter((a) => a.module === m.id).length })).filter((x) => x.n),
        last: list[0]?.at,
      }))
      .sort((a, b) => b.total - a.total);
    return {
      total: inRange.length,
      added: inRange.filter((a) => a.action === 'tambah').length,
      moved: inRange.filter((a) => a.action === 'pindah tahap').length,
      people,
    };
  }, [activity, range]);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return activity.filter(
      (a) =>
        (!who || a.userName === who) &&
        (!mod || a.module === mod) &&
        (!needle || `${a.label} ${a.detail} ${a.userName}`.toLowerCase().includes(needle)),
    );
  }, [activity, who, mod, q]);
  // Daftar panjang: 50 dulu. Kembali ke 50 saat pencarian atau saringan berubah.
  const pageKey = `${who}|${mod}|${q}`;
  const [more, setMore] = useState({ key: pageKey, n: PAGE });
  if (more.key !== pageKey) setMore({ key: pageKey, n: PAGE });
  const limit = more.key === pageKey ? more.n : PAGE;
  const remaining = matches.length - limit;
  const groups = useMemo(() => {
    const out = new Map<string, Activity[]>();
    for (const a of matches.slice(0, limit)) {
      const day = fmtDate(a.at);
      out.set(day, [...(out.get(day) ?? []), a]);
    }
    return [...out.entries()];
  }, [matches, limit]);

  return (
    <>
      <LocalNav title="Riwayat" />
      <section className="page">
        <Hero
          title="Riwayat aktivitas."
          lead="Setiap penambahan, perubahan, perpindahan tahap, dan penghapusan tercatat otomatis beserta akunnya."
        />

        <div className="team-head">
          <h2 className="section-title">
            Tim. <span>Siapa mengerjakan berapa.</span>
          </h2>
          <div className="segmented" role="tablist" aria-label="Rentang waktu">
            {RANGES.map(([v, l]) => (
              <button key={v} className={range === v ? 'on' : ''} onClick={() => setRange(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <dl className="kpis four">
          <div className="kpi">
            <dt>Aktivitas</dt>
            <dd className="kpi-num">{team.total}</dd>
            <dd className="kpi-sub">semua jenis</dd>
          </div>
          <div className="kpi">
            <dt>Dicatat</dt>
            <dd className="kpi-num">{team.added}</dd>
            <dd className="kpi-sub">data baru</dd>
          </div>
          <div className="kpi">
            <dt>Dipindah tahap</dt>
            <dd className="kpi-num">{team.moved}</dd>
            <dd className="kpi-sub">langkah maju atau mundur</dd>
          </div>
          <div className="kpi">
            <dt>Staf aktif</dt>
            <dd className="kpi-num">{team.people.length}</dd>
            <dd className="kpi-sub">dari {users.length} yang pernah tercatat</dd>
          </div>
        </dl>
        {team.people.length > 0 && (
          <div className="people">
            {team.people.map((p) => (
              <button
                key={p.name}
                className={'person' + (who === p.name ? ' on' : '')}
                onClick={() => setWho(who === p.name ? '' : p.name)}
                title={who === p.name ? 'Tampilkan semua staf' : `Tampilkan aktivitas ${p.name}`}
              >
                <span className="person-top">
                  <span className="avatar lg">{initials(p.name)}</span>
                  <span className="grow">
                    <b className="ellipsis block">{p.name}</b>
                    <span className="muted small">{p.last ? `terakhir ${fmtDate(p.last)} ${fmtTime(p.last)}` : ''}</span>
                  </span>
                  <span className="person-total">{p.total}</span>
                </span>
                <span className="person-bar" aria-hidden>
                  {p.perMod.map(({ m, n }) => (
                    <i key={m.id} data-mod={m.id} style={{ flexGrow: n }} />
                  ))}
                </span>
                <span className="person-facts">
                  <span>
                    <b>{p.added}</b> dicatat
                  </span>
                  <span>
                    <b>{p.moved}</b> dipindah
                  </span>
                  <span>
                    <b>{p.edited}</b> diubah
                  </span>
                </span>
                <span className="person-mods">
                  {p.perMod.map(({ m, n }) => (
                    <span key={m.id} data-mod={m.id}>
                      <i /> {m.menu} {n}
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        )}

        <h2 className="section-title">
          Semua aktivitas. <span>Urut dari yang terbaru.</span>
        </h2>
        <div className="controls">
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
        <div className="card">
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
          {remaining > 0 && (
            <div className="card-foot ux-foot">
              <span className="muted" aria-live="polite">
                Menampilkan {nf(limit)} dari {nf(matches.length)} aktivitas
              </span>
              <button type="button" className="btn small ux-more" onClick={() => setMore({ key: pageKey, n: limit + PAGE })}>
                Tampilkan {nf(Math.min(PAGE, remaining))} lagi
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
