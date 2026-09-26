import { MODULES, UNITS, type ModuleId } from './modules';
import type { DataStore } from './store';
import { daysSince, fmtDateTime, isDone, lastMove } from './util';

interface Props {
  data: DataStore;
  go: (id: ModuleId) => void;
}

export function Overview({ data, go }: Props) {
  const month = new Date().toISOString().slice(0, 7);

  const evp = MODULES[0];
  const evpActive = data.evp.filter((r) => !isDone(evp, r));

  const stale = MODULES.flatMap((m) =>
    data[m.id]
      .filter((r) => !isDone(m, r) && daysSince(lastMove(r)) >= 3)
      .map((r) => ({ m, r, age: daysSince(lastMove(r)) })),
  ).sort((a, b) => b.age - a.age);

  const recent = MODULES.flatMap((m) =>
    data[m.id].flatMap((r) => r.history.map((h) => ({ m, r, h }))),
  )
    .sort((a, b) => b.h.at.localeCompare(a.h.at))
    .slice(0, 8);

  const label = (m: (typeof MODULES)[number], r: DataStore[ModuleId][number]) =>
    r.values.perihal || r.values.kegiatan || r.values.uraian || r.values.tujuan || r.values.asal || m.itemName;

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Ringkasan</h1>
          <p className="muted">Semua alur kerja unit dokumen Balai Yasa Lahat dalam satu tempat.</p>
        </div>
      </header>

      <div className="cards">
        {MODULES.map((m) => {
          const rows = data[m.id];
          const active = rows.filter((r) => !isDone(m, r)).length;
          const thisMonth = rows.filter((r) => (r.values[m.dateField] ?? '').startsWith(month)).length;
          return (
            <button key={m.id} className="card" onClick={() => go(m.id)}>
              <span className="card-icon" aria-hidden>
                {m.icon}
              </span>
              <span className="card-title">{m.title}</span>
              <span className="card-num">{active}</span>
              <span className="muted small">masih berjalan · {thisMonth} bulan ini</span>
            </button>
          );
        })}
      </div>

      <div className="two-col">
        <div className="panel">
          <h2>TTD EVP per unit</h2>
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
          {evpActive.length === 0 && <p className="muted small">Tidak ada dokumen yang sedang menunggu.</p>}
        </div>

        <div className="panel">
          <h2>Perlu ditindaklanjuti</h2>
          {stale.length === 0 ? (
            <p className="muted small">Tidak ada pekerjaan yang tertahan 3 hari atau lebih.</p>
          ) : (
            <ul className="list">
              {stale.slice(0, 8).map(({ m, r, age }) => (
                <li key={r.id}>
                  <button className="link" onClick={() => go(m.id)}>
                    {m.icon} {label(m, r)}
                  </button>
                  <span className="muted small">
                    {r.status} · {age} hari
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="panel">
        <h2>Aktivitas terakhir</h2>
        {recent.length === 0 ? (
          <p className="muted small">Belum ada aktivitas. Mulai dengan mencatat dokumen di salah satu menu.</p>
        ) : (
          <ul className="list">
            {recent.map(({ m, r, h }, i) => (
              <li key={i}>
                <span>
                  {m.icon} {label(m, r)} → <b>{h.status}</b>
                </span>
                <span className="muted small">{fmtDateTime(h.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
