import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Columns3, Download, List, Plus, Search } from 'lucide-react';
import type { ModuleDef } from './modules';
import type { DocRecord } from './backend';
import { Icon } from './icons';
import { RecordForm } from './RecordForm';
import { Board } from './Board';
import { useToast } from './toast';
import { daysSince, exportCsv, fmtDate, isDone, lastMove, readPref, writePref } from './util';

interface Props {
  mod: ModuleDef;
  rows: DocRecord[];
  userName: string;
  loading: boolean;
  openId?: string;
  onOpened: () => void;
  onSave: (r: DocRecord, prev?: DocRecord) => void;
  onDelete: (r: DocRecord) => void;
  onRestore: (r: DocRecord) => void;
}

type Editing = { record?: DocRecord; targetStatus?: string } | null;
type View = 'tabel' | 'papan';

export function ModulePage({ mod, rows, userName, loading, openId, onOpened, onSave, onDelete, onRestore }: Props) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('aktif');
  const [editing, setEditing] = useState<Editing>(null);
  const [view, setViewState] = useState<View>(() => readPref(`view:${mod.id}`, 'tabel') as View);
  const cols = mod.fields.filter((f) => f.inTable);

  const setView = (v: View) => {
    setViewState(v);
    writePref(`view:${mod.id}`, v);
  };

  // Buka record tertentu (dari pencarian cepat).
  useEffect(() => {
    if (!openId) return;
    if (openId === 'baru') setEditing({});
    const r = rows.find((x) => x.id === openId);
    if (r) setEditing({ record: r });
    onOpened();
  }, [openId, rows, onOpened]);

  // Pintasan keyboard: N untuk tambah.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (editing || e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setEditing({});
      }
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [editing]);

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) => !needle || Object.values(r.values).some((v) => String(v ?? '').toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  const filtered = useMemo(
    () =>
      searched
        .filter((r) =>
          statusFilter === 'semua' ? true : statusFilter === 'aktif' ? !isDone(mod, r) : r.status === statusFilter,
        )
        .sort((a, b) => (b.values[mod.dateField] ?? '').localeCompare(a.values[mod.dateField] ?? '')),
    [searched, statusFilter, mod],
  );

  const counts = mod.statuses.map((s) => rows.filter((r) => r.status === s).length);

  const moveTo = (r: DocRecord, next: string) => {
    const nextIdx = mod.statuses.indexOf(next);
    // Isian wajib hanya dicek saat maju, tidak saat dikembalikan ke tahap sebelumnya.
    const need = mod.statuses.slice(0, nextIdx + 1).flatMap((s) => mod.requiredForStatus?.[s] ?? []);
    if (nextIdx > mod.statuses.indexOf(r.status) && need.some((k) => !r.values[k]?.trim())) {
      setEditing({ record: r, targetStatus: next });
      return;
    }
    const now = new Date().toISOString();
    const moved = {
      ...r,
      status: next,
      updatedAt: now,
      updatedBy: userName,
      history: [...r.history, { status: next, at: now, by: userName }],
    };
    onSave(moved, r);
    toast(`Dipindah ke “${next}”`, {
      label: 'Urungkan',
      run: () => {
        const t = new Date().toISOString();
        onSave(
          { ...moved, status: r.status, updatedAt: t, history: [...moved.history, { status: r.status, at: t, by: userName }] },
          moved,
        );
      },
    });
  };

  const showSkeleton = loading && rows.length === 0;

  return (
    <section className="page">
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
        <button className="btn primary" onClick={() => setEditing({})} title="Pintasan: N">
          <Plus size={18} /> Tambah {mod.itemName}
        </button>
      </header>

      <div className="flow">
        {mod.statuses.map((s, i) => (
          <button
            key={s}
            className={'flow-step' + (statusFilter === s ? ' active' : '')}
            onClick={() => {
              setView('tabel');
              setStatusFilter(statusFilter === s ? 'aktif' : s);
            }}
          >
            <span className="flow-count">{counts[i]}</span>
            <span className="flow-label">
              <span className="muted small">Tahap {i + 1}</span>
              {s}
            </span>
            <span
              className="flow-fill"
              style={{ width: `${rows.length ? (100 * counts[i]) / rows.length : 0}%` }}
              aria-hidden
            />
            {i < mod.statuses.length - 1 && <ChevronRight className="flow-arrow" size={16} />}
          </button>
        ))}
      </div>

      <div className="toolbar-bar">
        <div className="search">
          <Search size={16} />
          <input type="search" placeholder={`Cari ${mod.itemName}…`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {view === 'tabel' && (
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
        )}
        <div className="segmented" role="tablist" aria-label="Tampilan">
          <button className={view === 'tabel' ? 'on' : ''} onClick={() => setView('tabel')} title="Tabel">
            <List size={16} /> <span className="hide-sm">Tabel</span>
          </button>
          <button className={view === 'papan' ? 'on' : ''} onClick={() => setView('papan')} title="Papan">
            <Columns3 size={16} /> <span className="hide-sm">Papan</span>
          </button>
        </div>
        <button className="btn ghost" onClick={() => exportCsv(mod, filtered)} disabled={!filtered.length} title="Unduh CSV">
          <Download size={16} /> <span className="hide-sm">CSV</span>
        </button>
      </div>

      {showSkeleton ? (
        <div className="card">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton-row">
              <span className="sk w20" />
              <span className="sk w40" />
              <span className="sk w15" />
            </div>
          ))}
        </div>
      ) : view === 'papan' ? (
        <Board mod={mod} rows={searched} onOpen={(r) => setEditing({ record: r })} onMove={moveTo} />
      ) : filtered.length === 0 ? (
        <div className="card empty">
          <span className={`chip-icon big c-${mod.id}`}>
            <Icon name={mod.icon} size={28} />
          </span>
          <p>{rows.length === 0 ? `Belum ada ${mod.itemName} yang dicatat.` : 'Tidak ada data yang cocok.'}</p>
          {rows.length === 0 && (
            <button className="btn primary" onClick={() => setEditing({})}>
              <Plus size={16} /> Catat {mod.itemName} pertama
            </button>
          )}
        </div>
      ) : (
        <div className="card table-wrap">
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
                  <tr key={r.id} onClick={() => setEditing({ record: r })} className="row-in">
                    {cols.map((c) => (
                      <td key={c.key} data-label={c.label}>
                        {c.type === 'date' ? fmtDate(r.values[c.key]) : r.values[c.key] || '–'}
                      </td>
                    ))}
                    <td data-label="Tahap">
                      <span className="progress-dots" aria-hidden>
                        {mod.statuses.map((_, i) => (
                          <i key={i} className={i <= idx ? (done ? 'on done' : 'on') : ''} />
                        ))}
                      </span>
                      <span className={'pill ' + (done ? 'done' : idx === 0 ? 'new' : 'mid')}>{r.status}</span>
                      {!done && age >= 3 && <span className="age">{age} hari di tahap ini</span>}
                    </td>
                    <td className="actions" onClick={(e) => e.stopPropagation()}>
                      {!done && (
                        <button className="btn small" onClick={() => moveTo(r, mod.statuses[idx + 1])}>
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
            toast(editing.record ? 'Perubahan disimpan' : `${mod.itemName[0].toUpperCase()}${mod.itemName.slice(1)} baru dicatat`);
          }}
          onDelete={
            editing.record
              ? () => {
                  const r = editing.record!;
                  onDelete(r);
                  setEditing(null);
                  toast(`${mod.itemName[0].toUpperCase()}${mod.itemName.slice(1)} dihapus`, {
                    label: 'Urungkan',
                    run: () => onRestore(r),
                  });
                }
              : undefined
          }
        />
      )}
    </section>
  );
}
