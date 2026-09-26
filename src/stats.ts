import type { ModuleDef } from './modules';
import type { DocRecord } from './backend';
import { daysSince, daysUntil, deadlineOf, isDone, lastMove } from './util';

/**
 * Kelas warna tahap: s0, s1, s2 untuk tahap berjalan, "done" untuk tahap terakhir, dan "pre"
 * (abu-abu) untuk tahap awal yang belum diproses, mis. dokumen yang baru didaftarkan unit lewat QR.
 */
export const stageClass = (mod: ModuleDef, status: string) => {
  if (mod.preStatus && status === mod.preStatus) return 'pre';
  const i = mod.statuses.indexOf(status);
  if (i === mod.statuses.length - 1) return 'done';
  return `s${Math.max(0, i - (mod.preStatus ? 1 : 0))}`;
};

/** Hari dari dicatat sampai tahap terakhir, atau undefined bila belum selesai. */
export function finishDays(mod: ModuleDef, r: DocRecord) {
  if (!isDone(mod, r)) return undefined;
  // Data hasil impor atau yang langsung dicatat di tahap akhir tidak punya jejak waktu yang nyata.
  if (r.history.some((h) => /impor/i.test(h.by ?? ''))) return undefined;
  if (new Set(r.history.map((h) => h.at)).size < 2) return undefined;
  const last = mod.statuses[mod.statuses.length - 1];
  const end = [...r.history].reverse().find((h) => h.status === last)?.at ?? r.updatedAt;
  const start = new Date(r.createdAt).getTime();
  return Math.max(0, (new Date(end).getTime() - start) / 86_400_000);
}

const monthOf = (iso: string) => iso.slice(0, 7);

export function prevMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export interface StageStat {
  status: string;
  count: number;
  /** Rata-rata hari record berada di tahap ini (hanya yang masih berjalan). */
  avgAge: number;
}

export interface ModuleStats {
  active: number;
  thisMonth: number;
  lastMonth: number;
  doneThisMonth: number;
  overdue: number;
  stale: number;
  /** Rata-rata hari sampai selesai, dari yang selesai 90 hari terakhir. */
  avgFinish?: number;
  stages: StageStat[];
}

export function moduleStats(mod: ModuleDef, rows: DocRecord[], month: string): ModuleStats {
  const last = mod.statuses[mod.statuses.length - 1];
  const prev = prevMonth(month);
  const active = rows.filter((r) => !isDone(mod, r));
  const doneAt = (r: DocRecord) => [...r.history].reverse().find((h) => h.status === last)?.at ?? r.updatedAt;
  const recent = rows.filter((r) => isDone(mod, r) && daysSince(doneAt(r)) <= 90);
  const durations = recent.map((r) => finishDays(mod, r)).filter((n): n is number => n !== undefined);
  return {
    active: active.length,
    thisMonth: rows.filter((r) => (r.values[mod.dateField] ?? '').startsWith(month)).length,
    lastMonth: rows.filter((r) => (r.values[mod.dateField] ?? '').startsWith(prev)).length,
    doneThisMonth: rows.filter((r) => isDone(mod, r) && monthOf(doneAt(r)) === month).length,
    overdue: active.filter((r) => {
      const d = deadlineOf(mod, r);
      return d !== undefined && daysUntil(d) < 0;
    }).length,
    stale: active.filter((r) => daysSince(lastMove(r)) >= 3).length,
    avgFinish: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : undefined,
    stages: mod.statuses.map((s) => {
      const inStage = rows.filter((r) => r.status === s);
      const ages = s === last ? [] : inStage.map((r) => daysSince(lastMove(r)));
      return {
        status: s,
        count: inStage.length,
        avgAge: ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 0,
      };
    }),
  };
}

/** "3,2 hari", "< 1 hari". */
export const fmtDays = (n: number) =>
  n < 1 ? '< 1 hari' : `${n.toLocaleString('id-ID', { maximumFractionDigits: n < 10 ? 1 : 0 })} hari`;

/** Perbandingan dengan bulan lalu, mis. "+3 dari Agustus". */
export function deltaText(now: number, before: number, prevLabel: string) {
  const d = now - before;
  if (d === 0) return `sama dengan ${prevLabel}`;
  return `${d > 0 ? '+' : '−'}${Math.abs(d)} dari ${prevLabel}`;
}
