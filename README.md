# Dashboard Dokumen BYLT

Dashboard untuk unit dokumen Balai Yasa Lahat. Semua alur kerja unit dokumen dicatat di satu tempat:

| Menu | Alur |
| --- | --- |
| **TTD EVP** | Dokumen fisik dari unit (Justifikasi & RAB, UMDS, UMD, Tagihan, dll.) → diserahkan ke EVP → ditandatangani → didistribusikan kembali ke unit |
| **Surat Masuk** | Surat dari luar didata → didistribusikan sesuai tujuan pada map |
| **Kantor Pos** | Kiriman dari unit → diserahkan ke kantor pos → resi diterima → resi dikirim ke user |
| **Multimedia** | Rekap kegiatan yang didokumentasikan: terjadwal → diliput → selesai & diarsipkan (dengan link hasil) |
| **Arsip** | Penyerahan arsip inaktif dari unit → diverifikasi → disimpan di depo (dengan lokasi rak/boks) |

Halaman **Ringkasan** menampilkan jumlah pekerjaan yang masih berjalan per menu, posisi dokumen TTD EVP per unit, pekerjaan yang tertahan 3 hari atau lebih, dan aktivitas terakhir.

Setiap menu punya pencarian, filter per tahap, tombol untuk memindahkan ke tahap berikutnya, riwayat perpindahan tahap, dan ekspor CSV (bisa dibuka di Excel).

## Penyimpanan data

Versi ini menyimpan data di browser (localStorage), jadi data hanya ada di komputer/browser yang dipakai. Gunakan **Unduh cadangan** dan **Pulihkan cadangan** di sidebar untuk membuat dan memulihkan cadangan JSON. Untuk dipakai bersama oleh beberapa orang, langkah berikutnya adalah menambahkan backend (misalnya Supabase atau Firebase).

## Menjalankan

```bash
npm install
npm run dev      # mode pengembangan
npm run build    # hasil build di folder dist/
```

Daftar unit, jenis dokumen, tahapan, dan kolom setiap menu diatur di `src/modules.ts`.
