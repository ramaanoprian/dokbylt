import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, FileSpreadsheet, Plus } from 'lucide-react';
import { exportRekap } from './excel';
import { MODULES, UNITS, moduleById, type ModuleId } from './modules';
import type { Activity, DataStore } from './backend';
import { Icon } from './icons';
import { Menu } from './Menu';
import { Hero, LocalNav } from './LocalNav';
import { ActivityLine } from './ActivityPage';
import { ActivityBars, HBars, type DayBar } from './charts';
import { daysSince, dueLabel, dueTone, isDone, lastMove } from './util';
import { collectReminders } from './reminders';

interface Props {
  data: DataStore;
  activity: Activity[];
  loading: boolean;
  go: (id: ModuleId | 'aktivitas', openId?: string) => void;
}

const label = (v: Record<string, string>) => v.perihal || v.kegiatan || v.uraian || v.tujuan || v.asal || '';
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function Overview({ data, activity, loading, go }: Props) {
  const now = new Date();
  const month = dayKey(now).slice(0, 7);
  const evp = moduleById('evp');
  const evpActive = data.evp.filter((r) => !isDone(evp, r));
  const [rekapMonth, setRekapMonth] = useState(month);

  const reminders = useMemo(() => collectReminders(data), [data]);

  // Satu daftar "perlu perhatian": tenggat lebih dulu, lalu pekerjaan yang tertahan 3 hari atau lebih.
  const attention = useMemo(() => {
    const seen = new Set(reminders.map((x) => x.r.id));
    const stale = MODULES.flatMap((m) =>
      data[m.id]
        .filter((r) => !isDone(m, r) && !seen.has(r.id) && daysSince(lastMove(r)) >= 3)
        .map((r) => ({ m, r, age: daysSince(lastMove(r)) })),
    ).sort((a, b) => b.age - a.age);
    return [
      ...reminders.map(({ m, r, days }) => ({ m, r, tone: dueTone(days), note: dueLabel(days) })),
      ...stale.map(({ m, r, age }) => ({ m, r, tone: 'stale', note: `${age} hari di tahap ini` })),
    ];
  }, [data, reminders]);

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

  const monthName = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const totalActive = MODULES.reduce((n, m) => n + data[m.id].filter((r) => !isDone(m, r)).length, 0);

  return (
    <>
      <LocalNav title="Ringkasan">
        <Menu
          triggerClass="pill-btn"
          trigger={
            <>
              <Plus size={14} strokeWidth={2.4} /> Catat baru <ChevronDown size={13} className="hide-sm" />
            </>
          }
          groups={[
            MODULES.map((m) => ({
              icon: <Icon name={m.icon} size={16} />,
              label: m.menu,
              hint: m.itemName,
              run: () => go(m.id, 'baru'),
            })),
          ]}
        />
      </LocalNav>

      <section className="page">
        <Hero
          title="Ringkasan."
          sub={
            attention.length
              ? `${attention.length} hal perlu perhatian hari ini.`
              : totalActive
                ? `${totalActive} pekerjaan berjalan lancar.`
                : 'Semua pekerjaan sudah selesai.'
          }
        >
          <p className="hero-date">
            {now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </Hero>

        <div className="tiles">
          {MODULES.map((m) => {
            const rows = data[m.id];
            const active = rows.filter((r) => !isDone(m, r)).length;
            const thisMonth = rows.filter((r) => (r.values[m.dateField] ?? '').startsWith(month)).length;
            const late = rows.filter((r) => !isDone(m, r) && daysSince(lastMove(r)) >= 3).length;
            return (
              <button key={m.id} className="tile" onClick={() => go(m.id)}>
                <span className="tile-eyebrow">
                  <Icon name={m.icon} size={16} /> {m.menu}
                </span>
                <span className="tile-num">{loading && !rows.length ? <span className="sk w30" /> : active}</span>
                <span className="tile-text">
                  sedang berjalan
                  <span className="muted block">
                    {thisMonth} tercatat bulan ini
                    {late > 0 && <b className="tile-late"> · {late} tertahan</b>}
                  </span>
                </span>
                <span className="tile-link">
                  Buka <ChevronRight size={14} />
                </span>
              </button>
            );
          })}
        </div>

        <h2 className="section-title">
          Perlu perhatian. <span>Tenggat dalam 3 hari dan pekerjaan yang tertahan.</span>
        </h2>
        <div className="card">
          {attention.length === 0 ? (
            <div className="card-empty">
              <CheckCircle2 size={22} className="ok" />
              <span>Tidak ada tenggat atau pekerjaan yang tertahan. Kerja bagus.</span>
            </div>
          ) : (
            <ul className="list">
              {attention.slice(0, 8).map(({ m, r, tone, note }) => (
                <li key={r.id} className="clickable" onClick={() => go(m.id, r.id)}>
                  <span className="list-icon">
                    <Icon name={m.icon} size={17} />
                  </span>
                  <span className="grow">
                    <span className="ellipsis block list-title">{label(r.values) || m.itemName}</span>
                    <span className="muted ellipsis block list-sub">
                      {m.menu} · {r.status}
                    </span>
                  </span>
                  <span className={'due ' + tone}>{note}</span>
                  <ChevronRight size={16} className="list-chev" />
                </li>
              ))}
            </ul>
          )}
          {attention.length > 8 && <p className="card-more muted">dan {attention.length - 8} lainnya</p>}
        </div>

        <h2 className="section-title">
          Laporan. <span>Angka dan grafik untuk {monthName}.</span>
        </h2>
        <div className="bento">
          <div className="card pad span-2">
            <div className="card-head">
              <div>
                <h3>Aktivitas 14 hari terakhir</h3>
                <p className="muted small">Pencatatan, perubahan, dan perpindahan tahap per hari</p>
              </div>
              <button className="link" onClick={() => go('aktivitas')}>
                Riwayat <ChevronRight size={14} />
              </button>
            </div>
            <ActivityBars data={days} />
          </div>

          <div className="card pad rekap-card">
            <span className="rekap-icon">
              <FileSpreadsheet size={26} strokeWidth={1.6} />
            </span>
            <h3>Rekap bulanan</h3>
            <p className="muted small">Semua menu dalam satu file Excel, satu lembar per menu.</p>
            <input
              type="month"
              value={rekapMonth}
              max={month}
              onChange={(e) => setRekapMonth(e.target.value)}
              aria-label="Bulan rekap"
            />
            <button className="pill-btn big" onClick={() => rekapMonth && exportRekap(data, rekapMonth)} disabled={!rekapMonth}>
              Unduh Excel
            </button>
          </div>

          <div className="card pad">
            <div className="card-head">
              <div>
                <h3>TTD EVP per unit</h3>
                <p className="muted small">Dokumen yang belum kembali ke unit</p>
              </div>
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
                        <th key={s} className="num">
                          {s}
                        </th>
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
                            return (
                              <td key={s} className="num">
                                {n || <span className="muted">–</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card pad span-2">
            <div className="card-head">
              <div>
                <h3>Jenis dokumen TTD EVP</h3>
                <p className="muted small">Masuk pada {monthName}</p>
              </div>
            </div>
            {byJenis.length === 0 ? <p className="muted small">Belum ada dokumen bulan ini.</p> : <HBars data={byJenis} />}
          </div>
        </div>

        <h2 className="section-title">
          Terbaru. <span>Siapa mengerjakan apa.</span>
        </h2>
        <div className="card">
          {activity.length === 0 ? (
            <div className="card-empty">Belum ada aktivitas.</div>
          ) : (
            <ul className="list">
              {activity.slice(0, 6).map((a) => (
                <ActivityLine key={a.id} a={a} onOpen={a.recordId ? () => go(a.module, a.recordId) : undefined} />
              ))}
            </ul>
          )}
          <p className="card-more">
            <button className="link" onClick={() => go('aktivitas')}>
              Lihat semua riwayat <ChevronRight size={14} />
            </button>
          </p>
        </div>
      </section>
    </>
  );
}
