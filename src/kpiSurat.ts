// Angka KPI surat masuk per bulan: berapa surat yang masuk dan berapa yang sudah didistribusikan ke
// unit kerja. Dipakai di halaman Surat Masuk, laporan bulanan PDF, dan rekap Excel agar angkanya sama.
import { DISPOSISI, type ModuleDef } from './modules';
import type { DocRecord } from './backend';
import { isDone } from './util';
import { suratUnit } from './records';

export interface SuratKpi {
  /** Surat yang diterima pada bulan itu (menurut tanggal diterima). */
  masuk: number;
  /** Dari surat bulan itu, yang sudah sampai tahap Didistribusikan. */
  didistribusikan: number;
  belum: number;
  /** Yang ditujukan ke EVP (melalui disposisi) dan yang langsung untuk unit kerja. */
  viaEvp: number;
  langsung: number;
  /** Yang belum didistribusikan karena masih menunggu disposisi EVP. */
  tungguEvp: number;
  /** Didistribusikan paling lambat tenggat, dan sesudah tenggat; yang tanpa tenggat tidak dihitung. */
  tepatWaktu: number;
  terlambat: number;
  /** Per unit kerja penerima, urut dari yang paling banyak. */
  units: { unit: string; masuk: number; didistribusikan: number }[];
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Tanggal (YYYY-MM-DD) menurut jam perangkat, sama dengan tanggal yang diisi staf. */
const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Tanggal surat didistribusikan, dari riwayat tahapnya. */
export function distributedDay(mod: ModuleDef, r: DocRecord) {
  if (!isDone(mod, r)) return undefined;
  const last = mod.statuses[mod.statuses.length - 1];
  const at = [...r.history].reverse().find((h) => h.status === last)?.at ?? r.updatedAt;
  return localDay(at);
}

export const inMonth = (mod: ModuleDef, r: DocRecord, month: string) => (r.values[mod.dateField] ?? '').startsWith(month);

export function suratKpi(mod: ModuleDef, rows: DocRecord[], month: string): SuratKpi {
  const list = rows.filter((r) => inMonth(mod, r, month));
  const units = new Map<string, { unit: string; masuk: number; didistribusikan: number }>();
  const k: SuratKpi = { masuk: list.length, didistribusikan: 0, belum: 0, viaEvp: 0, langsung: 0, tungguEvp: 0, tepatWaktu: 0, terlambat: 0, units: [] };
  for (const r of list) {
    const done = isDone(mod, r);
    const evp = r.values.tujuan === 'EVP' || r.status === DISPOSISI;
    if (evp) k.viaEvp++;
    else k.langsung++;
    if (done) {
      k.didistribusikan++;
      const day = distributedDay(mod, r)!;
      const due = r.values.tenggat;
      if (due) day <= due ? k.tepatWaktu++ : k.terlambat++;
    } else {
      k.belum++;
      if (evp && r.status !== DISPOSISI) k.tungguEvp++;
    }
    // Surat untuk EVP yang belum didisposisi belum punya unit kerja penerima.
    const to = suratUnit(mod, r.values);
    const unit = to === 'EVP' ? 'Menunggu disposisi EVP' : to || 'Belum ditentukan';
    const u = units.get(unit) ?? { unit, masuk: 0, didistribusikan: 0 };
    u.masuk++;
    if (done) u.didistribusikan++;
    units.set(unit, u);
  }
  k.units = [...units.values()].sort((a, b) => b.masuk - a.masuk || a.unit.localeCompare(b.unit, 'id'));
  return k;
}

/** "80%" atau "–" bila tidak ada pembanding. */
export const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '–');
