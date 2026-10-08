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
  hint?: string;
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
  /** Tenggat bawaan: sekian hari kerja setelah tanggal utama. Tetap bisa diubah di form. */
  dueDays?: number;
  /** Tahap-tahap yang memicu pesan WA (bawaan ke nomor di field `kontakPic`), digabung per nomor. */
  notifyStages?: string[];
  /** Field nomor WA tujuan bila bukan `notifyContact`, per tahap (mis. kurir paket). */
  notifyTo?: Record<string, string>;
  /** Field nomor WA tujuan bawaan untuk `notifyStages`; bila kosong `kontakPic`. */
  notifyContact?: string;
  /** Tahap WA "sudah ditandatangani", untuk tombol kirim ulang manual di form. */
  notifyStatus?: string;
  /** Tahap awal sebelum diproses (didaftarkan unit sendiri lewat formulir publik). */
  preStatus?: string;
  /** Tahap-tahap yang langsung memicu WA lewat fungsi server menu ini (peminjam drone, pemohon atau kurir paket). */
  notifyOn?: string[];
}

export type ModuleId = 'evp' | 'surat' | 'keluar' | 'pos' | 'multimedia' | 'arsip' | 'drone';

export const UNITS = ['Rencana', 'Logistik', 'Keuangan', 'SDM', 'Dokumen', 'Lainnya'];
/** Unit yang biasa meminjam drone. */
export const DRONE_UNITS = ['SDM', 'Quality Control', 'Fasilitas', 'Rencana', 'Logistik', 'Keuangan', 'Lainnya'];
export const DRONE_STATUSES = ['Diajukan', 'Disetujui', 'Dipinjam', 'Dikembalikan'];
export const POS_STATUSES = [
  'Didaftarkan unit',
  'Diterima dari unit',
  'Proses pengiriman',
  'Di-pick up kurir',
  'Resi diterima',
  'Resi dikirim ke user',
];

/** Pilihan yang mewajibkan keterangan tambahan. */
export const OTHER = 'Lainnya';
/** Kunci penyimpanan keterangan untuk pilihan "Lainnya" pada sebuah field. */
export const otherKey = (key: string) => `${key}Lainnya`;

const tenggat = (hint: string): Field => ({ key: 'tenggat', label: 'Tenggat', type: 'date', hint });

