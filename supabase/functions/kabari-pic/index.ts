// Mengirim WA otomatis ke PIC unit saat dokumen TTD EVP diterima dan saat sudah ditandatangani.
// Pesan dikirim lewat Fonnte (https://fonnte.com). Token disimpan sebagai secret
// FONNTE_TOKEN di Supabase, tidak pernah sampai ke browser.
//
// Fungsi ini hanya mengirim ke nomor yang tercatat di data itu sendiri, dan hanya bila
// datanya memang sudah sampai di tahap yang dikabarkan, jadi tidak bisa dipakai untuk
// mengirim pesan bebas.
import { createClient } from 'npm:@supabase/supabase-js@2';

// Urutan tahap dan tahap yang dikabari. Data dianggap sudah melewati sebuah tahap bila
// tahapnya sekarang sama atau sesudahnya (staf kadang melompat langsung ke tahap akhir).
const STATUSES: Record<string, string[]> = {
  evp: ['Didaftarkan unit', 'Diterima dari unit', 'Diserahkan ke EVP', 'Ditandatangani EVP', 'Didistribusikan ke unit'],
};
const STAGES: Record<string, string[]> = { evp: ['Diterima dari unit', 'Ditandatangani EVP'] };
const RECEIVED = 'Diterima dari unit';
const SIGNED = 'Ditandatangani EVP';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function waNumber(kontak = '') {
  const m = kontak.match(/(\+?62|0)8[\d\s.-]{7,14}/);
  if (!m) return '';
  const digits = m[0].replace(/\D/g, '');
  return digits.startsWith('0') ? '62' + digits.slice(1) : digits;
}

function docLine(v: Record<string, string>) {
  const jenis = v.jenis === 'Lainnya' ? v.jenisLainnya || '' : v.jenis || '';
  return [jenis, v.perihal ? `"${v.perihal}"` : ''].filter(Boolean).join(' ') || 'Dokumen';
}

// Sama dengan signedMessage di src/util.ts.
function message(docs: Record<string, string>[], sender: string, stage: string) {
  const v = docs[0] ?? {};
  const unit = v.unit ? ` dari unit ${v.unit}` : '';
  const received = stage === RECEIVED;
  const what = received ? 'sudah kami terima dan akan kami teruskan ke EVP untuk ditandatangani' : 'sudah ditandatangani EVP';
  const body =
    docs.length > 1
      ? [`${docs.length} dokumen berikut${unit} ${what}:`, ...docs.map((d, i) => `${i + 1}. ${docLine(d)}`)]
      : [`${docLine(v) === 'Dokumen' ? 'Dokumen' : `Dokumen ${docLine(v)}`}${unit} ${what}.`];
  return [
    `Halo ${v.pic || 'Bapak/Ibu'},`,
    '',
    ...body,
    '',
    received
      ? 'Kami akan mengabari lagi setelah dokumen ditandatangani.'
      : 'Dokumen bisa diambil di Unit Dokumen, atau akan kami antarkan ke unit.',
    '',
    'Terima kasih,',
    ...(sender ? [sender] : []),
    'Unit Dokumen Balai Yasa Lahat',
  ].join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung' }, 405);

  const token = Deno.env.get('FONNTE_TOKEN');
  if (!token) return json({ error: 'FONNTE_TOKEN belum diatur' }, 503);

  // Baca data dengan hak akses staf yang sedang masuk (RLS tetap berlaku).
  const auth = req.headers.get('Authorization') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: user } = await db.auth.getUser();
  if (!user?.user) return json({ error: 'Harus masuk terlebih dahulu' }, 401);

  // Satu id, atau beberapa id sekaligus; dokumen dengan nomor WA yang sama digabung jadi satu pesan.
  const input = await req.json().catch(() => ({}));
  const ids: string[] = (Array.isArray(input.ids) ? input.ids : input.id ? [input.id] : [])
    .filter((x: unknown) => typeof x === 'string')
    .slice(0, 50);
  if (!ids.length) return json({ error: 'id kosong' }, 400);
  const stage = typeof input.stage === 'string' ? input.stage : SIGNED;
  const { data: recs, error } = await db.from('records').select('id, module, status, values').in('id', ids);
  if (error || !recs?.length) return json({ error: 'Data tidak ditemukan' }, 404);

  const groups = new Map<string, Record<string, string>[]>();
  recs.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  for (const rec of recs) {
    const order = STATUSES[rec.module];
    if (!order || !STAGES[rec.module].includes(stage) || order.indexOf(rec.status) < order.indexOf(stage)) continue;
    const values = (rec.values ?? {}) as Record<string, string>;
    const target = waNumber(values.kontakPic);
    if (target) groups.set(target, [...(groups.get(target) ?? []), values]);
  }
  if (!groups.size) return json({ error: 'Belum ada dokumen yang perlu dikabari' }, 409);

  const meta = user.user.user_metadata ?? {};
  const sender = String(meta.full_name || meta.name || '').trim();
  const sent: string[] = [];
  let failure = '';
  for (const [target, docs] of groups) {
    const body = new FormData();
    body.set('target', target);
    body.set('message', message(docs, sender, stage));
    body.set('countryCode', '62');
    const res = await fetch('https://api.fonnte.com/send', { method: 'POST', headers: { Authorization: token }, body });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.status === false) failure = out.reason || `Fonnte menolak (${res.status})`;
    else sent.push(target);
  }
  if (!sent.length) return json({ error: failure }, 502);
  return json({ ok: true, target: sent.join(','), failed: failure || undefined });
});
