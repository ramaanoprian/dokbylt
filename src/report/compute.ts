// Angka laporan bulanan, dihitung dari data yang sudah dimuat di aplikasi.
import { MODULES, UNITS, type ModuleDef, type ModuleId } from '../modules';
import type { Activity, DataStore, DocRecord } from '../backend';
import { finishDays } from '../stats';
import { isDone, shown } from '../util';

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (d: Date) => dayKey(d).slice(0, 7);
const monthStart = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1);
};
export function addMonths(month: string, n: number) {
  const d = monthStart(month);
  d.setMonth(d.getMonth() + n);
  return monthKey(d);
}

/** "September 2026"; dengan `short` menjadi "Sep 2026". */
export const monthLabel = (month: string, short = false) =>
  monthStart(month).toLocaleDateString('id-ID', { month: short ? 'short' : 'long', year: 'numeric' });
export const monthOnly = (month: string) => monthStart(month).toLocaleDateString('id-ID', { month: 'long' });

/** 12 bulan terakhir, dari yang terlama sampai bulan ini. */
export const recentMonths = (now = new Date()) => Array.from({ length: 12 }, (_, i) => addMonths(monthKey(now), i - 11));

/** Bulan bawaan: bulan lalu selama lima hari pertama (laporan biasanya dibuat awal bulan), selain itu bulan ini. */
export const defaultMonth = (now = new Date()) => (now.getDate() <= 5 ? addMonths(monthKey(now), -1) : monthKey(now));

// ---------- Periode ----------

export interface Period {
  month: string;
  start: Date;
  /** Awal bulan berikutnya (tidak termasuk). */
  end: Date;
  /** Saat posisi "berjalan" dan "lewat tenggat" diambil: akhir bulan, atau sekarang untuk bulan berjalan. */
  asOf: number;
  /** Hari pembanding tenggat (YYYY-MM-DD): tenggat sebelum hari ini berarti lewat. */
  asOfDay: string;
  /** Batas akhir tanggal utama (YYYY-MM-DD) bila periode dipotong, untuk pembanding bulan berjalan. */
  toDay?: string;
  current: boolean;
}

function period(month: string, now: Date): Period {
  const start = monthStart(month);
  const end = monthStart(addMonths(month, 1));
  const current = now.getTime() < end.getTime();
  return {
    month,
    start,
    end,
    asOf: current ? now.getTime() + 1 : end.getTime(),
    asOfDay: dayKey(current ? now : end),
    current,
  };
}

// ---------- Bantuan per data ----------

const ms = (iso: string) => new Date(iso).getTime();
const isDate = (v?: string): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const finalOf = (m: ModuleDef) => m.statuses[m.statuses.length - 1];
/** Data hasil impor Excel: jejak waktunya bukan waktu sebenarnya. */
const imported = (r: DocRecord) => r.history.some((h) => /impor/i.test(h.by ?? ''));

/** Selisih hari antara dua tanggal YYYY-MM-DD (b − a). */
export function diffDays(a: string, b: string) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

function doneAt(m: ModuleDef, r: DocRecord) {
  const last = finalOf(m);
  return ms([...r.history].reverse().find((h) => h.status === last)?.at ?? r.updatedAt);
}

/** Tahap data pada waktu `t` menurut riwayatnya, atau undefined bila saat itu belum dicatat. */
function statusAt(r: DocRecord, t: number): string | undefined {
  const hist = [...r.history].sort((a, b) => ms(a.at) - ms(b.at));
  if (ms(r.createdAt) >= t && !(hist[0] && ms(hist[0].at) < t)) return undefined;
  let s: string | undefined;
  for (const h of hist) if (ms(h.at) < t) s = h.status;
  return s ?? hist[0]?.status ?? r.status;
}

/** Tenggat yang berlaku pada tahap `s` (sama dengan deadlineOf, tetapi untuk tahap di masa lalu). */
function dueOpen(m: ModuleDef, r: DocRecord, s: string) {
  const v = r.values;
  if (m.id === 'multimedia' && s === m.statuses[0] && isDate(v.tanggal)) return v.tanggal;
  const d = m.id === 'drone' ? (s === 'Dipinjam' ? v.tanggalKembali || v.tanggalPakai : v.tanggalPakai) : v.tenggat;
  return isDate(d) ? d : undefined;
}

/** Tenggat untuk data yang sudah selesai: kapan seharusnya tahap terakhir tercapai. */
function dueDone(m: ModuleDef, r: DocRecord) {
  const v = r.values;
  const d = m.id === 'drone' ? v.tanggalKembali || v.tanggalPakai : m.id === 'multimedia' ? v.tenggat || v.tanggal : v.tenggat;
  return isDate(d) ? d : undefined;
}

