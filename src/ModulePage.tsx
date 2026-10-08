import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronRight, Columns3, List, Paperclip, Plus, Search } from 'lucide-react';
import type { ModuleDef } from './modules';
import { attachmentsOf, sendDroneNotify, type DocRecord, type NotifyKind, type NotifyResult } from './backend';
import { cancelNotify, queueNotify } from './notifyQueue';
import { DataMenu } from './DataMenu';
import { FormQrButton, QR_FORMS } from './FormQr';
import { Hero, LocalNav } from './LocalNav';
import type { FileApi } from './Attachments';
import { Icon } from './icons';
import { RecordForm } from './RecordForm';
import { RecordDetail } from './RecordDetail';
import { BulkBar } from './BulkBar';
import { FilterChip, monthLabel, monthOf, readSaring, unitFieldOf, writeSaring, type Saring } from './FilterBar';
import { Board } from './Board';
import { exportXlsx } from './excel';
import { useToast } from './toast';
import { fmtDays, moduleStats, stageClass } from './stats';
import { TITLE_KEYS, isBehind, missingFor, titleOf } from './records';
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
import './module-ux.css';

interface Props {
  mod: ModuleDef;
  rows: DocRecord[];
  userName: string;
  loading: boolean;
  openId?: string;
  onOpened: () => void;
  onSave: (r: DocRecord, prev?: DocRecord) => void | Promise<NotifyKind>;
  onDelete: (r: DocRecord) => void;
  onRestore: (r: DocRecord) => void;
  onImport: (recs: DocRecord[]) => Promise<string | null>;
  /** Hanya admin yang boleh menghapus data. */
  canDelete: boolean;
  files: FileApi;
}

type Editing = { record?: DocRecord; targetStatus?: string } | null;
type View = 'tabel' | 'papan';
/** Data yang dibuka di panel rincian; `idx` posisinya di daftar saat dibuka, `snap` isi terakhir yang dikenal. */
type Detail = { id: string; idx: number; snap: DocRecord } | null;

/** Jumlah baris yang ditampilkan dulu; sisanya lewat tombol "Tampilkan 50 lagi". */
const PAGE = 50;
const NONE = new Set<string>();

type Dir = 'asc' | 'desc';
/** Kunci urutan: key field, atau salah satu kolom tambahan di bawah. */
const EXTRA_SORTS = [
  { key: '_tahap', label: 'Tahap' },
  { key: '_tenggat', label: 'Tenggat' },
  { key: '_diubah', label: 'Terakhir diubah' },
];
const collator = new Intl.Collator('id', { numeric: true, sensitivity: 'base' });

/** Nilai yang dibandingkan saat mengurutkan; string kosong selalu ditaruh di bawah. */
function sortValue(mod: ModuleDef, r: DocRecord, key: string): string | number {
  if (key === '_tahap') return mod.statuses.indexOf(r.status);
  if (key === '_tenggat') return isDone(mod, r) ? '' : (deadlineOf(mod, r) ?? '');
  if (key === '_diubah') return r.updatedAt;
  const f = mod.fields.find((x) => x.key === key);
  return f ? (f.type === 'date' ? (r.values[key] ?? '') : shown(f, r.values)) : '';
}

