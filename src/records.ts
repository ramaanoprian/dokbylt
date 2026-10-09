// Aturan bersama untuk satu data: judul, tahap berikutnya, dan isian wajib sebelum pindah tahap.
import { stageNeeds, type ModuleDef } from './modules';
import type { DocRecord } from './backend';

/** Kolom yang paling menggambarkan data; dipakai sebagai judul. */
export const TITLE_KEYS = ['perihal', 'kegiatan', 'uraian', 'keperluan', 'tujuan', 'asal', 'pengirim'];

export const titleOf = (mod: ModuleDef, r: DocRecord) =>
  TITLE_KEYS.map((k) => r.values[k]?.trim()).find(Boolean) || `${mod.itemName[0].toUpperCase()}${mod.itemName.slice(1)}`;

/** Tahap sesudah tahap sekarang, atau kosong bila sudah di tahap terakhir. */
export function nextStatus(mod: ModuleDef, r: DocRecord) {
  const i = mod.statuses.indexOf(r.status);
  return i < mod.statuses.length - 1 ? mod.statuses[i + 1] : undefined;
}

/**
 * Isian wajib yang belum terisi untuk masuk ke tahap `target`. Hanya dicek saat maju, tidak saat
 * dikembalikan ke tahap sebelumnya. Isian tahap-tahap yang dilompati ikut diperiksa, kecuali tahap
 * sebelum tahap data sekarang (lihat stageNeeds).
 */
export function missingFor(mod: ModuleDef, r: DocRecord, target: string) {
  const t = mod.statuses.indexOf(target);
  if (t <= mod.statuses.indexOf(r.status)) return [];
  // Sama dengan form: isian tahap yang sudah dilewati data lama tidak ditagih lagi.
  const keys = [...new Set(stageNeeds(mod, target, r))];
  return keys
    .filter((k) => !r.values[k]?.trim())
    .map((k) => ({ key: k, label: mod.fields.find((f) => f.key === k)?.label ?? k }));
}

/** Data yang sudah lebih maju (atau sama) dari tahap `target` tidak ikut dipindah agar tidak mundur. */
export const isBehind = (mod: ModuleDef, r: DocRecord, target: string) =>
  mod.statuses.indexOf(r.status) < mod.statuses.indexOf(target);