export const labelOf = (v: Record<string, string>) =>
  v.perihal || v.kegiatan || v.uraian || v.keperluan || v.tujuan || v.asal || '';

/** Unit yang berkaitan dengan data: unit asal/pembuat, atau tujuan untuk surat masuk. */
export function unitOf(m: ModuleDef, r: DocRecord) {
  const f = m.fields.find((x) => x.key === 'unit') ?? (m.id === 'surat' ? m.fields.find((x) => x.key === 'tujuan') : undefined);
  return f ? shown(f, r.values) : '';
}

// ---------- Angka inti ----------

export interface Core {
  masuk: number;
  selesai: number;
  /** Belum sampai tahap terakhir pada akhir periode. */
  berjalan: number;
  /** Yang berjalan dan tenggatnya sudah lewat pada akhir periode. */
  overdue: number;
  /** Selesai dalam periode, sebelum atau pada tenggat. */
  onTime: number;
  /** Selesai dalam periode, setelah tenggat. */
  late: number;
  /** Lama selesai (hari) untuk yang selesai dalam periode dan punya jejak waktu nyata. */
  durations: number[];
}

export interface LateItem {
  m: ModuleDef;
  r: DocRecord;
  due: string;
  /** Hari keterlambatan sampai selesai, atau sampai akhir periode bila belum selesai. */
  days: number;
  /** Tanggal selesai (YYYY-MM-DD) bila selesai terlambat; kosong bila masih berjalan. */
  doneDay?: string;
  /** Tahap pada akhir periode. */
  status: string;
}

const emptyCore = (): Core => ({ masuk: 0, selesai: 0, berjalan: 0, overdue: 0, onTime: 0, late: 0, durations: [] });

function core(m: ModuleDef, rows: DocRecord[], p: Period, late?: LateItem[], stages?: Map<string, number>): Core {
  const c = emptyCore();
  const final = finalOf(m);
  const start = p.start.getTime();
  const end = p.end.getTime();
  for (const r of rows) {
    const day = r.values[m.dateField] ?? '';
    if (day.startsWith(p.month) && (!p.toDay || day <= p.toDay)) c.masuk++;
    if (isDone(m, r)) {
      const t = doneAt(m, r);
      if (t >= start && t < end) {
        c.selesai++;
        const d = finishDays(m, r);
        if (d !== undefined) c.durations.push(d);
        const due = imported(r) ? undefined : dueDone(m, r);
        if (due) {
          const day = dayKey(new Date(t));
          if (day > due) {
            c.late++;
            late?.push({ m, r, due, days: diffDays(due, day), doneDay: day, status: final });
          } else c.onTime++;
        }
      }
    }
    const s = statusAt(r, p.asOf);
    if (s === undefined || s === final) continue;
    c.berjalan++;
    stages?.set(s, (stages.get(s) ?? 0) + 1);
    const due = dueOpen(m, r, s);
    if (due && due < p.asOfDay) {
      c.overdue++;
      late?.push({ m, r, due, days: diffDays(due, p.asOfDay), status: s });
    }
  }
  return c;
}

function sum(list: Core[]): Core {
  const t = emptyCore();
  for (const c of list) {
    t.masuk += c.masuk;
    t.selesai += c.selesai;
    t.berjalan += c.berjalan;
    t.overdue += c.overdue;
    t.onTime += c.onTime;
    t.late += c.late;
    t.durations.push(...c.durations);
  }
  return t;
}

export const avg = (c: Core) => (c.durations.length ? c.durations.reduce((a, b) => a + b, 0) / c.durations.length : undefined);
/** Persentase tepat waktu (0–100), atau undefined bila belum ada yang bisa dinilai. */
export const onTimeRate = (c: Core) => (c.onTime + c.late ? (c.onTime / (c.onTime + c.late)) * 100 : undefined);

// ---------- Laporan lengkap ----------

export interface Week {
  from: string;
  to: string;
  value: number;
}

export interface StaffRow {
  name: string;
  added: number;
  moved: number;
  edited: number;
  removed: number;
  total: number;
  top?: ModuleDef;
  system: boolean;
}

export interface MonthReport {
  period: Period;
  prevMonth: string;
  /** Nama pembanding untuk kalimat: "Agustus", atau "1–8 September" untuk bulan berjalan. */
  prevLabel: string;
  /** Nama pembanding singkat untuk judul kolom: "Agu" atau "1–8 Sep". */
  prevShort: string;
  total: Core;
  prev: Core;
  /** Bulan pembanding punya data sama sekali. */
  hasPrev: boolean;
  mods: { m: ModuleDef; c: Core; prev: Core }[];
  weeks: Week[];
  evpUnits: { unit: string; c: Core }[];
  evpJenis: { label: string; value: number }[];
  evpStages: { status: string; count: number }[];
  late: LateItem[];
  pos: { rows: DocRecord[]; sent: number; resi: number; cost: number };
  media: { rows: DocRecord[]; covered: number; archived: number };
  arsip: { masuk: number; boxes: number; stored: number };
  drone: { masuk: number; units: number; returned: number; issues: number };
  staff: { rows: StaffRow[]; complete: boolean; since?: string };
  /** Tidak ada data sama sekali pada bulan ini. */
  empty: boolean;
}

