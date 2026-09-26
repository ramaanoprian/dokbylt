-- Pembaruan: menu Surat Keluar, peran admin/staf, dan lampiran foto/scan.
-- Sudah termasuk di schema.sql; file ini untuk database yang dibuat sebelum pembaruan ini.

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
