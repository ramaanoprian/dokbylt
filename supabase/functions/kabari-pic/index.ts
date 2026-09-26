// Mengirim WA otomatis ke PIC unit saat dokumen TTD EVP sudah ditandatangani.
// Pesan dikirim lewat Fonnte (https://fonnte.com). Token disimpan sebagai secret
// FONNTE_TOKEN di Supabase, tidak pernah sampai ke browser.
//
// Fungsi ini hanya mengirim ke nomor yang tercatat di data itu sendiri, dan hanya
// bila datanya memang sedang di tahap "Ditandatangani EVP", jadi tidak bisa dipakai
// untuk mengirim pesan bebas.
import { createClient } from 'npm:@supabase/supabase-js@2';

const NOTIFY: Record<string, string> = { evp: 'Ditandatangani EVP' };

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

function message(v: Record<string, string>) {
  const jenis = v.jenis === 'Lainnya' ? v.jenisLainnya || '' : v.jenis || '';
  return [
    `Halo ${v.pic || 'Bapak/Ibu'},`,
    '',
    `Dokumen${jenis ? ` ${jenis}` : ''}${v.perihal ? ` "${v.perihal}"` : ''}${v.unit ? ` dari unit ${v.unit}` : ''} sudah ditandatangani EVP.`,
    'Dokumen bisa diambil di Unit Dokumen, atau akan kami antarkan ke unit.',
    '',
    'Terima kasih,',
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

  const { id } = await req.json().catch(() => ({ id: '' }));
  if (!id) return json({ error: 'id kosong' }, 400);
  const { data: rec, error } = await db.from('records').select('module, status, values').eq('id', id).single();
  if (error || !rec) return json({ error: 'Data tidak ditemukan' }, 404);
  if (NOTIFY[rec.module] !== rec.status) return json({ error: 'Data belum di tahap yang perlu dikabari' }, 409);

  const values = (rec.values ?? {}) as Record<string, string>;
  const target = waNumber(values.kontakPic);
  if (!target) return json({ error: 'Nomor WA PIC belum diisi' }, 422);

  const body = new FormData();
  body.set('target', target);
  body.set('message', message(values));
  body.set('countryCode', '62');
  const res = await fetch('https://api.fonnte.com/send', { method: 'POST', headers: { Authorization: token }, body });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.status === false) return json({ error: out.reason || `Fonnte menolak (${res.status})` }, 502);
  return json({ ok: true, target });
});