/** Batas riwayat aktivitas yang dimuat aplikasi (sama dengan ACTIVITY_LIMIT di backend.ts). */
const ACTIVITY_LIMIT = 500;

/** Pekan Senin–Minggu di dalam bulan; potongan pekan kurang dari 3 hari digabung ke pekan sebelahnya. */
function weeksOf(p: Period): { from: string; to: string }[] {
  const out: { from: Date; to: Date }[] = [];
  const d = new Date(p.start);
  while (d < p.end) {
    const from = new Date(d);
    const to = new Date(d);
    to.setDate(to.getDate() + ((7 - to.getDay()) % 7));
    if (to >= p.end) to.setTime(p.end.getTime() - 86_400_000);
    out.push({ from, to: new Date(to.getFullYear(), to.getMonth(), to.getDate()) });
    d.setTime(to.getTime());
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
  }
  const len = (w: { from: Date; to: Date }) => Math.round((w.to.getTime() - w.from.getTime()) / 86_400_000) + 1;
  if (out.length > 1 && len(out[0]) < 3) out.splice(0, 2, { from: out[0].from, to: out[1].to });
  if (out.length > 1 && len(out[out.length - 1]) < 3) out.splice(-2, 2, { from: out[out.length - 2].from, to: out[out.length - 1].to });
  return out.map((w) => ({ from: dayKey(w.from), to: dayKey(w.to) }));
}

const SYSTEM = /^(sistem|–|-|)$|impor/i;

function staffOf(activity: Activity[], p: Period): MonthReport['staff'] {
  const start = p.start.getTime();
  const end = p.end.getTime();
  const by = new Map<string, Activity[]>();
  for (const a of activity) {
    const t = ms(a.at);
    if (t < start || t >= end) continue;
    const name = SYSTEM.test(a.userName.trim()) ? 'Sistem' : a.userName.trim();
    by.set(name, [...(by.get(name) ?? []), a]);
  }
  const rows = [...by.entries()].map(([name, list]): StaffRow => {
    const perMod = MODULES.map((m) => ({ m, n: list.filter((a) => a.module === m.id).length })).sort((a, b) => b.n - a.n);
    return {
      name,
      added: list.filter((a) => a.action === 'tambah').length,
      moved: list.filter((a) => a.action === 'pindah tahap').length,
      edited: list.filter((a) => a.action === 'ubah data').length,
      removed: list.filter((a) => a.action === 'hapus').length,
      total: list.length,
      top: perMod[0]?.n ? perMod[0].m : undefined,
      system: name === 'Sistem',
    };
  });
  rows.sort((a, b) => Number(a.system) - Number(b.system) || b.total - a.total || a.name.localeCompare(b.name));
  // Aplikasi hanya memuat sejumlah aktivitas terbaru; bulan yang lebih lama bisa terpotong.
  const oldest = activity.reduce<string | undefined>((o, a) => (!o || a.at < o ? a.at : o), undefined);
  const complete = activity.length < ACTIVITY_LIMIT || (!!oldest && ms(oldest) <= start);
  return { rows, complete, since: complete ? undefined : oldest };
}

const num = (v?: string) => Number(String(v ?? '').replace(/[^\d]/g, '')) || 0;

