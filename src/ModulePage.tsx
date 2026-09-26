import { useMemo, useState } from 'react';
import { ChevronRight, Download, Plus, Search } from 'lucide-react';
import type { ModuleDef } from './modules';
import type { DocRecord } from './backend';
import { Icon } from './icons';
import { RecordForm } from './RecordForm';
import { daysSince, exportCsv, fmtDate, isDone, lastMove } from './util';

interface Props {
  mod: ModuleDef;
  rows: DocRecord[];
  userName: string;
  onSave: (r: DocRecord, prev?: DocRecord) => void;
  onDelete: (r: DocRecord) => void;
}

type Editing = { record?: DocRecord; targetStatus?: string } | null;

export function ModulePage({ mod, rows, userName, onSave, onDelete }: Props) {
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
      .filter((r) => !needle || Object.values(r.values).some((v) => String(v ?? '').toLowerCase().includes(needle)))
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
    onSave(
      { ...r, status: next, updatedAt: now, updatedBy: userName, history: [...r.history, { status: next, at: now, by: userName }] },
      r,
    );
  };

  return (
    <section>
      <header className="page-head">
        <div className="page-title">
          <span className={`chip-icon c-${mod.id}`}>
            <Icon name={mod.icon} size={22} />
          </span>
          <div>
            <h1>{mod.title}</h1>
            <p className="muted">{mod.description}</p>
          </div>
        </div>
        <button className="btn primary" onClick={() => setEditing({})}>
          <Plus size={18} /> Tambah {mod.itemName}
        </button>
      </header>

      <div className="flow">
        {mod.statuses.map((s, i) => (
          <button
            key={s}
            className={'flow-step' + (statusFilter === s ? ' active' : '')}
            onClick={() => setStatusFilter(statusFilter === s ? 'aktif' : s)}
          >
            <span className="flow-count">{counts[i]}</span>
            <span className="flow-label">
              <span className="muted small">Tahap {i + 1}</span>
              {s}
            </span>
            {i < mod.statuses.length - 1 && <ChevronRight className="flow-arrow" size={16} />}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input type="search" placeholder={`Cari ${mod.itemName}…`} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="segmented">
            {[
              ['aktif', 'Berjalan'],
              ['semua', 'Semua'],
            ].map(([v, l]) => (
              <button key={v} className={statusFilter === v ? 'on' : ''} onClick={() => setStatusFilter(v)}>
                {l}
              </button>
            ))}
          </div>
          <button className="btn ghost" onClick={() => exportCsv(mod, filtered)} disabled={!filtered.length}>
            <Download size={16} /> CSV
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="empty">
            <Icon name={mod.icon} size={28} />
            <p>{rows.length === 0 ? `Belum ada ${mod.itemName} yang dicatat.` : 'Tidak ada data yang cocok.'}</p>
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
                        <span className={'pill ' + (done ? 'done' : idx === 0 ? 'new' : 'mid')}>{r.status}</span>
                        {!done && age >= 3 && <span className="age">{age} hari di tahap ini</span>}
                      </td>
                      <td className="actions" onClick={(e) => e.stopPropagation()}>
                        {!done && (
                          <button className="btn small" onClick={() => advance(r)}>
                            {mod.statuses[idx + 1]} <ChevronRight size={14} />
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
      </div>

      {editing && (
        <RecordForm
          mod={mod}
          record={editing.record}
          userName={userName}
          targetStatus={editing.targetStatus}
          onClose={() => setEditing(null)}
          onSave={(r) => {
            onSave(r, editing.record);
            setEditing(null);
          }}
          onDelete={
            editing.record
              ? () => {
                  onDelete(editing.record!);
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </section>
  );
}
