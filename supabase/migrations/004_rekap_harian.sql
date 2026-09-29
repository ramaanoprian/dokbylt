-- Rekap pagi lewat WA dan cadangan data harian (fungsi "rekap-harian").
-- pg_cron memanggil fungsinya setiap Senin sampai Jumat pukul 07.30 WIB (00.30 UTC).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Catatan rekap yang sudah terkirim, agar fungsi tanpa login hanya jalan sekali per hari.
-- Hanya dibaca dan ditulis fungsi server (service role); tidak ada akses dari browser.
create table if not exists public.rekap_log (
  tanggal date primary key,
  at timestamptz not null default now()
);
alter table public.rekap_log enable row level security;

-- Bucket privat untuk file cadangan JSON harian. Diunduh staf lewat fungsi (tautan sementara).
insert into storage.buckets (id, name, public)
values ('cadangan', 'cadangan', false)
on conflict (id) do nothing;

select cron.unschedule('rekap-harian') where exists (select 1 from cron.job where jobname = 'rekap-harian');
select cron.schedule(
  'rekap-harian',
  '30 0 * * 1-5',
  $$
  select net.http_post(
    url := 'https://mvxceyvbiehxeolfxslw.supabase.co/functions/v1/rekap-harian',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