export function buildReport(data: DataStore, activity: Activity[], month: string, now = new Date()): MonthReport {
  const p = period(month, now);
  const prevMonth = addMonths(month, -1);
  let pp = period(prevMonth, now);
  let prevLabel = monthOnly(prevMonth);
  let prevShort = monthLabel(prevMonth, true).split(' ')[0];
  if (p.current) {
    // Bulan berjalan dibanding hari-hari yang sama di bulan lalu, bukan sebulan penuh.
    const lastDay = new Date(pp.end.getTime() - 1).getDate();
    const cut = new Date(pp.start.getFullYear(), pp.start.getMonth(), Math.min(now.getDate(), lastDay));
    const toDay = dayKey(cut);
    cut.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
    pp = { ...pp, end: cut, asOf: cut.getTime() + 1, asOfDay: toDay, toDay };
    const range = cut.getDate() === 1 ? '1' : `1–${cut.getDate()}`;
    prevLabel = `${range} ${monthOnly(prevMonth)}`;
    prevShort = `${range} ${prevShort}`;
  }
  const late: LateItem[] = [];
  const evpStageMap = new Map<string, number>();
  const mods = MODULES.map((m) => ({
    m,
    c: core(m, data[m.id], p, late, m.id === 'evp' ? evpStageMap : undefined),
    prev: core(m, data[m.id], pp),
  }));
  const total = sum(mods.map((x) => x.c));
  const prev = sum(mods.map((x) => x.prev));
  const inMonth = (m: ModuleDef, r: DocRecord) => (r.values[m.dateField] ?? '').startsWith(month);

  // Masuk per pekan dari tanggal utama semua menu; pekan yang belum dimulai dan masih kosong tidak ditampilkan.
  const today = dayKey(now);
  const allWeeks = weeksOf(p)
    .map((w) => ({
      ...w,
      value: MODULES.reduce(
        (n, m) => n + data[m.id].filter((r) => (r.values[m.dateField] ?? '') >= w.from && (r.values[m.dateField] ?? '') <= w.to).length,
        0,
      ),
    }));
  const shownWeeks = allWeeks.reduce((n, w, i) => (w.from <= today || w.value > 0 ? i + 1 : n), 0);
  const weeks = allWeeks.slice(0, Math.max(1, shownWeeks));

  // TTD EVP per unit; isian "Lainnya" dan unit di luar daftar masuk ke "Lainnya".
  const evp = MODULES.find((m) => m.id === 'evp')!;
  const unitKey = (r: DocRecord) => (UNITS.includes(r.values.unit) ? r.values.unit : 'Lainnya');
  const evpUnits = UNITS.map((unit) => ({ unit, c: core(evp, data.evp.filter((r) => unitKey(r) === unit), p) })).filter(
    ({ c }) => c.masuk || c.selesai || c.berjalan,
  );
  const jenisOpts = evp.fields.find((f) => f.key === 'jenis')?.options ?? [];
  const evpJenis = jenisOpts
    .map((label) => ({ label, value: data.evp.filter((r) => inMonth(evp, r) && r.values.jenis === label).length }))
    .filter((j) => j.value)
    .sort((a, b) => b.value - a.value);
  const evpStages = evp.statuses
    .filter((s) => evpStageMap.get(s))
    .map((status) => ({ status, count: evpStageMap.get(status)! }));

  const byId = (id: ModuleId) => MODULES.find((m) => m.id === id)!;
  const sortByDate = (m: ModuleDef) => (a: DocRecord, b: DocRecord) =>
    (a.values[m.dateField] ?? '').localeCompare(b.values[m.dateField] ?? '');

  const pos = byId('pos');
  const posRows = data.pos.filter((r) => inMonth(pos, r)).sort(sortByDate(pos));
  const pickedAt = pos.statuses.indexOf('Di-pick up kurir');
  const media = byId('multimedia');
  const mediaRows = data.multimedia.filter((r) => inMonth(media, r)).sort(sortByDate(media));
  const arsip = byId('arsip');
  const arsipRows = data.arsip.filter((r) => inMonth(arsip, r));
  const drone = byId('drone');
  const droneRows = data.drone.filter((r) => inMonth(drone, r));

  return {
    period: p,
    prevMonth,
    prevLabel,
    prevShort,
    total,
    prev,
    hasPrev: prev.masuk + prev.selesai + prev.berjalan > 0,
    mods,
    weeks,
    evpUnits,
    evpJenis,
    evpStages,
    late: late.sort((a, b) => Number(!!a.doneDay) - Number(!!b.doneDay) || b.days - a.days),
    pos: {
      rows: posRows,
      sent: posRows.filter((r) => pos.statuses.indexOf(r.status) >= pickedAt).length,
      resi: posRows.filter((r) => isDone(pos, r)).length,
      cost: posRows.reduce((n, r) => n + num(r.values.biaya), 0),
    },
    media: {
      rows: mediaRows,
      covered: mediaRows.filter((r) => media.statuses.indexOf(r.status) >= 1).length,
      archived: mediaRows.filter((r) => isDone(media, r)).length,
    },
    arsip: {
      masuk: arsipRows.length,
      boxes: arsipRows.reduce((n, r) => n + num(r.values.jumlahBoks), 0),
      stored: arsipRows.filter((r) => isDone(arsip, r)).length,
    },
    drone: {
      masuk: droneRows.length,
      units: new Set(droneRows.map((r) => r.values.unitLainnya || r.values.unit).filter(Boolean)).size,
      returned: droneRows.filter((r) => isDone(drone, r)).length,
      issues: droneRows.filter((r) => r.values.kondisi === 'Rusak' || r.values.kondisi === 'Perlu dicek').length,
    },
    staff: staffOf(activity, p),
    empty: total.masuk + total.selesai + total.berjalan === 0,
  };
}
