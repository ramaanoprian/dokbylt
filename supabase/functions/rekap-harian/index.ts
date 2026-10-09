// Rekap pagi lewat WA dan cadangan data otomatis. Dijalankan pg_cron setiap hari kerja pukul 07.30 WIB
// (lihat supabase/migrations/004_rekap_harian.sql), atau oleh staf dari menu akun ("Kirim rekap sekarang").
//
// 1. Rekap ke nomor-nomor Unit Dokumen (secret DOKUMEN_WA, dipisah koma): yang lewat tenggat, yang
//    menunggu TTD EVP, paket yang belum ada resinya, dan pengajuan dari unit yang belum diproses.
// 2. Cadangan: seluruh data dan riwayat disimpan sebagai JSON di bucket privat "cadangan"
//    (satu file per hari, disimpan 30 hari).
//
// Tanpa login, fungsi ini hanya berjalan sekali per hari (dicatat di tabel rekap_log), jadi tidak bisa
// dipakai untuk mengirim WA berulang. Staf yang masuk boleh memaksa kirim ulang.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = Deno.env.get('SITE_URL') || 'https://dokumenbylt.my.id';
const BUCKET = 'cadangan';
const KEEP_DAYS = 30;
const MAX_LINES = 8;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

type Values = Record<string, string>;
interface Row {
  id: string;
  module: string;
  status: string;
  values: Values;
  history: { status: string; at: string; by?: string }[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// Sama dengan src/modules.ts: nama menu dan urutan tahap (tahap terakhir berarti selesai).
const MENU: Record<string, { menu: string; statuses: string[] }> = {
  evp: {
    menu: 'TTD EVP',
    statuses: ['Didaftarkan unit', 'Diterima dari unit', 'Diserahkan ke EVP', 'Ditandatangani EVP', 'Didistribusikan ke unit'],
  },
  surat: { menu: 'Surat Masuk', statuses: ['Didata', 'Didisposisi EVP', 'Didistribusikan'] },
  keluar: { menu: 'Surat Keluar', statuses: ['Didata', 'Ditandatangani', 'Dikirim'] },
  pos: {
    menu: 'Kantor Pos',
    statuses: ['Didaftarkan unit', 'Diterima dari unit', 'Proses pengiriman', 'Di-pick up kurir', 'Resi diterima', 'Resi dikirim ke user'],
  },
  multimedia: { menu: 'Multimedia', statuses: ['Terjadwal', 'Sudah diliput', 'Selesai & diarsipkan'] },
  arsip: { menu: 'Arsip', statuses: ['Diajukan unit', 'Diterima & diverifikasi', 'Disimpan di depo'] },
  drone: { menu: 'Drone', statuses: ['Diajukan', 'Disetujui', 'Dipinjam', 'Dikembalikan'] },
};

function waNumber(kontak = '') {
  // Spasi, strip, titik, dan kurung di antara angka diabaikan, mis. "+62 822-8078-5113" atau "(0812) 345 678".
  const joined = kontak.replace(/(?<=[\d+])[\s().-]+(?=[\d(])/g, '');
  const m = joined.match(/(\+?62|0)8\d{7,13}/);
  if (!m) return '';
  const digits = m[0].replace(/\D/g, '');
  return digits.startsWith('0') ? '62' + digits.slice(1) : digits;
}

const staffNumbers = () =>
  [...new Set((Deno.env.get('DOKUMEN_WA') ?? '').split(/[,;\n]/).map((n) => waNumber(n)).filter(Boolean))].join(',');

async function sendWa(target: string, text: string) {
  const token = Deno.env.get('FONNTE_TOKEN');
  if (!token) return 'FONNTE_TOKEN belum diatur';
  const body = new FormData();
  body.set('target', target);
  body.set('message', text);
  body.set('countryCode', '62');
  const res = await fetch('https://api.fonnte.com/send', { method: 'POST', headers: { Authorization: token }, body });
  const out = await res.json().catch(() => ({}));
  return !res.ok || out.status === false ? out.reason || `Fonnte menolak (${res.status})` : '';
}

/** Tanggal hari ini di WIB (YYYY-MM-DD). */
const todayWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

const isDone = (r: Row) => {
  const s = MENU[r.module]?.statuses;
  return !s || r.status === s[s.length - 1];
};

/** Sama dengan deadlineOf di src/util.ts. */
function deadlineOf(r: Row) {
  if (isDone(r)) return '';
  const v = r.values;
  if (r.module === 'multimedia' && r.status === MENU.multimedia.statuses[0] && v.tanggal) return v.tanggal;
  if (r.module === 'drone') return (r.status === 'Dipinjam' ? v.tanggalKembali || v.tanggalPakai : v.tanggalPakai) || '';
  return v.tenggat || '';
}

const labelOf = (v: Values) => v.perihal || v.kegiatan || v.uraian || v.keperluan || v.tujuan || v.asal || 'Tanpa judul';
const unitOf = (v: Values) => (v.unit === 'Lainnya' ? v.unitLainnya || '' : v.unit || '');

function fmtDay(d: string) {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);

/** Satu bagian rekap: judul dengan jumlah, lalu paling banyak MAX_LINES baris. */
function section(title: string, rows: Row[], line: (r: Row) => string) {
  if (!rows.length) return [];
  const shown = rows.slice(0, MAX_LINES).map((r, i) => `${i + 1}. ${line(r)}`);
  const more = rows.length > MAX_LINES ? [`   dan ${rows.length - MAX_LINES} lainnya`] : [];
  return ['', `*${title} (${rows.length})*`, ...shown, ...more];
}

function digest(rows: Row[], today: string) {
  const active = rows.filter((r) => !isDone(r));
  const overdue = active
    .filter((r) => {
      const d = deadlineOf(r);
      return d && d < today;
    })
    .sort((a, b) => deadlineOf(a).localeCompare(deadlineOf(b)));
  const dueToday = active.filter((r) => deadlineOf(r) === today);
  const atEvp = active.filter((r) => r.module === 'evp' && r.status === 'Diserahkan ke EVP');
  const noResi = active.filter((r) => r.module === 'pos' && ['Proses pengiriman', 'Di-pick up kurir'].includes(r.status));
  const incoming = active.filter(
    (r) => ((r.module === 'evp' || r.module === 'pos') && r.status === 'Didaftarkan unit') || (r.module === 'drone' && r.status === 'Diajukan'),
  );

  const who = (r: Row) => {
    const u = unitOf(r.values);
    return `${MENU[r.module].menu}: ${labelOf(r.values)}${u ? ` (${u})` : ''}`;
  };
  const since = (r: Row) => {
    const at = r.history[r.history.length - 1]?.at?.slice(0, 10);
    const n = at ? daysBetween(at, today) : 0;
    return n > 0 ? `, ${n} hari` : '';
  };

  const hari = new Date(today + 'T00:00:00Z').toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const body = [
    ...section('Lewat tenggat', overdue, (r) => `${who(r)}, tenggat ${fmtDay(deadlineOf(r))}`),
    ...section('Tenggat hari ini', dueToday, who),
    ...section('Menunggu TTD EVP', atEvp, (r) => `${labelOf(r.values)}${unitOf(r.values) ? ` (${unitOf(r.values)})` : ''}${since(r)}`),
    ...section('Paket belum ada resi', noResi, (r) => `${r.values.isi || 'Paket'} ke ${r.values.tujuan || '–'}, ${r.status.toLowerCase()}${since(r)}`),
    ...section('Pengajuan unit belum diproses', incoming, who),
  ];
  return [
    `Rekap pagi Unit Dokumen, ${hari}`,
    `${active.length} data masih berjalan.`,
    ...(body.length ? body : ['', 'Tidak ada yang lewat tenggat atau tertunda. Semua beres.']),
    '',
    `Buka dashboard: ${SITE}`,
  ].join('\n');
}

/** Ambil semua baris tabel per 1000 (batas satu permintaan Supabase). */
async function all<T>(table: string, columns: string, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select(columns).order(order, { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

/** Simpan seluruh data sebagai satu file JSON per hari, lalu hapus yang lebih lama dari KEEP_DAYS. */
async function backup(rows: Row[], today: string) {
  const activity = await all<Record<string, unknown>>('activity', '*', 'id');
  const data: Record<string, unknown[]> = {};
  for (const m of Object.keys(MENU)) data[m] = [];
  for (const r of rows) (data[r.module] ??= []).push(r);
  const file = JSON.stringify({ dibuat: new Date().toISOString(), jumlah: rows.length, data, aktivitas: activity });
  const path = `cadangan-${today}.json`;
  const up = await admin.storage.from(BUCKET).upload(path, new Blob([file], { type: 'application/json' }), { upsert: true });
  if (up.error) throw up.error;

  const { data: files } = await admin.storage.from(BUCKET).list('', { limit: 1000 });
  const cutoff = new Date(Date.parse(today + 'T00:00:00Z') - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  const old = (files ?? []).map((f) => f.name).filter((n) => (n.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? '9999') < cutoff);
  if (old.length) await admin.storage.from(BUCKET).remove(old);
  return { path, size: file.length };
}

async function staffUser(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data } = await db.auth.getUser();
  return data?.user ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung' }, 405);
  const input = await req.json().catch(() => ({}));
  const today = todayWib();

  try {
    const user = await staffUser(req);

    // Daftar file cadangan untuk staf, dengan tautan unduh sementara.
    if (input.action === 'cadangan') {
      if (!user) return json({ error: 'Harus masuk terlebih dahulu' }, 401);
      const { data: files } = await admin.storage.from(BUCKET).list('', { limit: 100, sortBy: { column: 'name', order: 'desc' } });
      const list = await Promise.all(
        (files ?? [])
          .filter((f) => f.name.endsWith('.json'))
          .map(async (f) => {
            const { data } = await admin.storage.from(BUCKET).createSignedUrl(f.name, 600, { download: f.name });
            return { name: f.name, size: (f.metadata as { size?: number } | null)?.size ?? 0, url: data?.signedUrl ?? '' };
          }),
      );
      return json({ ok: true, files: list });
    }

    // Tanpa login (jadwal pg_cron): sekali per hari saja.
    if (!(user && input.force)) {
      const { error } = await admin.from('rekap_log').insert({ tanggal: today });
      if (error) return json({ ok: true, skipped: 'Rekap hari ini sudah dikirim' });
    }

    const rows = await all<Row>('records', 'id, module, status, values, history, created_at, updated_at, created_by, updated_by', 'created_at');

    const saved = await backup(rows, today).catch((e) => {
      console.error('cadangan gagal', e);
      return null;
    });

    let waError = '';
    const to = staffNumbers();
    if (!to) waError = 'DOKUMEN_WA belum diisi';
    else {
      let text = digest(rows, today);
      if (!saved) text += '\n\nCatatan: cadangan data hari ini gagal dibuat.';
      waError = await sendWa(to, text);
    }
    console.log('rekap', JSON.stringify({ today, rows: rows.length, backup: saved?.path ?? null, waError }));
    if (waError) return json({ error: waError, backup: saved?.path ?? null }, 502);
    return json({ ok: true, target: to, backup: saved?.path ?? null });
  } catch (e) {
    console.error(e);
    return json({ error: 'Terjadi kesalahan di server' }, 500);
  }
});
