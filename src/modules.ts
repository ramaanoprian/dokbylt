import type { IconName } from './icons';

export type FieldType = 'text' | 'textarea' | 'date' | 'select' | 'number' | 'url';

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  /** Tampilkan sebagai kolom di tabel daftar. */
  inTable?: boolean;
  placeholder?: string;
}

export interface ModuleDef {
  id: ModuleId;
  title: string;
  menu: string;
  description: string;
  icon: IconName;
  itemName: string;
  fields: Field[];
  /** Urutan tahapan alur kerja; tahap terakhir berarti selesai. */
  statuses: string[];
  /** Field yang wajib terisi sebelum masuk ke tahap tertentu. */
  requiredForStatus?: Record<string, string[]>;
  /** Field yang dipakai sebagai tanggal utama (untuk sortir). */
  dateField: string;
}

export type ModuleId = 'evp' | 'surat' | 'pos' | 'multimedia' | 'arsip';

export const UNITS = ['Rencana', 'Logistik', 'Keuangan', 'SDM', 'Dokumen', 'Lainnya'];

export const MODULES: ModuleDef[] = [
  {
    id: 'evp',
    title: 'Penandatanganan EVP',
    menu: 'TTD EVP',
    description:
      'Dokumen fisik dari unit yang butuh tanda tangan EVP: didata, diserahkan ke EVP, diambil kembali, lalu didistribusikan ke unit.',
    icon: 'evp',
    itemName: 'dokumen',
    dateField: 'tanggalMasuk',
    fields: [
      { key: 'tanggalMasuk', label: 'Tanggal masuk', type: 'date', required: true, inTable: true },
      { key: 'unit', label: 'Unit asal', type: 'select', options: UNITS, required: true, inTable: true },
      {
        key: 'jenis',
        label: 'Jenis dokumen',
        type: 'select',
        options: ['Justifikasi & RAB', 'UMDS', 'UMD', 'Tagihan', 'Lainnya'],
        required: true,
        inTable: true,
      },
      { key: 'nomor', label: 'Nomor dokumen', type: 'text', inTable: true },
      { key: 'perihal', label: 'Perihal', type: 'text', required: true, inTable: true },
      { key: 'pic', label: 'PIC unit (pengantar)', type: 'text' },
      { key: 'penerima', label: 'Diterima kembali oleh (unit)', type: 'text' },
      { key: 'catatan', label: 'Catatan', type: 'textarea' },
    ],
    statuses: ['Diterima dari unit', 'Diserahkan ke EVP', 'Ditandatangani EVP', 'Didistribusikan ke unit'],
    requiredForStatus: { 'Didistribusikan ke unit': ['penerima'] },
  },
  {
    id: 'surat',
    title: 'Surat Masuk',
    menu: 'Surat Masuk',
    description: 'Surat dari luar yang masuk ke unit dokumen: didata lalu didistribusikan sesuai tujuan pada map.',
    icon: 'surat',
    itemName: 'surat',
    dateField: 'tanggalTerima',
    fields: [
      { key: 'tanggalTerima', label: 'Tanggal diterima', type: 'date', required: true, inTable: true },
      { key: 'nomorSurat', label: 'Nomor surat', type: 'text', inTable: true },
      { key: 'asal', label: 'Asal / pengirim', type: 'text', required: true, inTable: true },
      { key: 'perihal', label: 'Perihal', type: 'text', required: true, inTable: true },
      {
        key: 'tujuan',
        label: 'Tujuan (sesuai map)',
        type: 'select',
        options: ['EVP', ...UNITS],
        required: true,
        inTable: true,
      },
      { key: 'penerima', label: 'Diterima oleh', type: 'text' },
      { key: 'catatan', label: 'Catatan', type: 'textarea' },
    ],
    statuses: ['Didata', 'Didistribusikan'],
    requiredForStatus: { Didistribusikan: ['penerima'] },
  },
  {
    id: 'pos',
    title: 'Pengiriman via Kantor Pos',
    menu: 'Kantor Pos',
    description:
      'Paket/dokumen dari unit untuk dikirim keluar daerah: diserahkan ke kantor pos, resi diterima, lalu resi dikirim ke pengirim.',
    icon: 'pos',
    itemName: 'kiriman',
    dateField: 'tanggal',
    fields: [
      { key: 'tanggal', label: 'Tanggal diterima dari unit', type: 'date', required: true, inTable: true },
      { key: 'unit', label: 'Unit pengirim', type: 'select', options: UNITS, required: true, inTable: true },
      { key: 'pengirim', label: 'Nama pengirim (user)', type: 'text', required: true, inTable: true },
      { key: 'kontak', label: 'Kontak pengirim (WA/email)', type: 'text' },
      { key: 'tujuan', label: 'Tujuan (nama & kota)', type: 'text', required: true, inTable: true },
      { key: 'isi', label: 'Isi kiriman', type: 'text' },
      { key: 'resi', label: 'Nomor resi', type: 'text', inTable: true },
      { key: 'biaya', label: 'Biaya (Rp)', type: 'number' },
      { key: 'catatan', label: 'Catatan', type: 'textarea' },
    ],
    statuses: ['Diterima dari unit', 'Diserahkan ke pos', 'Resi diterima', 'Resi dikirim ke user'],
    requiredForStatus: { 'Resi diterima': ['resi'] },
  },
  {
    id: 'multimedia',
    title: 'Kegiatan Multimedia',
    menu: 'Multimedia',
    description: 'Rekap kegiatan Balai Yasa Lahat yang didokumentasikan oleh unit dokumen.',
    icon: 'multimedia',
    itemName: 'kegiatan',
    dateField: 'tanggal',
    fields: [
      { key: 'tanggal', label: 'Tanggal kegiatan', type: 'date', required: true, inTable: true },
      { key: 'kegiatan', label: 'Nama kegiatan', type: 'text', required: true, inTable: true },
      { key: 'lokasi', label: 'Lokasi', type: 'text', inTable: true },
      {
        key: 'jenis',
        label: 'Jenis dokumentasi',
        type: 'select',
        options: ['Foto', 'Video', 'Foto & Video', 'Publikasi/Media sosial'],
        inTable: true,
      },
      { key: 'petugas', label: 'Petugas', type: 'text' },
      { key: 'link', label: 'Link hasil dokumentasi', type: 'url', placeholder: 'https://drive.google.com/…' },
      { key: 'catatan', label: 'Catatan', type: 'textarea' },
    ],
    statuses: ['Terjadwal', 'Sudah diliput', 'Selesai & diarsipkan'],
    requiredForStatus: { 'Selesai & diarsipkan': ['link'] },
  },
  {
    id: 'arsip',
    title: 'Arsip & Depo Arsip',
    menu: 'Arsip',
    description: 'Penyerahan arsip inaktif dari unit ke unit dokumen dan penyimpanannya di depo arsip.',
    icon: 'arsip',
    itemName: 'arsip',
    dateField: 'tanggal',
    fields: [
      { key: 'tanggal', label: 'Tanggal penyerahan', type: 'date', required: true, inTable: true },
      { key: 'unit', label: 'Unit asal', type: 'select', options: UNITS, required: true, inTable: true },
      { key: 'uraian', label: 'Uraian arsip', type: 'text', required: true, inTable: true },
      { key: 'tahun', label: 'Tahun arsip', type: 'text', placeholder: 'mis. 2019–2021', inTable: true },
      { key: 'jumlahBoks', label: 'Jumlah boks', type: 'number', inTable: true },
      { key: 'lokasi', label: 'Lokasi di depo (rak/boks)', type: 'text' },
      { key: 'beritaAcara', label: 'No. berita acara', type: 'text' },
      { key: 'catatan', label: 'Catatan', type: 'textarea' },
    ],
    statuses: ['Diajukan unit', 'Diterima & diverifikasi', 'Disimpan di depo'],
    requiredForStatus: { 'Disimpan di depo': ['lokasi'] },
  },
];

export const moduleById = (id: string) => MODULES.find((m) => m.id === id)!;
