import { useMemo, useState } from 'react';
import type { ModuleDef } from './modules';
import type { DocRecord } from './store';
import { RecordForm } from './RecordForm';
import { daysSince, exportCsv, fmtDate, isDone, lastMove } from './util';

interface Props {
  mod: ModuleDef;
  rows: DocRecord[];
  onSave: (r: DocRecord) => void;
  onDelete: (id: string) => void;
}

type Editing = { record?: DocRecord; targetStatus?: string } | null;

export function ModulePage({ mod, rows, onSave, onDelete }: Props) {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('aktif');
  const [editing, setEditing] = useState<Editing>(null);
  const cols = mod.fields.filter((f) => f.inTable);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) =>
        statusFilter === 'semua' ? true : statusFilter === 'aktif' ? !isDone(mod, r) : r.status === statusFilter,
      )
      .filter((r) => !needle || Object.values(r.values).some((v) => v?.toLowerCase().includes(needle)))
      .sort((a, b) => (b.values[mod.dateField] ?? '').localeCompare(a.values[mod.dateField] ?? ''));
  }, [rows, q, statusFilter, mod]);

  const counts = mod.statuses.map((s) => rows.filter((r) => r.status === s).length);

  const advance = (r: DocRecord) => {
    const next = mod.statuses[mod.statuses.indexOf(r.status) + 1];
    if (!next) return;
    const need = mod.requiredForStatus?.[next] ?? [];
    if (need.some((k) => !r.values[k]?.trim())) {
      setEditing({ record: r, targetStatus: next });
      return;
    }
    const now = new Date().toISOString();
    onSave({ ...r, status: next, updatedAt: now, history: [...r.history, { status: next, at: now }] });
  };

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>
            <span aria-hidden>{mod.icon}</span> {mod.title}
          </h1>
          <p className="muted">{mod.description}</p>
        </div>
        <button className="btn primary" onClick={() => setEditing({})}>
          + Tambah {mod.itemName}
        </button>
      </header>

      <div className="pipeline">
        {mod.statuses.map((s, i) => (
          <button
            key={s}
            className={'stage' + (statusFilter === s ? ' active' : '')}
            onClick={() => setStatusFilter(statusFilter === s ? 'aktif' : s)}
          >
            <span className="stage-num">{i + 1}</span>
            <span className="stage-label">{s}</span>
            <strong>{counts[i]}</strong>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder={`Cari ${mod.itemName}…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="aktif">Masih berjalan</option>
          <option value="semua">Semua</option>
          {mod.statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button className="btn" onClick={() => exportCsv(mod, filtered)} disabled={!filtered.length}>
          Ekspor CSV
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          {rows.length === 0 ? `Belum ada ${mod.itemName} yang dicatat.` : 'Tidak ada data yang cocok dengan filter.'}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th>Tahap</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const idx = mod.statuses.indexOf(r.status);
                const done = isDone(mod, r);
                const age = daysSince(lastMove(r));
                return (
                  <tr key={r.id} onClick={() => setEditing({ record: r })}>
                    {cols.map((c) => (
                      <td key={c.key} data-label={c.label}>
                        {c.type === 'date' ? fmtDate(r.values[c.key]) : r.values[c.key] || '–'}
                      </td>
                    ))}
                    <td data-label="Tahap">
                      <span className={'badge ' + (done ? 'done' : `s${idx}`)}>{r.status}</span>
                      {!done && age >= 3 && <span className="age">{age} hari di tahap ini</span>}
                    </td>
                    <td className="actions" onClick={(e) => e.stopPropagation()}>
                      {!done && (
                        <button className="btn small" onClick={() => advance(r)} title={mod.statuses[idx + 1]}>
                          → {mod.statuses[idx + 1]}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <RecordForm
          mod={mod}
          record={editing.record}
          targetStatus={editing.targetStatus}
          onClose={() => setEditing(null)}
          onSave={(r) => {
            onSave(r);
            setEditing(null);
          }}
          onDelete={
            editing.record
              ? () => {
                  onDelete(editing.record!.id);
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </section>
  );
}