export const MODULES: ModuleDef[] = [
  {
    id: 'evp',
    preStatus: 'Didaftarkan unit',
    notifyStages: ['Diterima dari unit', 'Ditandatangani EVP'],
    notifyStatus: 'Ditandatangani EVP',
    dueDays: 3,
    title: 'Penandatanganan EVP',
    menu: 'TTD EVP',
    description:
      'Dokumen fisik dari unit yang butuh tanda tangan EVP: didaftarkan unit lewat QR, diterima, diserahkan ke EVP, diambil kembali, lalu didistribusikan ke unit.',
    icon: 'evp',
    itemName: 'dokumen',
    dateField: 'tanggalMasuk',
    fields: [
      { key: 'tanggalMasuk', label: 'Tanggal masuk', type: 'date', required: true, inTable: true },
      tenggat('Batas dokumen harus sudah kembali ke unit'),
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
      {
        key: 'kontakPic',
        label: 'No. WA PIC unit',
        type: 'text',
        placeholder: '08…',
        hint: 'PIC dikabari lewat WA saat dokumen diterima dan saat sudah ditandatangani EVP',
      },
      { key: 'penerima', label: 'Diterima kembali oleh (unit)', type: 'text' },
      { key: 'catatan', label: 'Catatan', type: 'textarea' },
    ],
    statuses: ['Didaftarkan unit', 'Diterima dari unit', 'Diserahkan ke EVP', 'Ditandatangani EVP', 'Didistribusikan ke unit'],
    requiredForStatus: { 'Didistribusikan ke unit': ['penerima'] },
  },
  {
    id: 'surat',
    dueDays: 2,
    title: 'Surat Masuk',
    menu: 'Surat Masuk',
    description: 'Surat dari luar yang masuk ke unit dokumen: didata lalu didistribusikan sesuai tujuan pada map.',
    icon: 'surat',
    itemName: 'surat',
    dateField: 'tanggalTerima',
    fields: [
      { key: 'tanggalTerima', label: 'Tanggal diterima', type: 'date', required: true, inTable: true },
      tenggat('Batas surat harus sudah didistribusikan'),
      { key: 'nomorSurat', label: 'Nomor surat', type: 'text', inTable: true },
      { key: 'tanggalSurat', label: 'Tanggal surat', type: 'date', inTable: true },
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
    id: 'keluar',
    dueDays: 2,
    title: 'Surat Keluar',
    menu: 'Surat Keluar',
    description: 'Surat dari Balai Yasa Lahat untuk pihak luar: didata, ditandatangani, lalu dikirim ke tujuan.',
    icon: 'keluar',
    itemName: 'surat',
    dateField: 'tanggal',
    fields: [
      { key: 'tanggal', label: 'Tanggal surat', type: 'date', required: true, inTable: true },
      tenggat('Batas surat harus sudah dikirim'),
      { key: 'nomorSurat', label: 'Nomor surat', type: 'text', inTable: true },
      { key: 'unit', label: 'Unit pembuat', type: 'select', options: UNITS, required: true, inTable: true },
      { key: 'tujuan', label: 'Tujuan', type: 'text', required: true, inTable: true },
      { key: 'perihal', label: 'Perihal', type: 'text', required: true, inTable: true },
      { key: 'sifat', label: 'Sifat', type: 'select', options: ['Biasa', 'Segera', 'Rahasia'] },
      {
        key: 'pengiriman',
        label: 'Cara pengiriman',
        type: 'select',
        options: ['Diantar langsung', 'Kantor Pos', 'Email', 'Lainnya'],
      },
      { key: 'penerima', label: 'Diterima oleh (di tujuan)', type: 'text' },
      { key: 'catatan', label: 'Catatan', type: 'textarea' },
    ],
    statuses: ['Didata', 'Ditandatangani', 'Dikirim'],
    requiredForStatus: { Dikirim: ['pengiriman'] },
  },
  {
    id: 'pos',
    preStatus: 'Didaftarkan unit',
    notifyStages: ['Diterima dari unit', 'Proses pengiriman', 'Resi dikirim ke user'],
    notifyTo: { 'Proses pengiriman': 'kontakKurir' },
    notifyContact: 'kontak',
    dueDays: 2,
    title: 'Pengiriman via Kantor Pos',
    menu: 'Kantor Pos',
    description:
      'Paket dari unit untuk dikirim keluar daerah: didaftarkan pemohon lewat QR, diterima, diambil kurir, lalu resi yang diunggah kurir langsung diteruskan ke pemohon.',
    icon: 'pos',
    itemName: 'kiriman',
    dateField: 'tanggal',
    fields: [
      { key: 'tanggal', label: 'Tanggal diterima dari unit', type: 'date', required: true, inTable: true },
      tenggat('Batas paket harus sudah dikirim'),
      { key: 'unit', label: 'Unit pengirim', type: 'select', options: UNITS, required: true, inTable: true },
      { key: 'pengirim', label: 'Nama pemohon', type: 'text', required: true, inTable: true },
      {
        key: 'kontak',
        label: 'No. WA pemohon',
        type: 'text',
        placeholder: '08…',
        hint: 'Pemohon dikabari lewat WA saat paket diterima dan saat resi dikirim',
      },
      { key: 'tujuan', label: 'Penerima & kota tujuan', type: 'text', required: true, inTable: true },
      { key: 'alamat', label: 'Alamat lengkap tujuan', type: 'textarea' },
      { key: 'isi', label: 'Isi paket', type: 'text' },
      { key: 'kurir', label: 'Nama kurir pick-up', type: 'text', inTable: true },
      {
        key: 'kontakKurir',
        label: 'No. WA kurir',
        type: 'text',
        placeholder: '08…',
        hint: 'Kurir dapat WA berisi tautan untuk konfirmasi pick-up dan unggah resi',
      },
      { key: 'resi', label: 'Nomor resi', type: 'text', inTable: true },
      { key: 'biaya', label: 'Biaya (Rp)', type: 'number' },
      { key: 'catatan', label: 'Catatan', type: 'textarea' },
    ],
    statuses: POS_STATUSES,
    requiredForStatus: { 'Proses pengiriman': ['kurir', 'kontakKurir'], 'Resi diterima': ['resi'] },
  },
  {
    id: 'multimedia',
    dueDays: 3,
    title: 'Kegiatan Multimedia',
    menu: 'Multimedia',
    description: 'Rekap kegiatan Balai Yasa Lahat yang didokumentasikan oleh unit dokumen.',
    icon: 'multimedia',
    itemName: 'kegiatan',
    dateField: 'tanggal',
    fields: [
      { key: 'tanggal', label: 'Tanggal kegiatan', type: 'date', required: true, inTable: true },
      tenggat('Batas hasil dokumentasi harus selesai diolah'),
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
    dueDays: 5,
    title: 'Arsip & Depo Arsip',
    menu: 'Arsip',
    description: 'Penyerahan arsip inaktif dari unit ke unit dokumen dan penyimpanannya di depo arsip.',
    icon: 'arsip',
    itemName: 'arsip',
    dateField: 'tanggal',
    fields: [
      { key: 'tanggal', label: 'Tanggal penyerahan', type: 'date', required: true, inTable: true },
      tenggat('Batas arsip harus sudah disimpan di depo'),
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
  {
    id: 'drone',
    notifyOn: ['Disetujui', 'Dipinjam', 'Dikembalikan'],
    title: 'Peminjaman Drone',
    menu: 'Drone',
    description:
      'Unit mengajukan lewat formulir (QR), unit dokumen menyetujui dan mengantar atau menyiapkan drone, lalu peminjam menandai saat mengambil dan mengembalikan.',
    icon: 'drone',
    itemName: 'peminjaman',
    dateField: 'tanggalPakai',
    fields: [
      { key: 'tanggalPakai', label: 'Tanggal pakai', type: 'date', required: true, inTable: true },
      { key: 'tanggalKembali', label: 'Rencana kembali', type: 'date', inTable: true },
      { key: 'unit', label: 'Unit peminjam', type: 'select', options: DRONE_UNITS, required: true, inTable: true },
      { key: 'pic', label: 'Nama peminjam', type: 'text', required: true, inTable: true },
      {
        key: 'kontakPic',
        label: 'No. WA peminjam',
        type: 'text',
        required: true,
        placeholder: '08…',
        hint: 'Peminjam dikabari lewat WA di setiap tahap',
      },
      { key: 'keperluan', label: 'Keperluan', type: 'text', required: true, inTable: true },
      { key: 'lokasi', label: 'Lokasi terbang', type: 'text' },
      {
        key: 'serah',
        label: 'Penyerahan drone',
        type: 'select',
        options: ['Diantar ke unit', 'Diambil di Unit Dokumen'],
        inTable: true,
      },
      { key: 'kondisi', label: 'Kondisi saat kembali', type: 'select', options: ['Baik', 'Perlu dicek', 'Rusak'] },
      { key: 'catatan', label: 'Catatan', type: 'textarea' },
    ],
    statuses: DRONE_STATUSES,
    requiredForStatus: { Disetujui: ['serah'] },
  },
];

/** Field nomor WA yang dikabari pada tahap itu. */
export const notifyKey = (mod: ModuleDef, stage: string) => mod.notifyTo?.[stage] ?? mod.notifyContact ?? 'kontakPic';

/** Field nama pemilik nomor WA, untuk tulisan "WA ke …". */
export const CONTACT_NAME: Record<string, string> = { kontakPic: 'pic', kontakKurir: 'kurir', kontak: 'pengirim' };

/** Tahap awal untuk data yang dicatat staf (melewati tahap "didaftarkan unit"). */
export const firstStatus = (mod: ModuleDef) => mod.statuses.find((s) => s !== mod.preStatus) ?? mod.statuses[0];

export const moduleById = (id: string) => MODULES.find((m) => m.id === id)!;
