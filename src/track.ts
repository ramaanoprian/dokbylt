// Kode lacak publik: unit bisa melihat posisi dokumennya sendiri tanpa login.
import type { DocRecord } from './backend';

/**
 * 10 karakter heksadesimal pertama dari id (UUID acak), huruf besar, mis. "3E657AAE08".
 * Tidak berurutan sehingga tidak bisa ditebak, dan berlaku untuk semua data lama tanpa kolom baru.
 */
export const trackCode = (r: Pick<DocRecord, 'id'>) => r.id.replace(/-/g, '').slice(0, 10).toUpperCase();

/** Tautan halaman lacak untuk sebuah data, di alamat situs yang sedang dibuka. */
export const trackUrl = (r: Pick<DocRecord, 'id'>) => `${location.origin}${location.pathname}#lacak/${trackCode(r)}`;
