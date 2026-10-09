// Halaman lacak publik (#lacak/<kode>), tanpa login: unit melihat posisi dokumennya sendiri.
// Dipasang dengan verify_jwt = false.
//
// Kode lacak = 10 karakter heksadesimal pertama dari id data (lihat src/track.ts). Id dibuat acak,
// jadi kode tidak bisa ditebak. Data dicari lewat rentang uuid sehingga tidak perlu kolom baru.
//
// Permintaan: POST { kode: "3E657AAE08" } atau beberapa kode dipisah koma (dokumen yang didaftarkan
// atau dikabari bersamaan), paling banyak MAX_CODES. Jawaban: { ok, items: [...], missing: [...] }.
// Hanya data yang aman yang dikirim: menu, tahap, judul, unit, tanggal, dan riwayat tahap tanpa nama
// staf. Nomor WA, catatan, lampiran, token, alamat, dan isian lain tidak pernah ikut.
import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_CODES = 20;
const CODE = /^[0-9A-F]{10}$/;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

type Values = Record<string, string>;
interface Row {
  id: string;
  module: string;
  status: string;
  values: Values | null;
  history: { status?: unknown; at?: unknown }[] | null;
  created_at: string;
}

// Sama dengan src/modules.ts: nama menu, urutan tahap (tahap terakhir berarti selesai), field judul,
// dan field unit yang ditampilkan.
const MENU: Record<string, { menu: string; item: string; statuses: string[]; title: string; unit?: string }> = {
  evp: {
    menu: 'TTD EVP',
    item: 'Dokumen',
    statuses: ['Didaftarkan unit', 'Diterima dari unit', 'Diserahkan ke EVP', 'Ditandatangani EVP', 'Didistribusikan ke unit'],
    title: 'perihal',
    unit: 'unit',
  },
  surat: {
    menu: 'Surat Masuk',
    item: 'Surat',
    statuses: ['Didata', 'Didisposisi EVP', 'Didistribusikan'],
    title: 'perihal',
    unit: 'tujuan',
  },
  keluar: { menu: 'Surat Keluar', item: 'Surat', statuses: ['Didata', 'Ditandatangani', 'Dikirim'], title: 'perihal', unit: 'unit' },
  pos: {
    menu: 'Kantor Pos',
    item: 'Kiriman paket',
    statuses: ['Didaftarkan unit', 'Diterima dari unit', 'Proses pengiriman', 'Di-pick up kurir', 'Resi diterima', 'Resi dikirim ke user'],
    title: 'isi',
    unit: 'unit',
  },
  multimedia: { menu: 'Multimedia', item: 'Kegiatan', statuses: ['Terjadwal', 'Sudah diliput', 'Selesai & diarsipkan'], title: 'kegiatan' },
  arsip: { menu: 'Arsip', item: 'Arsip', statuses: ['Diajukan unit', 'Diterima & diverifikasi', 'Disimpan di depo'], title: 'uraian', unit: 'unit' },
  drone: { menu: 'Drone', item: 'Peminjaman drone', statuses: ['Diajukan', 'Disetujui', 'Dipinjam', 'Dikembalikan'], title: 'keperluan', unit: 'unit' },
};

/** Nilai pilihan, dengan keterangannya bila "Lainnya". */
const pick = (v: Values, key: string) => (v[key] === 'Lainnya' ? v[`${key}Lainnya`] || 'Lainnya' : v[key] || '');

/** Sama dengan deadlineOf di src/util.ts. */
function deadlineOf(r: Row, v: Values, done: boolean) {
  if (done) return '';
  if (r.module === 'multimedia' && r.status === MENU.multimedia.statuses[0] && v.tanggal) return v.tanggal;
  if (r.module === 'drone') return (r.status === 'Dipinjam' ? v.tanggalKembali || v.tanggalPakai : v.tanggalPakai) || '';
  return v.tenggat || '';
}

function info(kode: string, r: Row) {
  const m = MENU[r.module];
  const v = r.values ?? {};
  const done = r.status === m.statuses[m.statuses.length - 1];
  // Data bersifat rahasia (menu apa pun, mis. Surat Masuk atau Surat Keluar): perihal, jenis, dan tujuannya tidak ditampilkan.
  const secret = v.sifat === 'Rahasia';
  const unit = secret || !m.unit ? '' : r.module === 'surat' ? pick(v, 'disposisiKepada') || pick(v, 'tujuan') : pick(v, m.unit);
  return {
    kode,
    module: r.module,
    menu: m.menu,
    statuses: m.statuses,
    status: r.status,
    title: secret ? `${m.item} rahasia` : pick(v, m.title) || m.item,
    kind: !secret && r.module === 'evp' ? pick(v, 'jenis') || undefined : undefined,
    unit: unit || undefined,
    created: r.created_at,
    history: (r.history ?? [])
      .filter((h) => typeof h?.status === 'string' && typeof h?.at === 'string')
      .map((h) => ({ status: h.status as string, at: h.at as string })),
    deadline: deadlineOf(r, v, done) || undefined,
    done,
  };
}

/** Rentang uuid untuk awalan 10 karakter, mis. 3e657aae-0800-0000-… sampai 3e657aae-08ff-ffff-…. */
function range(kode: string) {
  const h = kode.toLowerCase();
  const head = `${h.slice(0, 8)}-${h.slice(8, 10)}`;
  return [`${head}00-0000-0000-000000000000`, `${head}ff-ffff-ffff-ffffffffffff`];
}

async function find(kode: string) {
  const [from, to] = range(kode);
  const { data, error } = await admin
    .from('records')
    .select('id, module, status, values, history, created_at')
    .gte('id', from)
    .lte('id', to)
    .limit(2);
  if (error) throw error;
  // Dua data dengan awalan yang sama hampir mustahil; bila terjadi, jangan menebak salah satunya.
  const rows = (data ?? []) as Row[];
  return rows.length === 1 && MENU[rows[0].module] ? info(kode, rows[0]) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung' }, 405);
  const input = await req.json().catch(() => ({}));

  const list: string[] = (Array.isArray(input.kodes) ? input.kodes : String(input.kode ?? '').split(','))
    .map((k: unknown) => String(k ?? '').trim().toUpperCase())
    .filter(Boolean);
  const kodes = [...new Set(list)];
  if (!kodes.length || kodes.length > MAX_CODES || kodes.some((k) => !CODE.test(k)))
    return json({ error: 'Kode lacak tidak valid', code: 'invalid' }, 400);

  try {
    const found = await Promise.all(kodes.map(find));
    const items = found.filter((x) => x !== null);
    if (!items.length) return json({ error: 'Kode lacak tidak ditemukan', code: 'not_found' }, 404);
    return json({ ok: true, items, missing: kodes.filter((_, i) => !found[i]) });
  } catch (e) {
    console.error(e);
    return json({ error: 'Terjadi kesalahan di server' }, 500);
  }
});