function sortRows(mod: ModuleDef, rows: DocRecord[], key: string, dir: Dir) {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(mod, a, key);
    const vb = sortValue(mod, b, key);
    if (va === '' || vb === '') return va === vb ? 0 : va === '' ? 1 : -1;
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : collator.compare(String(va), String(vb));
    return c * sign || b.createdAt.localeCompare(a.createdAt);
  });
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  const [detail, setDetail] = useState<Detail>(null);
  const [picking, setPicking] = useState(false);
  const [view, setViewState] = useState<View>(() => readPref(`view:${mod.id}`, 'tabel') as View);
  const cols = mod.fields.filter((f) => f.inTable);
  const sortOptions = [...cols.map((c) => ({ key: c.key, label: c.label })), ...EXTRA_SORTS];
  const [sort, setSortState] = useState<{ key: string; dir: Dir }>(() => {
    const [key, dir] = readPref(`sort:${mod.id}`, '').split(':');
    return sortOptions.some((o) => o.key === key) ? { key, dir: dir === 'asc' ? 'asc' : 'desc' } : { key: mod.dateField, dir: 'desc' };
  });
  const setSort = (key: string, dir: Dir) => {
    setSortState({ key, dir });
    writePref(`sort:${mod.id}`, `${key}:${dir}`);
  };
  // Klik judul kolom: kolom baru mulai dari terbaru/Z-A untuk tanggal, A-Z untuk teks; klik lagi membalik arah.
  const sortBy = (key: string) => {
    if (sort.key === key) setSort(key, sort.dir === 'asc' ? 'desc' : 'asc');
    else setSort(key, mod.fields.find((f) => f.key === key)?.type === 'date' || key === '_diubah' ? 'desc' : 'asc');
  };

  const setView = (v: View) => {
    setViewState(v);
    setPicking(false);
    writePref(`view:${mod.id}`, v);
  };

  // Saringan unit dan bulan, diingat per menu selama sesi.
  const unitField = useMemo(() => unitFieldOf(mod), [mod]);
  const [saring, setSaringState] = useState<Saring>(() => readSaring(mod));
  const setSaring = (s: Saring) => {
    setSaringState(s);
    writeSaring(mod, s);
  };
  const byUnit = useCallback(
    (r: DocRecord) => !saring.unit || !unitField || r.values[unitField.key] === saring.unit,
    [saring.unit, unitField],
  );
  const byMonth = useCallback((r: DocRecord) => !saring.month || monthOf(mod, r) === saring.month, [saring.month, mod]);

  // Data sesuai saringan unit dan bulan (tanpa pencarian): dasar angka di kartu tahap.
  const scoped = useMemo(() => rows.filter((r) => byUnit(r) && byMonth(r)), [rows, byUnit, byMonth]);

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hits = scoped.filter(
      (r) =>
        !needle ||
        Object.values(r.values).some((v) =>
          String(v ?? '')
            .toLowerCase()
            .includes(needle),
        ),
    );
    return sortRows(mod, hits, sort.key, sort.dir);
  }, [scoped, q, mod, sort]);

  const filtered = useMemo(
    () =>
      searched.filter((r) =>
        statusFilter === 'semua' ? true : statusFilter === 'aktif' ? !isDone(mod, r) : r.status === statusFilter,
      ),
    [searched, statusFilter, mod],
  );

  // Pilihan di chip saringan beserta jumlah datanya (mengikuti saringan yang satunya).
  const unitOptions = useMemo(() => {
    if (!unitField) return [];
    const pool = rows.filter(byMonth);
    return (unitField.options ?? []).map((o) => ({
      value: o,
      label: o,
      count: pool.filter((r) => r.values[unitField.key] === o).length,
    }));
  }, [rows, unitField, byMonth]);
  const monthOptions = useMemo(() => {
    const all = new Map<string, number>();
    for (const r of rows) {
      const m = monthOf(mod, r);
      if (m) all.set(m, (all.get(m) ?? 0) + (byUnit(r) ? 1 : 0));
    }
    if (saring.month && !all.has(saring.month)) all.set(saring.month, 0);
    return [...all.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([m, count]) => ({ value: m, label: monthLabel(m), count }));
  }, [rows, mod, byUnit, saring.month]);

  // Daftar panjang: 50 dulu. Kembali ke 50 saat pencarian, saringan, urutan, atau tahap berubah.
  const pageKey = `${q}|${saring.unit}|${saring.month}|${sort.key}:${sort.dir}|${statusFilter}`;
  const [more, setMore] = useState({ key: '', n: PAGE });
  const limit = more.key === pageKey ? more.n : PAGE;
  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);
  // Baris yang baru dimunculkan "Tampilkan lagi" diberi animasi masuk.
  const freshFrom = useRef(0);
  const showMore = () => {
    freshFrom.current = visible.length;
    setMore({ key: pageKey, n: limit + PAGE });
  };
  if (more.key !== pageKey) freshFrom.current = 0;

  // Pilihan untuk pindah banyak sekaligus; hilang saat saringan atau tampilan berubah.
  const selKey = `${q}|${saring.unit}|${saring.month}|${statusFilter}|${view}`;
  const [sel, setSel] = useState({ key: '', ids: NONE });
  const selIds = sel.key === selKey ? sel.ids : NONE;
  const selected = useMemo(() => filtered.filter((r) => selIds.has(r.id)), [filtered, selIds]);
  const anchor = useRef<string | null>(null);
  const setSelIds = (ids: Set<string>) => setSel({ key: selKey, ids });
  const clearSel = () => {
    setSelIds(NONE);
    setPicking(false);
  };
  const toggle = (id: string, range: boolean) => {
    const next = new Set(selected.map((r) => r.id));
    const on = !next.has(id);
    const a = range && anchor.current ? visible.findIndex((r) => r.id === anchor.current) : -1;
    const b = visible.findIndex((r) => r.id === id);
    // Shift+klik memilih (atau melepas) semua baris di antara klik terakhir dan baris ini.
    const span = a >= 0 && b >= 0 ? visible.slice(Math.min(a, b), Math.max(a, b) + 1) : [{ id }];
    for (const r of span) {
      if (on) next.add(r.id);
      else next.delete(r.id);
    }
    anchor.current = id;
    setSelIds(next);
  };
  const allVisibleOn = visible.length > 0 && visible.every((r) => selIds.has(r.id));
  const someVisibleOn = !allVisibleOn && visible.some((r) => selIds.has(r.id));
  const toggleAllVisible = () => {
    const next = new Set(selected.map((r) => r.id));
    for (const r of visible) {
      if (allVisibleOn) next.delete(r.id);
      else next.add(r.id);
    }
    anchor.current = null;
    setSelIds(next);
  };
  const headCheck = useRef<HTMLInputElement>(null);
  // Tabel bisa dipasang ulang (animasi ganti saringan), jadi status "sebagian" disetel tiap render.
  useEffect(() => {
    if (headCheck.current) headCheck.current.indeterminate = someVisibleOn;
  });

  // Urutan data di papan, untuk berpindah dengan ↑/↓ di panel rincian.
  const boardList = useMemo(() => {
    if (view !== 'papan') return [];
    const last = mod.statuses.length - 1;
    return mod.statuses.flatMap((s, i) => {
      const all = searched.filter((r) => r.status === s);
      return i === last ? [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 15) : all;
    });
  }, [view, searched, mod]);
  const navList = view === 'papan' ? boardList : filtered;

  const openDetail = (r: DocRecord) => setDetail({ id: r.id, idx: navList.findIndex((x) => x.id === r.id), snap: r });
  const closeDetail = useCallback(() => setDetail(null), []);

  const detailRec = detail ? (rows.find((r) => r.id === detail.id) ?? null) : null;
  const navCur = detail ? navList.findIndex((r) => r.id === detail.id) : -1;
  // Data yang baru dipindah keluar dari daftar: berpindah dari posisi terakhirnya.
  const prevIdx = navCur >= 0 ? navCur - 1 : detail && detail.idx >= 0 ? detail.idx - 1 : -1;
  const nextIdx = navCur >= 0 ? navCur + 1 : detail && detail.idx >= 0 ? detail.idx : -1;
  const goTo = (i: number) => {
    const r = navList[i];
    if (!r) return;
    if (view === 'tabel' && i >= limit) setMore({ key: pageKey, n: Math.ceil((i + 1) / PAGE) * PAGE });
    setDetail({ id: r.id, idx: i, snap: r });
  };
  const onPrev = prevIdx >= 0 && navList[prevIdx] ? () => goTo(prevIdx) : undefined;
  const onNext = nextIdx >= 0 && navList[nextIdx] ? () => goTo(nextIdx) : undefined;

  // Baris yang sedang dibuka tetap terlihat di belakang panel.
  const detailId = detail?.id;
  useEffect(() => {
    if (!detailId) return;
    const el = [...document.querySelectorAll<HTMLElement>(`[data-rid="${detailId}"]`)].find((e) => e.offsetParent);
    el?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [detailId]);

  // Buka record tertentu (dari pencarian cepat atau kabar masuk): rincian dulu, "baru" langsung form kosong.
  useEffect(() => {
    if (!openId) return;
    if (openId === 'baru') {
      setEditing({});
      onOpened();
      return;
    }
    const r = rows.find((x) => x.id === openId);
    if (r) {
      setDetail({ id: r.id, idx: navList.findIndex((x) => x.id === r.id), snap: r });
      onOpened();
    } else if (!loading) onOpened();
  }, [openId, rows, loading, onOpened]);

  // Pintasan keyboard: N untuk tambah, Esc melepas pilihan.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (editing || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (document.querySelector('.overlay, .palette-overlay')) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setEditing({});
      } else if (e.key === 'Escape' && !detail && (selIds.size || picking)) {
        e.preventDefault();
        setSel({ key: '', ids: NONE });
        setPicking(false);
      }
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [editing, detail, selIds, picking]);

  // Versi terbaru data untuk aksi yang dijalankan belakangan (mis. tombol di toast).
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  });

  // WA ke PIC tidak langsung dikirim: masuk antrean agar beberapa dokumen digabung jadi satu pesan.
  // `quiet`: hasil WA peminjam drone tidak diumumkan satu per satu (pindah banyak merangkumnya sendiri).
  const saveAndNotify = (r: DocRecord, prev?: DocRecord, quiet = false) =>
    Promise.resolve(onSave(r, prev)).then(async (notify): Promise<NotifyResult | undefined> => {
      let res: NotifyResult | undefined;
      if (notify && typeof notify === 'object') queueNotify(mod, r, notify.stage);
      else if (notify === 'instant') {
        const who = r.values.pic || 'peminjam';
        res = await sendDroneNotify(r.id);
        if (!quiet) {
          if (res.sent) toast(`WA terkirim ke ${who}`);
          else toast(`WA ke ${who} belum terkirim (${res.reason})`);
        }
      }
      // Dipindah mundur: buang WA yang masih antre untuk tahap yang belum dicapai lagi.
      const now = mod.statuses.indexOf(r.status);
      cancelNotify(r.id, (stage) => mod.statuses.indexOf(stage) > now);
      return res;
    });

  /** Rangkuman WA langsung (peminjam drone) dari beberapa data sekaligus. */
  const summarizeInstant = (jobs: Promise<NotifyResult | undefined>[]) =>
    Promise.all(jobs).then((list) => {
      const sent = list.filter((x) => x?.sent).length;
      const failed = list.filter((x): x is { sent: false; reason: string } => !!x && !x.sent);
      if (sent) toast(`WA terkirim ke ${sent} peminjam`);
      if (failed.length) toast(`WA ke ${failed.length} peminjam belum terkirim (${failed[0].reason})`);
    });

  const stamp = (r: DocRecord, status: string, at: string): DocRecord => ({
    ...r,
    status,
    updatedAt: at,
    updatedBy: userName,
    history: [...r.history, { status, at, by: userName }],
  });

  const moveTo = (r: DocRecord, next: string) => {
    // Isian wajib hanya dicek saat maju, tidak saat dikembalikan ke tahap sebelumnya.
    if (missingFor(mod, r, next).length) {
      setEditing({ record: r, targetStatus: next });
      return;
    }
    const moved = stamp(r, next, new Date().toISOString());
    saveAndNotify(moved, r);
    toast(`Dipindah ke “${next}”`, {
      label: 'Urungkan',
      run: () => saveAndNotify(stamp(moved, r.status, new Date().toISOString()), moved),
    });
  };

  // Pindah banyak sekaligus: tidak pernah mundur, data yang isian wajibnya kosong dilewati.
  const bulkMove = (target: string) => {
    const now = new Date().toISOString();
    const moved: { before: DocRecord; after: DocRecord }[] = [];
    const lacking: DocRecord[] = [];
    let ahead = 0;
    for (const r of selected) {
      if (!isBehind(mod, r, target)) ahead++;
      else if (missingFor(mod, r, target).length) lacking.push(r);
      else moved.push({ before: r, after: stamp(r, target, now) });
    }
    clearSel();
    if (moved.length) summarizeInstant(moved.map((m) => saveAndNotify(m.after, m.before, true)));
    const parts = [
      moved.length ? `${moved.length} dipindahkan ke “${target}”` : 'Belum ada yang dipindahkan',
      lacking.length ? `${lacking.length} perlu dilengkapi` : '',
      ahead ? `${ahead} sudah di tahap itu atau lebih lanjut` : '',
    ].filter(Boolean);
    const text = moved.length ? parts.join(', ') : `${parts[0]}: ${parts.slice(1).join(', ')}`;
    toast(text, [
      ...(moved.length
        ? [
            {
              label: 'Urungkan',
              run: () => {
                const t = new Date().toISOString();
                summarizeInstant(moved.map((m) => saveAndNotify(stamp(m.after, m.before.status, t), m.after, true)));
                toast(`Pemindahan ${moved.length} ${mod.itemName} diurungkan`);
              },
            },
          ]
        : []),
      ...(lacking.length
        ? [
            {
              label: 'Lengkapi',
              run: () => {
                const r = rowsRef.current.find((x) => x.id === lacking[0].id) ?? lacking[0];
                setEditing({ record: r, targetStatus: target });
              },
            },
          ]
        : []),
    ]);
  };

  const exportSelected = () => {
    const list = selected;
    exportXlsx(mod, list).then(
      () => toast(`${list.length} ${mod.itemName} diekspor ke Excel`),
      () => toast('Ekspor gagal, coba lagi'),
    );
  };

  const showSkeleton = loading && rows.length === 0;

  const thisMonth = new Date().toISOString().slice(0, 7);
  const st = useMemo(() => moduleStats(mod, scoped, thisMonth), [mod, scoped, thisMonth]);
  const counts = st.stages.map((s) => s.count);
  const last = mod.statuses.length - 1;
  const tabs: { v: string; label: string; n: number; sub: string; cls: string }[] = [
    {
      v: 'aktif',
      label: 'Berjalan',
      n: st.active,
      sub: st.overdue ? `${st.overdue} lewat tenggat` : st.stale ? `${st.stale} tertahan` : 'semua lancar',
      cls: 'all' + (st.overdue ? ' alert' : ''),
    },
    ...mod.statuses.map((s, i) => ({
      v: s,
      label: s,
      n: counts[i],
      sub:
        i === last
          ? st.avgFinish === undefined
            ? `${st.doneThisMonth} bulan ini`
            : `rata-rata ${fmtDays(st.avgFinish)} sampai sini`
          : counts[i]
            ? `rata-rata ${fmtDays(st.stages[i].avgAge)} di tahap ini`
            : 'kosong',
      cls: stageClass(mod, s),
    })),
    { v: 'semua', label: 'Semua', n: scoped.length, sub: `${st.thisMonth} tercatat bulan ini`, cls: 'all' },
  ];

  const narrowed = !!(q.trim() || saring.unit || saring.month);
  const resetFilters = () => {
    setQ('');
    setSaring({ unit: '', month: '' });
  };
  const remaining = filtered.length - visible.length;
  const nf = (n: number) => n.toLocaleString('id-ID');

  return (
    <>
      <LocalNav title={mod.menu} icon={mod.icon} mod={mod.id}>
        {QR_FORMS[mod.id] && <FormQrButton form={QR_FORMS[mod.id]!} />}
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

      <section className="page" data-mod={mod.id}>
        <Hero title={`${mod.title}.`} lead={mod.description} />

        <div className="ux-toolbar">
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
            <div className="sort-ctl">
              <select aria-label="Urutkan menurut" value={sort.key} onChange={(e) => setSort(e.target.value, sort.dir)}>
                {sortOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    Urutkan: {o.label}
                  </option>
                ))}
              </select>
              <button
                className="icon-btn"
                onClick={() => setSort(sort.key, sort.dir === 'asc' ? 'desc' : 'asc')}
                title={sort.dir === 'asc' ? 'Naik (A-Z, terlama dulu)' : 'Turun (Z-A, terbaru dulu)'}
                aria-label={sort.dir === 'asc' ? 'Urutan naik, klik untuk membalik' : 'Urutan turun, klik untuk membalik'}
              >
                {sort.dir === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
              </button>
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

          <div className="ux-filters" role="group" aria-label="Saringan">
            {unitField && (
              <FilterChip
                name={unitField.key === 'tujuan' ? 'Tujuan' : 'Unit'}
                all={unitField.key === 'tujuan' ? 'Semua tujuan' : 'Semua unit'}
                value={saring.unit}
                options={unitOptions}
                onChange={(v) => setSaring({ ...saring, unit: v })}
              />
            )}
            {monthOptions.length > 0 && (
              <FilterChip
                name="Bulan"
                all="Semua bulan"
                value={saring.month}
                options={monthOptions}
                onChange={(v) => setSaring({ ...saring, month: v })}
              />
            )}
            {(saring.unit || saring.month) && (
              <button type="button" className="ux-clear" onClick={() => setSaring({ unit: '', month: '' })}>
                Hapus saringan
              </button>
            )}
            <span className="spacer" />
            {view === 'tabel' && filtered.length > 0 && (
              <button
                type="button"
                className={'ux-pick' + (picking ? ' on' : '')}
                onClick={() => (picking ? clearSel() : setPicking(true))}
                aria-pressed={picking}
              >
                {picking ? 'Selesai' : 'Pilih'}
              </button>
            )}
          </div>
        </div>

        {view === 'tabel' ? (
          <div className="stages" role="tablist" aria-label="Saring menurut tahap">
            {tabs.map((t) => (
              <button
                key={t.v}
                role="tab"
                aria-selected={statusFilter === t.v}
                className={'stage ' + t.cls + (statusFilter === t.v ? ' on' : '')}
                onClick={() => setStatusFilter(t.v)}
              >
                <span className="stage-name">
                  {!t.cls.startsWith('all') && <i className={'dot ' + t.cls} />}
                  <span className="ellipsis">{t.label}</span>
                </span>
                <span className="stage-num">{nf(t.n)}</span>
                <span className="stage-sub">{t.sub}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted board-note">Seret kartu ke kolom lain untuk memindahkan tahap. Klik kartu untuk melihat rinciannya.</p>
        )}

        <div className={view === 'papan' ? 'board-wrap' : 'card ux-list-card'}>
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
              <Board mod={mod} rows={searched} onOpen={openDetail} onMove={moveTo} activeId={detail?.id} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <Icon name={mod.icon} size={24} />
              <p>
                {rows.length === 0
                  ? `Belum ada ${mod.itemName} yang dicatat.`
                  : 'Tidak ada data yang cocok dengan saringan ini.'}
              </p>
              {rows.length === 0 ? (
                <button className="btn primary" onClick={() => setEditing({})}>
                  <Plus size={16} /> Catat {mod.itemName} pertama
                </button>
              ) : (
                narrowed && (
                  <button className="btn" onClick={resetFilters}>
                    Hapus pencarian dan saringan
                  </button>
                )
              )}
            </div>
          ) : (
            <div className="table-wrap ux-swap" key={`${saring.unit}|${saring.month}|${statusFilter}`}>
              <table className="ux-table">
                <thead>
                  <tr>
                    <th className="ux-checkcell">
                      <input
                        ref={headCheck}
                        type="checkbox"
                        className="ux-check"
                        checked={allVisibleOn}
                        onChange={toggleAllVisible}
                        aria-label={allVisibleOn ? 'Lepas semua yang tampil' : `Pilih semua ${visible.length} yang tampil`}
                        title={allVisibleOn ? 'Lepas semua yang tampil' : 'Pilih semua yang tampil'}
                      />
                    </th>
                    {[...cols.map((c) => ({ key: c.key, label: c.label })), { key: '_tahap', label: 'Tahap' }].map((c) => {
                      const on = sort.key === c.key;
                      return (
                        <th key={c.key} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                          <button className={'th-sort' + (on ? ' on' : '')} onClick={() => sortBy(c.key)}>
                            {c.label}
                            {on ? (
                              sort.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                            ) : (
                              <ArrowUpDown size={13} className="th-sort-hint" />
                            )}
                          </button>
                        </th>
                      );
                    })}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r, ri) => {
                    const idx = mod.statuses.indexOf(r.status);
                    const done = isDone(mod, r);
                    const age = daysSince(lastMove(r));
                    const due = deadlineOf(mod, r);
                    const dueDays = due ? daysUntil(due) : undefined;
                    const clip = attachmentsOf(r.values).length > 0;
                    const isSel = selIds.has(r.id);
                    return (
                      <tr
                        key={r.id}
                        data-rid={r.id}
                        tabIndex={0}
                        className={
                          (isSel ? 'ux-sel ' : '') +
                          (detail?.id === r.id ? 'ux-active ' : '') +
                          (freshFrom.current && ri >= freshFrom.current ? 'ux-fresh' : '')
                        }
                        onClick={() => openDetail(r)}
                        onKeyDown={(e) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === 'Enter') openDetail(r);
                          else if (e.key === ' ' || e.key === 'x') {
                            e.preventDefault();
                            toggle(r.id, e.shiftKey);
                          }
                        }}
                      >
                        <td
                          className="ux-checkcell"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(r.id, e.shiftKey);
                          }}
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          <input
                            type="checkbox"
                            className="ux-check"
                            checked={isSel}
                            tabIndex={-1}
                            onChange={() => {}}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggle(r.id, e.shiftKey);
                            }}
                            aria-label={`Pilih ${titleOf(mod, r)}`}
                          />
                        </td>
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
                          <span className="status-top">
                            <span className={'pill ' + stageClass(mod, r.status)}>{r.status}</span>
                            <span className="steps" aria-label={`Tahap ${idx + 1} dari ${mod.statuses.length}`}>
                              {mod.statuses.map((s, si) => (
                                <i key={s} className={si <= idx ? stageClass(mod, r.status) : ''} />
                              ))}
                            </span>
                          </span>
                          {dueDays !== undefined && dueDays <= REMIND_DAYS ? (
                            <span className={'due ' + dueTone(dueDays)} title={`Tenggat ${fmtDate(due)}`}>
                              {dueLabel(dueDays)}
                            </span>
                          ) : done ? (
                            <span className="due muted">selesai {fmtDate(lastMove(r))}</span>
                          ) : (
                            <span className={'due ' + (age >= 3 ? 'stale' : 'muted')}>
                              {age === 0 ? 'masuk tahap ini hari ini' : `${age} hari di tahap ini`}
                            </span>
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
              <ul className={'mlist' + (picking ? ' ux-picking' : '')}>
                {visible.map((r, ri) => {
                  const idx = mod.statuses.indexOf(r.status);
                  const done = isDone(mod, r);
                  const age = daysSince(lastMove(r));
                  const due = deadlineOf(mod, r);
                  const dueDays = due ? daysUntil(due) : undefined;
                  const titleKey = TITLE_KEYS.find((k) => cols.some((c) => c.key === k) && r.values[k]);
                  const meta = cols
                    .filter((c) => c.key !== titleKey && r.values[c.key])
                    .map((c) => (c.type === 'date' ? fmtDate(r.values[c.key]) : shown(c, r.values)));
                  const isSel = selIds.has(r.id);
                  return (
                    <li
                      key={r.id}
                      data-rid={r.id}
                      className={
                        'mcard' +
                        (isSel ? ' ux-sel' : '') +
                        (detail?.id === r.id ? ' ux-active' : '') +
                        (freshFrom.current && ri >= freshFrom.current ? ' ux-fresh' : '')
                      }
                      role={picking ? 'checkbox' : undefined}
                      aria-checked={picking ? isSel : undefined}
                      onClick={() => (picking ? toggle(r.id, false) : openDetail(r))}
                    >
                      <span className="ux-mcheck" aria-hidden>
                        <Check size={13} strokeWidth={3.2} />
                      </span>
                      <div className="mcard-main">
                        <b className="mcard-title">
                          {attachmentsOf(r.values).length > 0 && (
                            <Paperclip size={13} className="clip" aria-label="Ada lampiran" />
                          )}
                          {(titleKey && r.values[titleKey]) || mod.itemName}
                        </b>
                        {meta.length > 0 && <span className="mcard-meta">{meta.join(' · ')}</span>}
                        <span className="mcard-tags">
                          <span className={'pill ' + stageClass(mod, r.status)}>{r.status}</span>
                          <span className="steps" aria-label={`Tahap ${idx + 1} dari ${mod.statuses.length}`}>
                            {mod.statuses.map((s, si) => (
                              <i key={s} className={si <= idx ? stageClass(mod, r.status) : ''} />
                            ))}
                          </span>
                        </span>
                        <span className="mcard-due">
                          {dueDays !== undefined && dueDays <= REMIND_DAYS ? (
                            <span className={'due ' + dueTone(dueDays)}>{dueLabel(dueDays)}</span>
                          ) : done ? (
                            <span className="due muted">Selesai {fmtDate(lastMove(r))}</span>
                          ) : (
                            <span className={'due ' + (age >= 3 ? 'stale' : 'muted')}>
                              {age === 0 ? 'Masuk tahap ini hari ini' : `${age} hari di tahap ini`}
                            </span>
                          )}
                        </span>
                      </div>
                      {picking ? null : !done ? (
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
            <div className="card-foot ux-foot">
              <span className="muted" aria-live="polite">
                {remaining > 0
                  ? `Menampilkan ${nf(visible.length)} dari ${nf(filtered.length)} ${mod.itemName}`
                  : `Menampilkan ${nf(visible.length)} ${mod.itemName}` +
                    (filtered.length < rows.length ? ` dari total ${nf(rows.length)}` : '')}
              </span>
              {remaining > 0 && (
                <button type="button" className="btn small ux-more" onClick={showMore}>
                  Tampilkan {nf(Math.min(PAGE, remaining))} lagi
                </button>
              )}
            </div>
          )}
        </div>

        {editing && (
          <RecordForm
            mod={mod}
            rows={rows}
            record={editing.record}
            userName={userName}
            targetStatus={editing.targetStatus}
            onClose={() => setEditing(null)}
            onSave={(r) => {
              saveAndNotify(r, editing.record);
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
                    if (detail?.id === r.id) setDetail(null);
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

      {view === 'tabel' && (
        <BulkBar
          mod={mod}
          selected={selected}
          total={filtered.length}
          onSelectAll={
            selected.length > 0 && selected.length < filtered.length && (allVisibleOn || picking)
              ? () => setSelIds(new Set(filtered.map((r) => r.id)))
              : undefined
          }
          onMove={bulkMove}
          onExport={exportSelected}
          onClear={clearSel}
        />
      )}

      {detail && (
        <RecordDetail
          mod={mod}
          record={detailRec ?? detail.snap}
          gone={!detailRec}
          position={navCur >= 0 ? { index: navCur, total: navList.length } : undefined}
          onPrev={onPrev}
          onNext={onNext}
          onClose={closeDetail}
          onEdit={() => detailRec && setEditing({ record: detailRec })}
          onMove={moveTo}
          suspended={!!editing}
          files={files}
        />
      )}
    </>
  );
}
