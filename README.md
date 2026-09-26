# Dashboard Dokumen BYLT

Dashboard internal unit dokumen Balai Yasa Lahat. Semua alur kerja unit dokumen dicatat di satu tempat, bisa dibuka dari browser apa pun (komputer maupun HP), dan datanya tersinkron antar perangkat.

| Menu | Alur |
| --- | --- |
| **TTD EVP** | Dokumen fisik dari unit (Justifikasi & RAB, UMDS, UMD, Tagihan, dll.) → diserahkan ke EVP → ditandatangani → didistribusikan kembali ke unit |
| **Surat Masuk** | Surat dari luar didata → didistribusikan sesuai tujuan pada map |
| **Kantor Pos** | Kiriman dari unit → diserahkan ke kantor pos → resi diterima → resi dikirim ke user |
| **Multimedia** | Rekap kegiatan yang didokumentasikan: terjadwal → diliput → selesai & diarsipkan (dengan link hasil) |
| **Arsip** | Penyerahan arsip inaktif dari unit → diverifikasi → disimpan di depo (dengan lokasi rak/boks) |
| **Riwayat Aktivitas** | Siapa mencatat, mengubah, memindahkan tahap, atau menghapus apa, dan kapan |

Hanya staf unit dokumen yang punya akun yang bisa masuk. Setiap perubahan tercatat otomatis oleh database beserta nama akun yang melakukannya, sehingga riwayat tidak bisa dipalsukan dari aplikasi.

## Pemasangan (sekali saja)

### 1. Buat database di Supabase (gratis)

1. Daftar di [supabase.com](https://supabase.com) lalu **New project** (region: Singapore).
2. Buka **SQL Editor → New query**, tempel seluruh isi [`supabase/schema.sql`](supabase/schema.sql), lalu **Run**.
3. Buka **Authentication → Sign In / Providers**, matikan **Allow new users to sign up** agar orang luar tidak bisa mendaftar sendiri.
4. Buka **Authentication → Users → Add user → Create new user** untuk setiap staf unit dokumen (email + kata sandi, centang *Auto Confirm User*). Saat pertama masuk, staf diminta mengisi nama lengkap yang akan tampil di riwayat.
5. Buka **Project Settings → API**, catat **Project URL** dan **anon public key**.

### 2. Online-kan lewat GitHub Pages (gratis)

1. Di repo GitHub: **Settings → Secrets and variables → Actions → Variables**, tambahkan:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public key
2. **Settings → Pages → Source: GitHub Actions**.
3. Setiap kali ada perubahan di branch `main`, dashboard otomatis terpasang di `https://ramaanoprian.github.io/dokbylt/`.

Anon key memang aman untuk dipasang di aplikasi web; data tetap terkunci dan hanya bisa dibaca akun yang sudah login.

## Menjalankan di komputer sendiri

```bash
npm install
cp .env.example .env.local   # isi URL dan anon key Supabase
npm run dev
```

Tanpa `.env.local`, aplikasi berjalan dalam **mode lokal**: tanpa login dan data hanya tersimpan di browser itu. Mode ini berguna untuk mencoba tampilan.

Daftar unit, jenis dokumen, tahapan, dan kolom setiap menu diatur di `src/modules.ts`.
