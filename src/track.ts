// Kode lacak publik: unit bisa melihat posisi dokumennya sendiri tanpa login.
import type { DocRecord } from './backend';

/** Alamat resmi situs, untuk tautan yang keluar dari aplikasi (WA, kertas cetak). */
export const SITE = 'https://dokumenbylt.my.id';

/**
 * 10 karakter heksadesimal pertama dari id (UUID acak), huruf besar, mis. "3E657AAE08".
 * Tidak berurutan sehingga tidak bisa ditebak, dan berlaku untuk semua data lama tanpa kolom baru.
 */
export const trackCode = (r: Pick<DocRecord, 'id'>) => r.id.replace(/-/g, '').slice(0, 10).toUpperCase();

/** Tautan halaman lacak untuk sebuah data, di alamat situs yang sedang dibuka. */
export const trackUrl = (r: Pick<DocRecord, 'id'>) => `${location.origin}${location.pathname}#lacak/${trackCode(r)}`;

/** Tautan lacak di alamat resmi untuk satu atau beberapa kode (dokumen yang dikabari bersamaan). */
export const siteTrackUrl = (codes: string[]) => `${SITE}/#lacak/${codes.join(',')}`;

export const isTrackCode = (s: string) => /^[0-9A-F]{10}$/.test(s);

/** Batas kode dalam satu tautan, sama dengan fungsi server lacak-dokumen. */
export const MAX_CODES = 20;

/**
 * Baris "Pantau status" untuk pesan WA. Kode dipecah per MAX_CODES agar setiap tautan bisa dibuka;
 * bila lebih dari satu tautan, barisnya diberi nomor. Sama dengan fungsi trackLines di kabari-pic.
 */
export function trackLines(codes: string[]) {
  const urls: string[] = [];
  for (let i = 0; i < codes.length; i += MAX_CODES) urls.push(siteTrackUrl(codes.slice(i, i + MAX_CODES)));
  return urls.map((u, i) => (urls.length > 1 ? `Pantau status (${i + 1}/${urls.length}): ${u}` : `Pantau status: ${u}`));
}

/**
 * Kode-kode lacak dari teks bebas: satu kode, beberapa kode dipisah koma, atau tautan lacak lengkap.
 * Spasi dan strip di dalam kode diabaikan, huruf O dianggap angka nol.
 */
export function parseCodes(text: string) {
  const at = text.search(/#lacak\//i);
  const part = at >= 0 ? text.slice(at + 7) : text;
  const codes = part
    .split(/[,;\n]+/)
    .map((c) => c.replace(/[\s-]+/g, '').toUpperCase().replace(/O/g, '0'))
    .filter(Boolean);
  return [...new Set(codes)];
}
