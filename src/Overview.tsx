import { ChevronRight } from 'lucide-react';
import { MODULES, UNITS, moduleById, type ModuleId } from './modules';
import type { Activity, DataStore } from './backend';
import { Icon } from './icons';
import { ActivityLine } from './ActivityPage';
import { daysSince, isDone, lastMove } from './util';

interface Props {
  data: DataStore;
  activity: Activity[];
  userName: string;
  go: (id: ModuleId | 'aktivitas') => void;
}

const label = (v: Record<string, string>) => v.perihal || v.kegiatan || v.uraian || v.tujuan || v.asal || '';

export function Overview({ data, activity, userName, go }: Props) {
  const month = new Date().toISOString().slice(0, 7);
  const evp = moduleById('evp');
  const evpActive = data.evp.filter((r) => !isDone(evp, r));
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';

  const stale = MODULES.flatMap((m) =>
    data[m.id]
      .filter((r) => !isDone(m, r) && daysSince(lastMove(r)) >= 3)
      .map((r) => ({ m, r, age: daysSince(lastMove(r)) })),
  ).sort((a, b) => b.age - a.age);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>
            {greet}
            {userName ? `, ${userName.split(' ')[0]}` : ''}
          </h1>
          <p className="muted">Ringkasan semua alur kerja unit dokumen Balai Yasa Lahat.</p>
        </div>
      </header>

      <div className="stats">
        {MODULES.map((m) => {
          const rows = data[m.id];
          const active = rows.filter((r) => !isDone(m, r)).length;
          const thisMonth = rows.filter((r) => (r.values[m.dateField] ?? '').startsWith(month)).length;
          return (
            <button key={m.id} className="stat" onClick={() => go(m.id)}>
              <span className={`chip-icon c-${m.id}`}>
                <Icon name={m.icon} />
              </span>
              <span className="stat-title">{m.menu}</span>
              <span className="stat-num">{active}</span>
              <span className="muted small">berjalan · {thisMonth} bulan ini</span>
            </button>
          );
        })}
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
                      {evp.statuses.slice(0, -1).map((s) => (
                        <td key={s}>{rows.filter((r) => r.status === s).length || '–'}</td>
                      ))}
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
            <h2>Perlu ditindaklanjuti</h2>
            {stale.length > 0 && <span className="pill warn">{stale.length}</span>}
          </div>
          {stale.length === 0 ? (
            <p className="muted small">Tidak ada pekerjaan yang tertahan 3 hari atau lebih.</p>
          ) : (
            <ul className="rows">
              {stale.slice(0, 6).map(({ m, r, age }) => (
                <li key={r.id} className="clickable" onClick={() => go(m.id)}>
                  <span className={`chip-icon sm c-${m.id}`}>
                    <Icon name={m.icon} size={14} />
                  </span>
                  <span className="grow">
                    {label(r.values) || m.itemName}
                    <span className="muted small block">{r.status}</span>
                  </span>
                  <span className="age">{age} hari</span>
                </li>
              ))}
            </ul>
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
              <ActivityLine key={a.id} a={a} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
