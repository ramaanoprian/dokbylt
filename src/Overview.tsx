import { useMemo } from 'react';
import { BellRing, ChevronRight, Plus } from 'lucide-react';
import { MODULES, UNITS, moduleById, type ModuleId } from './modules';
import type { Activity, DataStore } from './backend';
import { Icon } from './icons';
import { ActivityLine } from './ActivityPage';
import { ActivityBars, CountUp, HBars, type DayBar } from './charts';
import { daysSince, dueLabel, dueTone, fmtDate, isDone, lastMove } from './util';
import { collectReminders } from './reminders';

interface Props {
  data: DataStore;
  activity: Activity[];
  userName: string;
  loading: boolean;
  go: (id: ModuleId | 'aktivitas', openId?: string) => void;
}

const label = (v: Record<string, string>) => v.perihal || v.kegiatan || v.uraian || v.tujuan || v.asal || '';
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function Overview({ data, activity, userName, loading, go }: Props) {
  const now = new Date();
  const month = dayKey(now).slice(0, 7);
  const evp = moduleById('evp');
  const evpActive = data.evp.filter((r) => !isDone(evp, r));
  const hour = now.getHours();
  const greet = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';

  const stale = MODULES.flatMap((m) =>
    data[m.id]
      .filter((r) => !isDone(m, r) && daysSince(lastMove(r)) >= 3)
      .map((r) => ({ m, r, age: daysSince(lastMove(r)) })),
  ).sort((a, b) => b.age - a.age);

  const reminders = useMemo(() => collectReminders(data), [data]);

  const days: DayBar[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of activity) {
      const k = dayKey(new Date(a.at));
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      const k = dayKey(d);
      return {
        key: k,
        value: counts.get(k) ?? 0,
        short: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        label: d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }),
      };
    });
  }, [activity]);

  const byJenis = useMemo(() => {
    const opts = evp.fields.find((f) => f.key === 'jenis')!.options!;
    return opts
      .map((o) => ({
        label: o,
        value: data.evp.filter((r) => r.values.jenis === o && (r.values.tanggalMasuk ?? '').startsWith(month)).length,
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [data.evp, evp, month]);

  return (
    <section className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">
            {now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <h1>
            {greet}
            {userName ? `, ${userName.split(' ')[0]}` : ''}
          </h1>
          <p className="muted">
            {reminders.length > 0
              ? `${reminders.length} data mendekati atau melewati tenggat.`
              : stale.length > 0
                ? `Ada ${stale.length} pekerjaan yang tertahan 3 hari atau lebih.`
                : 'Semua pekerjaan berjalan lancar hari ini.'}
          </p>
        </div>
        <div className="quick">
          {MODULES.map((m) => (
            <button key={m.id} className="quick-btn" onClick={() => go(m.id, 'baru')} title={`Catat ${m.itemName} baru`}>
              <span className={`chip-icon sm c-${m.id}`}>
                <Icon name={m.icon} size={14} />
              </span>
              <span>{m.menu}</span>
              <Plus size={14} className="muted" />
            </button>
          ))}
        </div>
      </header>

      {reminders.length > 0 && (
        <div className="card pad remind">
          <div className="card-head">
            <div className="remind-title">
              <span className="remind-icon">
                <BellRing size={18} />
              </span>
              <div>
                <h2>Pengingat tenggat</h2>
                <p className="muted small">Lewat tenggat atau jatuh tempo dalam 3 hari</p>
              </div>
            </div>
            <span className="pill warn">{reminders.length}</span>
          </div>
          <ul className="remind-list">
            {reminders.slice(0, 6).map(({ m, r, date, days }) => (
              <li key={r.id} onClick={() => go(m.id, r.id)}>
                <span className={`chip-icon sm c-${m.id}`}>
                  <Icon name={m.icon} size={14} />
                </span>
                <span className="grow">
                  <span className="ellipsis block">{label(r.values) || m.itemName}</span>
                  <span className="muted small ellipsis block">
                    {m.menu} · {r.status} · tenggat {fmtDate(date)}
                  </span>
                </span>
                <span className={'due ' + dueTone(days)}>{dueLabel(days)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="stats">
        {MODULES.map((m, idx) => {
          const rows = data[m.id];
          const active = rows.filter((r) => !isDone(m, r)).length;
          const thisMonth = rows.filter((r) => (r.values[m.dateField] ?? '').startsWith(month)).length;
          const late = rows.filter((r) => !isDone(m, r) && daysSince(lastMove(r)) >= 3).length;
          return (
            <button key={m.id} className="stat" onClick={() => go(m.id)} style={{ animationDelay: `${idx * 40}ms` }}>
              <div className="stat-top">
                <span className={`chip-icon c-${m.id}`}>
                  <Icon name={m.icon} />
                </span>
                {late > 0 && <span className="pill warn">{late} tertahan</span>}
              </div>
              <span className="stat-title">{m.menu}</span>
              <span className="stat-num">{loading && !rows.length ? <span className="sk w30" /> : <CountUp value={active} />}</span>
              <span className="muted small">berjalan · {thisMonth} bulan ini</span>
            </button>
          );
        })}
      </div>

      <div className="grid-main">
        <div className="card pad">
          <div className="card-head">
            <div>
              <h2>Aktivitas 14 hari terakhir</h2>
              <p className="muted small">Jumlah pencatatan, perubahan, dan perpindahan tahap per hari</p>
            </div>
            <button className="link" onClick={() => go('aktivitas')}>
              Riwayat <ChevronRight size={14} />
            </button>
          </div>
          <ActivityBars data={days} />
        </div>

        <div className="card pad">
          <div className="card-head">
            <h2>Perlu ditindaklanjuti</h2>
            {stale.length > 0 && <span className="pill warn">{stale.length}</span>}
          </div>
          {stale.length === 0 ? (
            <div className="all-good">
              <span className="big-check">✓</span>
              <p className="muted small">Tidak ada pekerjaan yang tertahan 3 hari atau lebih.</p>
            </div>
          ) : (
            <ul className="rows">
              {stale.slice(0, 5).map(({ m, r, age }) => (
                <li key={r.id} className="clickable" onClick={() => go(m.id, r.id)}>
                  <span className={`chip-icon sm c-${m.id}`}>
                    <Icon name={m.icon} size={14} />
                  </span>
                  <span className="grow">
                    <span className="ellipsis block">{label(r.values) || m.itemName}</span>
                    <span className="muted small block">{r.status}</span>
                  </span>
                  <span className="age">{age} hari</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card pad">
          <div className="card-head">
            <h2>TTD EVP per unit</h2>
            <button className="link" onClick={() => go('evp')}>
              Buka <ChevronRight size={14} />
            </button>
          </div>
          {evpActive.length === 0 ? (
            <p className="muted small">Tidak ada dokumen yang sedang menunggu.</p>
          ) : (
            <div className="table-wrap">
              <table className="mini">
                <thead>
                  <tr>
                    <th>Unit</th>
                    {evp.statuses.slice(0, -1).map((s) => (
                      <th key={s}>{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {UNITS.map((u) => {
                    const rows = evpActive.filter((r) => r.values.unit === u);
                    if (!rows.length) return null;
                    return (
                      <tr key={u}>
                        <td>{u}</td>
                        {evp.statuses.slice(0, -1).map((s) => {
                          const n = rows.filter((r) => r.status === s).length;
                          return <td key={s}>{n ? <span className="num-chip">{n}</span> : <span className="muted">–</span>}</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card pad">
          <div className="card-head">
            <div>
              <h2>Dokumen TTD EVP bulan ini</h2>
              <p className="muted small">Per jenis dokumen</p>
            </div>
          </div>
          {byJenis.length === 0 ? (
            <p className="muted small">Belum ada dokumen bulan ini.</p>
          ) : (
            <HBars data={byJenis} />
          )}
        </div>
      </div>

      <div className="card pad">
        <div className="card-head">
          <h2>Aktivitas terakhir</h2>
          <button className="link" onClick={() => go('aktivitas')}>
            Semua riwayat <ChevronRight size={14} />
          </button>
        </div>
        {activity.length === 0 ? (
          <p className="muted small">Belum ada aktivitas. Mulai dengan mencatat dokumen di salah satu menu.</p>
        ) : (
          <ul className="rows">
            {activity.slice(0, 6).map((a) => (
              <ActivityLine key={a.id} a={a} onOpen={a.recordId ? () => go(a.module, a.recordId) : undefined} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
