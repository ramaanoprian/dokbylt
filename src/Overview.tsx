import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, FileSpreadsheet, Plus } from 'lucide-react';
import { exportRekap } from './excel';
import { MODULES, UNITS, moduleById, type ModuleId } from './modules';
import type { Activity, DataStore } from './backend';
import { Icon } from './icons';
import { Menu } from './Menu';
import { ActivityLine } from './ActivityPage';
import { ActivityBars, HBars, type DayBar } from './charts';
import { daysSince, dueLabel, dueTone, fmtDate, isDone, lastMove } from './util';
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

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Ringkasan</h1>
          <p className="muted">
            {now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="head-actions">
          <div className="rekap">
            <input
              type="month"
              value={rekapMonth}
              max={month}
              onChange={(e) => setRekapMonth(e.target.value)}
              aria-label="Bulan rekap"
            />
            <button className="btn" onClick={() => rekapMonth && exportRekap(data, rekapMonth)} disabled={!rekapMonth}>
              <FileSpreadsheet size={16} /> <span className="hide-sm">Unduh rekap</span>
            </button>
          </div>
          <Menu
            triggerClass="btn primary"
            trigger={
              <>
                <Plus size={16} /> Catat baru <ChevronDown size={14} />
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
        </div>
      </header>

      <div className="kpis">
        {MODULES.map((m) => {
          const rows = data[m.id];
          const active = rows.filter((r) => !isDone(m, r)).length;
          const thisMonth = rows.filter((r) => (r.values[m.dateField] ?? '').startsWith(month)).length;
          const late = rows.filter((r) => !isDone(m, r) && daysSince(lastMove(r)) >= 3).length;
          return (
            <button key={m.id} className="kpi" onClick={() => go(m.id)}>
              <span className="kpi-label">
                <Icon name={m.icon} size={15} /> {m.menu}
              </span>
              <span className="kpi-num">{loading && !rows.length ? <span className="sk w30" /> : active}</span>
              <span className="kpi-sub">
                berjalan · {thisMonth} bulan ini
                {late > 0 && <b className="kpi-late"> · {late} tertahan</b>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid-main">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Perlu perhatian</h2>
              <p className="muted small">Tenggat dalam 3 hari dan pekerjaan yang tertahan 3 hari atau lebih</p>
            </div>
            {attention.length > 0 && <span className="count-badge">{attention.length}</span>}
          </div>
          {attention.length === 0 ? (
            <div className="panel-empty">
              <CheckCircle2 size={18} className="ok" /> Tidak ada tenggat atau pekerjaan yang tertahan.
            </div>
          ) : (
            <ul className="list">
              {attention.slice(0, 7).map(({ m, r, tone, note }) => (
                <li key={r.id} className="clickable" onClick={() => go(m.id, r.id)}>
                  <span className="grow">
                    <span className="ellipsis block list-title">{label(r.values) || m.itemName}</span>
                    <span className="muted small ellipsis block">
                      {m.menu} · {r.status}
                    </span>
                  </span>
                  <span className={'due ' + tone}>{note}</span>
                </li>
              ))}
            </ul>
          )}
          {attention.length > 7 && <p className="panel-more muted small">dan {attention.length - 7} lainnya</p>}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Aktivitas 14 hari terakhir</h2>
              <p className="muted small">Pencatatan, perubahan, dan perpindahan tahap per hari</p>
            </div>
            <button className="link" onClick={() => go('aktivitas')}>
              Riwayat <ChevronRight size={14} />
            </button>
          </div>
          <div className="panel-body">
            <ActivityBars data={days} />
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>TTD EVP per unit</h2>
              <p className="muted small">Dokumen yang belum kembali ke unit</p>
            </div>
            <button className="link" onClick={() => go('evp')}>
              Buka <ChevronRight size={14} />
            </button>
          </div>
          {evpActive.length === 0 ? (
            <div className="panel-empty">Tidak ada dokumen yang sedang menunggu.</div>
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

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Jenis dokumen TTD EVP</h2>
              <p className="muted small">Masuk pada {monthName}</p>
            </div>
          </div>
          {byJenis.length === 0 ? (
            <div className="panel-empty">Belum ada dokumen bulan ini.</div>
          ) : (
            <div className="panel-body">
              <HBars data={byJenis} />
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Aktivitas terakhir</h2>
          <button className="link" onClick={() => go('aktivitas')}>
            Semua riwayat <ChevronRight size={14} />
          </button>
        </div>
        {activity.length === 0 ? (
          <div className="panel-empty">Belum ada aktivitas.</div>
        ) : (
          <ul className="list">
            {activity.slice(0, 6).map((a) => (
              <ActivityLine key={a.id} a={a} onOpen={a.recordId ? () => go(a.module, a.recordId) : undefined} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
