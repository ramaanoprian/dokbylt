import { OTHER, otherKey, type Field, type ModuleDef } from './modules';
import type { DocRecord } from './backend';
import { trackLines } from './track';

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
  // Kegiatan multimedia yang belum diliput: tanggal kegiatannya adalah tenggat.
  if (mod.id === 'multimedia' && r.status === mod.statuses[0] && r.values.tanggal) return r.values.tanggal;
  // Drone: sebelum dipinjam tenggatnya tanggal pakai, sesudahnya rencana kembali.
  if (mod.id === 'drone')
    return (r.status === 'Dipinjam' ? r.values.tanggalKembali || r.values.tanggalPakai : r.values.tanggalPakai) || undefined;
  return r.values.tenggat || undefined;
}

export const REMIND_DAYS = 3;

/** Tanggal (YYYY-MM-DD) sekian hari kerja setelah `date`, melewati Sabtu dan Minggu. */
export function addWorkdays(date: string, n: number) {
  const d = new Date(date + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Tenggat bawaan menu untuk data dengan nilai-nilai ini, atau kosong bila menu tidak punya. */
export const defaultDue = (mod: ModuleDef, values: Record<string, string>) =>
  mod.dueDays && values[mod.dateField] ? addWorkdays(values[mod.dateField], mod.dueDays) : '';

export function dueLabel(days: number) {
  if (days < 0) return `Lewat ${-days} hari`;
  if (days === 0) return 'Hari ini';
  if (days === 1) return 'Besok';
  return `${days} hari lagi`;
}

export const dueTone = (days: number) => (days < 0 ? 'over' : days <= 1 ? 'soon' : days <= REMIND_DAYS ? 'near' : 'far');

// ---------- WhatsApp ----------

/** Nomor WA dalam format internasional (62…) dari isian bebas; kosong bila bukan nomor. */
export function waNumber(kontak = '') {
  // Spasi, strip, titik, dan kurung di antara angka diabaikan, mis. "+62 822-8078-5113" atau "(0812) 345 678".
  const joined = kontak.replace(/(?<=[\d+])[\s().-]+(?=[\d(])/g, '');
  const m = joined.match(/(\+?62|0)8\d{7,13}/);
  if (!m) return '';
  const digits = m[0].replace(/\D/g, '');
  return digits.startsWith('0') ? '62' + digits.slice(1) : digits;
}

export const emailOf = (kontak = '') => kontak.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? '';

/** Satu baris dokumen untuk pesan WA, mis. `RAB "Pengadaan bogie"`. */
export function docLine(v: Record<string, string>) {
  const jenis = v.jenis === 'Lainnya' ? v.jenisLainnya || '' : v.jenis || '';
  return [jenis, v.perihal ? `"${v.perihal}"` : ''].filter(Boolean).join(' ') || 'Dokumen';
}

/** Tahap "diterima" atau "ditandatangani": isi pesan WA ke PIC berbeda. */
export const RECEIVED_STAGE = 'Diterima dari unit';

/**
 * Pesan WA untuk PIC unit: satu dokumen, atau daftar bila beberapa dokumen sekaligus.
 * `codes` berisi kode lacak dokumen-dokumen itu (lihat src/track.ts); bila ada, pesan ditutup
 * dengan tautan pantau status. Sama dengan fungsi message di supabase/functions/kabari-pic.
 */
export function signedMessage(docs: Record<string, string>[], stage = '', codes: string[] = []) {
  const v = docs[0] ?? {};
  const unit = v.unit ? ` dari unit ${v.unit}` : '';
  const received = stage === RECEIVED_STAGE;
  const what = received ? 'sudah kami terima dan akan kami teruskan ke EVP untuk ditandatangani' : 'sudah ditandatangani EVP';
  const body =
    docs.length > 1
      ? [`${docs.length} dokumen berikut${unit} ${what}:`, ...docs.map((d, i) => `${i + 1}. ${docLine(d)}`)]
      : [`${docLine(v) === 'Dokumen' ? 'Dokumen' : `Dokumen ${docLine(v)}`}${unit} ${what}.`];
  return [
    `Halo ${v.pic || 'Bapak/Ibu'},`,
    '',
    ...body,
    '',
    received
      ? 'Kami akan menginformasikan lagi setelah dokumen ditandatangani.'
      : 'Dokumen bisa diambil di Unit Dokumen, atau akan kami antarkan ke unit.',
    ...(codes.length ? ['', ...trackLines(codes)] : []),
    '',
    'Terima kasih,',
    'Unit Dokumen Balai Yasa Lahat',
  ].join('\n');
}

/** Tautan WA untuk mengabari PIC, atau kosong bila nomornya belum diisi. `codes`: kode lacak dokumennya. */
export function notifyUrl(docs: Record<string, string>[], stage = '', codes: string[] = []) {
  const wa = waNumber(docs[0]?.kontakPic);
  return wa ? `https://wa.me/${wa}?text=${encodeURIComponent(signedMessage(docs, stage, codes))}` : '';
}

/** Sama dengan pesan tahap "Resi dikirim ke user" di supabase/functions/kirim-paket. */
export function resiMessage(v: Record<string, string>) {
  return [
    `Halo ${v.pengirim || 'Bapak/Ibu'},`,
    '',
    `${v.isi ? `Paket "${v.isi}"` : 'Paket'} untuk ${v.tujuan || 'tujuan'} sudah dikirim lewat Kantor Pos.`,
    `Nomor resi: *${v.resi || '–'}*`,
    '',
    'Status pengiriman bisa dicek di https://www.posindonesia.co.id/id/tracking',
    '',
    'Terima kasih,',
    'Unit Dokumen Balai Yasa Lahat',
  ].join('\n');
}
