-- Menu Peminjaman Drone: izinkan modul 'drone' di tabel records.
-- Pengajuan dari unit masuk lewat fungsi "pinjam-drone" (tanpa login), jadi tidak ada
-- perubahan hak akses di sini.
alter table public.records drop constraint if exists records_module_check;
alter table public.records add constraint records_module_check
  check (module in ('evp', 'surat', 'keluar', 'pos', 'multimedia', 'arsip', 'drone'));

-- Label riwayat untuk peminjaman drone diambil dari keperluannya.
create or replace function public.record_label(v jsonb) returns text
language sql immutable as $$
  select coalesce(v ->> 'perihal', v ->> 'kegiatan', v ->> 'uraian', v ->> 'keperluan', v ->> 'tujuan', v ->> 'asal', '');
$$;
