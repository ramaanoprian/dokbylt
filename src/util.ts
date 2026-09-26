import { OTHER, otherKey, type Field, type ModuleDef } from './modules';
import type { DocRecord } from './backend';

export const today = () => new Date().toISOString().slice(0, 10);

export function fmtDate(v?: string) {
  if (!v) return '–';
  const d = new Date(v.length === 10 ? v + 'T00:00:00' : v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(v: string) {
  const d = new Date(v);
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const isDone = (mod: ModuleDef, r: DocRecord) => r.status === mod.statuses[mod.statuses.length - 1];

export const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

/** Tanggal terakhir record berpindah tahap. */
export const lastMove = (r: DocRecord) => r.history[r.history.length - 1]?.at ?? r.createdAt;

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Nilai yang ditampilkan; pilihan "Lainnya" diganti keterangannya. */
export function shown(f: Field, values: Record<string, string>) {
  const v = values[f.key] ?? '';
  if (v === OTHER && values[otherKey(f.key)]?.trim()) return values[otherKey(f.key)].trim();
  return v;
}

export function exportCsv(mod: ModuleDef, rows: DocRecord[]) {
  const esc = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`;
  const head = [...mod.fields.map((f) => f.label), 'Status', 'Terakhir diperbarui'];
  const lines = rows.map((r) =>
    [...mod.fields.map((f) => shown(f, r.values)), r.status, r.updatedAt].map(esc).join(','),
  );
  download(`${mod.id}-${today()}.csv`, '﻿' + [head.map(esc).join(','), ...lines].join('\n'), 'text/csv');
}

export function exportJson(data: unknown) {
  download(`dokbylt-backup-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
}

export function fmtTime(v: string) {
  return new Date(v).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

/** Preferensi tampilan per browser (tidak penting bila hilang). */
export function readPref(key: string, fallback: string) {
  try {
    return localStorage.getItem('dokbylt:pref:' + key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem('dokbylt:pref:' + key, value);
  } catch {
    /* abaikan */
  }
}

// ---------- Tenggat ----------

/** Jumlah hari dari hari ini ke tanggal (YYYY-MM-DD); negatif berarti sudah lewat. */
export function daysUntil(date: string) {
  const t = new Date();
  const today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  const [y, m, d] = date.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
}

/** Tenggat yang masih berlaku untuk record; kosong bila sudah selesai atau tidak ada tenggat. */
export function deadlineOf(mod: ModuleDef, r: DocRecord): string | undefined {
  if (isDone(mod, r)) return undefined;
  if (r.values.tenggat) return r.values.tenggat;
  // Kegiatan multimedia yang belum diliput: tanggal kegiatannya adalah tenggat.
  if (mod.id === 'multimedia' && r.status === mod.statuses[0]) return r.values.tanggal || undefined;
  return undefined;
}

export const REMIND_DAYS = 3;

export function dueLabel(days: number) {
  if (days < 0) return `Lewat ${-days} hari`;
  if (days === 0) return 'Hari ini';
  if (days === 1) return 'Besok';
  return `${days} hari lagi`;
}

export const dueTone = (days: number) => (days < 0 ? 'over' : days <= 1 ? 'soon' : days <= REMIND_DAYS ? 'near' : 'far');
