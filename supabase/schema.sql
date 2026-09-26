-- Skema database Dashboard Dokumen BYLT.
-- Jalankan sekali di Supabase: SQL Editor → New query → tempel seluruh isi file ini → Run.

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  module text not null check (module in ('evp', 'surat', 'keluar', 'pos', 'multimedia', 'arsip')),
  status text not null,
  values jsonb not null default '{}'::jsonb,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);

create index if not exists records_module_idx on public.records (module);

-- Riwayat aktivitas diisi otomatis oleh trigger di bawah, sehingga setiap perubahan
-- selalu tercatat beserta akun yang melakukannya dan tidak bisa diubah dari aplikasi.
create table if not exists public.activity (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  user_name text,
  module text not null,
  record_id uuid,
  action text not null,
  label text,
  detail text
);

create index if not exists activity_at_idx on public.activity (at desc);

create or replace function public.current_user_name() returns text
language sql stable as $$
  select coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    auth.jwt() ->> 'email',
    'sistem'
  );
$$;

create or replace function public.record_label(v jsonb) returns text
language sql immutable as $$
  select coalesce(v ->> 'perihal', v ->> 'kegiatan', v ->> 'uraian', v ->> 'tujuan', v ->> 'asal', '');
$$;

create or replace function public.log_record_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text := public.current_user_name();
begin
  if tg_op = 'INSERT' then
    new.created_by := who;
    new.updated_by := who;
    insert into activity (user_name, module, record_id, action, label, detail)
    values (who, new.module, new.id, 'tambah', record_label(new.values), new.status);
    return new;
  elsif tg_op = 'UPDATE' then
    new.updated_by := who;
    new.updated_at := now();
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if new.status is distinct from old.status then
      insert into activity (user_name, module, record_id, action, label, detail)
      values (who, new.module, new.id, 'pindah tahap', record_label(new.values), old.status || ' → ' || new.status);
    end if;
    if new.values is distinct from old.values then
      insert into activity (user_name, module, record_id, action, label, detail)
      values (who, new.module, new.id, 'ubah data', record_label(new.values), (
        select string_agg(k, ', ')
        from (
          select key as k from jsonb_each(new.values)
          where new.values -> key is distinct from old.values -> key
          union
          select key from jsonb_each(old.values) where not new.values ? key
        ) changed
      ));
    end if;
    return new;
  else
    insert into activity (user_name, module, record_id, action, label, detail)
    values (who, old.module, old.id, 'hapus', record_label(old.values), old.status);
    return old;
  end if;
end;
$$;

drop trigger if exists records_log on public.records;
create trigger records_log
  before insert or update or delete on public.records
  for each row execute function public.log_record_change();

-- Hanya akun yang sudah login (staf unit dokumen) yang bisa membaca dan menulis.
alter table public.records enable row level security;
alter table public.activity enable row level security;

drop policy if exists "staf baca records" on public.records;
drop policy if exists "staf tambah records" on public.records;
drop policy if exists "staf ubah records" on public.records;
drop policy if exists "staf hapus records" on public.records;
drop policy if exists "staf baca activity" on public.activity;

create policy "staf baca records" on public.records for select to authenticated using (true);
create policy "staf tambah records" on public.records for insert to authenticated with check (true);
create policy "staf ubah records" on public.records for update to authenticated using (true) with check (true);
-- Activity hanya bisa dibaca; penulisannya lewat trigger (security definer).
create policy "staf baca activity" on public.activity for select to authenticated using (true);

-- Sinkron langsung antar perangkat.
do $$
begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.activity;
exception when duplicate_object then null;
end $$;

-- ---------- Surat keluar, peran admin/staf, lampiran ----------
-- 1. Menu Surat Keluar
alter table public.records drop constraint if exists records_module_check;
alter table public.records add constraint records_module_check
  check (module in ('evp', 'surat', 'keluar', 'pos', 'multimedia', 'arsip'));

-- 2. Peran: disimpan di app_metadata akun (tidak bisa diubah pengguna sendiri).
--    Tanpa peran berarti staf. Hanya admin yang boleh menghapus data dan mengatur peran.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select raw_app_meta_data ->> 'role' = 'admin' from auth.users where id = auth.uid()), false);
$$;

create or replace function public.list_staff()
returns table (id uuid, email text, name text, role text, last_sign_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select u.id, u.email::text,
         coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email)::text,
         coalesce(u.raw_app_meta_data ->> 'role', 'staf'),
         u.last_sign_in_at
  from auth.users u
  where auth.uid() is not null
  order by 3;
$$;

create or replace function public.set_staff_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang boleh mengubah peran.';
  end if;
  if new_role not in ('admin', 'staf') then
    raise exception 'Peran tidak dikenal: %', new_role;
  end if;
  if new_role = 'staf'
     and (select raw_app_meta_data ->> 'role' from auth.users where id = target) = 'admin'
     and (select count(*) from auth.users where raw_app_meta_data ->> 'role' = 'admin') <= 1 then
    raise exception 'Minimal harus ada satu admin.';
  end if;
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', new_role)
  where id = target;
end;
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.list_staff() from public, anon;
revoke all on function public.set_staff_role(uuid, text) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.list_staff() to authenticated;
grant execute on function public.set_staff_role(uuid, text) to authenticated;

drop policy if exists "staf hapus records" on public.records;
drop policy if exists "admin hapus records" on public.records;
create policy "admin hapus records" on public.records for delete to authenticated using (public.is_admin());

-- 3. Lampiran foto/scan (maks. 10 MB per berkas, hanya gambar dan PDF, tidak publik)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lampiran', 'lampiran', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "staf baca lampiran" on storage.objects;
drop policy if exists "staf unggah lampiran" on storage.objects;
drop policy if exists "staf hapus lampiran" on storage.objects;
create policy "staf baca lampiran" on storage.objects for select to authenticated using (bucket_id = 'lampiran');
create policy "staf unggah lampiran" on storage.objects for insert to authenticated with check (bucket_id = 'lampiran');
create policy "staf hapus lampiran" on storage.objects for delete to authenticated using (bucket_id = 'lampiran');
