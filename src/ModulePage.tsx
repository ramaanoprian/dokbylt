import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Columns3, List, Paperclip, Plus, Search } from 'lucide-react';
import type { ModuleDef } from './modules';
import { attachmentsOf, type DocRecord } from './backend';
import { DataMenu } from './DataMenu';
import { Hero, LocalNav } from './LocalNav';
import type { FileApi } from './Attachments';
import { Icon } from './icons';
import { RecordForm } from './RecordForm';
import { Board } from './Board';
import { useToast } from './toast';
import {
  daysSince,
  daysUntil,
  deadlineOf,
  dueLabel,
  dueTone,
  fmtDate,
  isDone,
  lastMove,
  readPref,
  shown,
  writePref,
  REMIND_DAYS,
} from './util';

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
  onImport: (recs: DocRecord[]) => Promise<string | null>;
  /** Hanya admin yang boleh menghapus data. */
  canDelete: boolean;
  files: FileApi;
}

type Editing = { record?: DocRecord; targetStatus?: string } | null;
type View = 'tabel' | 'papan';

/** Kolom yang paling menggambarkan data; dipakai sebagai judul kartu di HP. */
const TITLE_KEYS = ['perihal', 'kegiatan', 'uraian', 'tujuan', 'asal', 'pengirim'];

