import type { ModuleDef } from './modules';
import type { DocRecord } from './store';

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

export function exportCsv(mod: ModuleDef, rows: DocRecord[]) {
  const esc = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`;
  const head = [...mod.fields.map((f) => f.label), 'Status', 'Terakhir diperbarui'];
  const lines = rows.map((r) =>
    [...mod.fields.map((f) => r.values[f.key] ?? ''), r.status, r.updatedAt].map(esc).join(','),
  );
  download(`${mod.id}-${today()}.csv`, '﻿' + [head.map(esc).join(','), ...lines].join('\n'), 'text/csv');
}

export function exportJson(data: unknown) {
  download(`dokbylt-backup-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
}