export function ModulePage({
  mod,
  rows,
  userName,
  loading,
  openId,
  onOpened,
  onSave,
  onDelete,
  onRestore,
  onImport,
  canDelete,
  files,
}: Props) {
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
      (r) =>
        !needle ||
        Object.values(r.values).some((v) =>
          String(v ?? '')
            .toLowerCase()
            .includes(needle),
        ),
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
          {
            ...moved,
            status: r.status,
            updatedAt: t,
            history: [...moved.history, { status: r.status, at: t, by: userName }],
          },
          moved,
        );
      },
    });
  };

  const showSkeleton = loading && rows.length === 0;

  const tabs: [string, string, number][] = [
    ['aktif', 'Berjalan', rows.filter((r) => !isDone(mod, r)).length],
    ...mod.statuses.map((st, i): [string, string, number] => [st, st, counts[i]]),
    ['semua', 'Semua', rows.length],
  ];

  return (
    <>
      <LocalNav title={mod.menu}>
        <DataMenu
          mod={mod}
          rows={view === 'papan' ? searched : filtered}
          userName={userName}
          onImport={async (recs) => {
            const e = await onImport(recs);
            if (!e) toast(`${recs.length} ${mod.itemName} berhasil diimpor`);
            return e;
          }}
        />
        <button className="pill-btn" onClick={() => setEditing({})} title="Pintasan: N">
          <Plus size={14} strokeWidth={2.4} /> Tambah
        </button>
      </LocalNav>

      <section className="page">
        <Hero title={`${mod.title}.`} lead={mod.description} />

        <div className="controls">
          <div className="search">
            <Search size={17} />
            <input
              type="search"
              placeholder={`Cari ${mod.itemName}…`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="segmented" role="tablist" aria-label="Tampilan">
            <button className={view === 'tabel' ? 'on' : ''} onClick={() => setView('tabel')} title="Tabel">
              <List size={15} /> <span className="hide-sm">Daftar</span>
            </button>
            <button className={view === 'papan' ? 'on' : ''} onClick={() => setView('papan')} title="Papan">
              <Columns3 size={15} /> <span className="hide-sm">Papan</span>
            </button>
          </div>
        </div>

        {view === 'tabel' ? (
          <div className="chips" role="tablist" aria-label="Saring menurut tahap">
            {tabs.map(([v, l, n]) => (
              <button
                key={v}
                role="tab"
                aria-selected={statusFilter === v}
                className={statusFilter === v ? 'on' : ''}
                onClick={() => setStatusFilter(v)}
              >
                {l}
                <span className="chip-count">{n}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted board-note">Seret kartu ke kolom lain untuk memindahkan tahap.</p>
        )}

        <div className={view === 'papan' ? 'board-wrap' : 'card'}>
          {showSkeleton ? (
            <div>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton-row">
                  <span className="sk w20" />
                  <span className="sk w40" />
                  <span className="sk w15" />
                </div>
              ))}
            </div>
          ) : view === 'papan' ? (
            <div>
              <Board mod={mod} rows={searched} onOpen={(r) => setEditing({ record: r })} onMove={moveTo} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <Icon name={mod.icon} size={24} />
              <p>
                {rows.length === 0
                  ? `Belum ada ${mod.itemName} yang dicatat.`
                  : 'Tidak ada data yang cocok dengan saringan ini.'}
              </p>
              {rows.length === 0 && (
                <button className="btn primary" onClick={() => setEditing({})}>
                  <Plus size={16} /> Catat {mod.itemName} pertama
                </button>
              )}
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
                    const due = deadlineOf(mod, r);
                    const dueDays = due ? daysUntil(due) : undefined;
                    const clip = attachmentsOf(r.values).length > 0;
                    return (
                      <tr key={r.id} onClick={() => setEditing({ record: r })}>
                        {cols.map((c, ci) => (
                          <td
                            key={c.key}
                            className={c.type === 'date' ? 'nowrap' : TITLE_KEYS.includes(c.key) ? 'strong' : ''}
                          >
                            {ci === cols.length - 1 && clip && (
                              <Paperclip size={13} className="clip" aria-label="Ada lampiran" />
                            )}
                            {c.type === 'date'
                              ? fmtDate(r.values[c.key])
                              : shown(c, r.values) || <span className="muted">–</span>}
                          </td>
                        ))}
                        <td className="status-cell">
                          <span className={'pill ' + (done ? 'done' : idx === 0 ? 'new' : 'mid')}>{r.status}</span>
                          {dueDays !== undefined && dueDays <= REMIND_DAYS ? (
                            <span className={'due ' + dueTone(dueDays)} title={`Tenggat ${fmtDate(due)}`}>
                              {dueLabel(dueDays)}
                            </span>
                          ) : (
                            !done && age >= 3 && <span className="due stale">{age} hari di tahap ini</span>
                          )}
                        </td>
                        <td className="actions" onClick={(e) => e.stopPropagation()}>
                          {!done && (
                            <button
                              className="btn small"
                              onClick={() => moveTo(r, mod.statuses[idx + 1])}
                              title={`Pindahkan ke ${mod.statuses[idx + 1]}`}
                            >
                              {mod.statuses[idx + 1]} <ChevronRight size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Di HP data tampil sebagai daftar ringkas, bukan tabel. */}
              <ul className="mlist">
                {filtered.map((r) => {
                  const idx = mod.statuses.indexOf(r.status);
                  const done = isDone(mod, r);
                  const age = daysSince(lastMove(r));
                  const due = deadlineOf(mod, r);
                  const dueDays = due ? daysUntil(due) : undefined;
                  const titleKey = TITLE_KEYS.find((k) => cols.some((c) => c.key === k) && r.values[k]);
                  const meta = cols
                    .filter((c) => c.key !== titleKey && r.values[c.key])
                    .map((c) => (c.type === 'date' ? fmtDate(r.values[c.key]) : shown(c, r.values)));
                  return (
                    <li key={r.id} className="mcard" onClick={() => setEditing({ record: r })}>
                      <div className="mcard-main">
                        <b className="mcard-title">
                          {attachmentsOf(r.values).length > 0 && (
                            <Paperclip size={13} className="clip" aria-label="Ada lampiran" />
                          )}
                          {(titleKey && r.values[titleKey]) || mod.itemName}
                        </b>
                        {meta.length > 0 && <span className="mcard-meta">{meta.join(' · ')}</span>}
                        <span className="mcard-tags">
                          <span className={'pill ' + (done ? 'done' : idx === 0 ? 'new' : 'mid')}>{r.status}</span>
                          {dueDays !== undefined && dueDays <= REMIND_DAYS ? (
                            <span className={'due ' + dueTone(dueDays)}>{dueLabel(dueDays)}</span>
                          ) : (
                            !done && age >= 3 && <span className="due stale">{age} hari</span>
                          )}
                        </span>
                      </div>
                      {!done ? (
                        <button
                          className="mcard-next"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveTo(r, mod.statuses[idx + 1]);
                          }}
                          aria-label={`Pindahkan ke ${mod.statuses[idx + 1]}`}
                          title={mod.statuses[idx + 1]}
                        >
                          <ChevronRight size={18} />
                        </button>
                      ) : (
                        <ChevronRight className="mcard-chev" size={18} aria-hidden />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {view === 'tabel' && filtered.length > 0 && (
            <div className="card-foot muted">
              Menampilkan {filtered.length} dari {rows.length} {mod.itemName}
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
              toast(
                editing.record
                  ? 'Perubahan disimpan'
                  : `${mod.itemName[0].toUpperCase()}${mod.itemName.slice(1)} baru dicatat`,
              );
            }}
            files={files}
            onDelete={
              editing.record && canDelete
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
    </>
  );
}
