// Pengiriman paket lewat Kantor Pos, dengan pemohon dan kurir pick-up yang tidak perlu login.
//
// Tanpa login:
//   ajukan  pemohon dari unit mengisi formulir (#kirim-paket, dibuka dari QR)
//   lihat   kurir membuka tautan pribadinya dari WA (butuh token)
//   pickup  kurir menandai paket sudah diambil
//   resi    kurir mengisi nomor resi (dan foto resi bila ada)
// Dengan login staf:
//   kabari  kirim WA sesuai tahap sekarang: ke pemohon saat paket diterima, ke kurir saat
//           proses pengiriman, dan resi ke pemohon saat tahap "Resi dikirim ke user"
//
// WA dikirim lewat Fonnte (secret FONNTE_TOKEN). Setiap langkah pemohon dan kurir juga
// dikabarkan ke nomor-nomor Unit Dokumen di secret DOKUMEN_WA (dipisah koma), bila diisi.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = Deno.env.get('SITE_URL') || 'https://dokumenbylt.my.id';
const SIGN = 'Unit Dokumen Balai Yasa Lahat';
const UNITS = ['Rencana', 'Logistik', 'Keuangan', 'SDM', 'Dokumen', 'Lainnya'];
const BUCKET = 'lampiran';
const MAX_FOTO = 4_000_000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

type Values = Record<string, string>;
interface Rec {
  id: string;
  module: string;
  status: string;
  values: Values;
  history: { status: string; at: string; by?: string }[];
}

function waNumber(kontak = '') {
  const m = kontak.match(/(\+?62|0)8[\d\s.-]{7,14}/);
  if (!m) return '';
  const digits = m[0].replace(/\D/g, '');
  return digits.startsWith('0') ? '62' + digits.slice(1) : digits;
}

/** Nomor-nomor WA Unit Dokumen dari secret DOKUMEN_WA, mis. "0812..., 0813...". */
const staffNumbers = () =>
  [...new Set((Deno.env.get('DOKUMEN_WA') ?? '').split(/[,;\n]/).map((n) => waNumber(n)).filter(Boolean))].join(',');

const clean = (s: unknown, max = 200) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

// Alamat boleh beberapa baris.
const cleanLines = (s: unknown, max = 400) =>
  String(s ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);

const newToken = () => crypto.randomUUID().replace(/-/g, '');
const unitOf = (v: Values) => v.unitLainnya || v.unit || '–';
const linkOf = (r: Rec) => `${SITE}/#kirim-paket/${r.id}.${r.values.token}`;
const paket = (v: Values) => (v.isi ? `paket "${v.isi}"` : 'paket');
const Paket = (v: Values) => (v.isi ? `Paket "${v.isi}"` : 'Paket');

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

async function tellStaff(text: string) {
  const to = staffNumbers();
  if (to) await sendWa(to, `${text}\n\nBuka: ${SITE}/#pos`);
}

const letter = (name: string, lines: string[]) =>
  [`Halo ${name || 'Bapak/Ibu'},`, '', ...lines, '', 'Terima kasih,', SIGN].join('\n');

/** Pesan untuk pemohon atau kurir sesuai tahap data sekarang; kosong bila tahap ini tidak dikabari. */
function message(r: Rec): { to: 'pemohon' | 'kurir'; text: string } | null {
  const v = r.values;
  switch (r.status) {
    case 'Didaftarkan unit':
      return {
        to: 'pemohon',
        text: letter(v.pengirim, [
          `Permohonan pengiriman ${paket(v)} ke ${v.tujuan || 'tujuan'} sudah kami catat.`,
          'Silakan serahkan paketnya ke Unit Dokumen. Kami akan menginformasikan lagi setelah paket diterima.',
        ]),
      };
    case 'Diterima dari unit':
      return {
        to: 'pemohon',
        text: letter(v.pengirim, [
          `${Paket(v)} untuk ${v.tujuan || 'tujuan'} sudah kami terima dan akan segera dikirim lewat Kantor Pos.`,
          'Kami akan menginformasikan nomor resinya setelah paket dikirim.',
        ]),
      };
    case 'Proses pengiriman':
      return {
        to: 'kurir',
        text: letter(v.kurir, [
          'Ada paket dari Unit Dokumen Balai Yasa Lahat yang siap di-pick up:',
          `Isi: ${v.isi || '–'}`,
          `Tujuan: ${v.tujuan || '–'}`,
          ...(v.alamat ? [`Alamat: ${v.alamat}`] : []),
          '',
          'Setelah paket diambil, tekan tautan ini untuk konfirmasi. Tautan yang sama dipakai untuk mengirim nomor resi:',
          linkOf(r),
        ]),
      };
    case 'Di-pick up kurir':
      return {
        to: 'kurir',
        text: letter(v.kurir, [
          `Terima kasih, paket untuk ${v.tujuan || 'tujuan'} sudah tercatat diambil.`,
          'Setelah paket dikirim di Kantor Pos, isi nomor resinya (dan foto resi bila ada) lewat tautan ini:',
          linkOf(r),
        ]),
      };
    case 'Resi dikirim ke user':
      return {
        to: 'pemohon',
        text: letter(v.pengirim, [
          `${Paket(v)} untuk ${v.tujuan || 'tujuan'} sudah dikirim lewat Kantor Pos.`,
          `Nomor resi: *${v.resi || '–'}*`,
          '',
          'Status pengiriman bisa dicek di https://www.posindonesia.co.id/id/tracking',
        ]),
      };
    default:
      return null;
  }
}

async function notify(r: Rec) {
  const m = message(r);
  if (!m) return { error: 'Tahap ini tidak dikabari lewat WA' };
  const target = waNumber(m.to === 'kurir' ? r.values.kontakKurir : r.values.kontak);
  if (!target) return { error: m.to === 'kurir' ? 'Nomor WA kurir belum diisi' : 'Nomor WA pemohon belum diisi' };
  const fail = await sendWa(target, m.text);
  return fail ? { error: fail } : { target };
}

async function byToken(input: { id?: unknown; token?: unknown }) {
  const id = clean(input.id, 40);
  const token = clean(input.token, 64);
  if (!id || !token) return null;
  const { data } = await admin.from('records').select('id, module, status, values, history').eq('id', id).maybeSingle();
  const r = data as Rec | null;
  if (!r || r.module !== 'pos' || !r.values.token || r.values.token !== token) return null;
  return r;
}

// Yang boleh dilihat kurir: tidak ada nomor WA pemohon.
const courierView = (r: Rec) => ({
  status: r.status,
  unit: unitOf(r.values),
  pengirim: r.values.pengirim,
  tujuan: r.values.tujuan,
  alamat: r.values.alamat,
  isi: r.values.isi,
  kurir: r.values.kurir,
  resi: r.values.resi,
  history: r.history.map((h) => ({ status: h.status, at: h.at })),
});

async function save(r: Rec, status: string, values: Values, by: string) {
  const at = new Date().toISOString();
  const history = status === r.status ? r.history : [...r.history, { status, at, by }];
  const { error } = await admin.from('records').update({ status, values, history }).eq('id', r.id);
  if (error) throw error;
  return { ...r, status, values, history };
}

async function uploadFoto(r: Rec, foto: { data?: unknown; type?: unknown }, by: string) {
  const type = String(foto.type ?? '');
  if (!/^image\/(jpeg|png|webp)$/.test(type)) return null;
  const bytes = Uint8Array.from(atob(String(foto.data ?? '')), (c) => c.charCodeAt(0));
  if (!bytes.length || bytes.length > MAX_FOTO) return null;
  const ext = type.split('/')[1].replace('jpeg', 'jpg');
  const path = `pos/${r.id}/resi-${Date.now()}.${ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: type });
  if (error) throw error;
  return { path, name: `Foto resi.${ext}`, type, size: bytes.length, at: new Date().toISOString(), by };
}

const PICKUP_FROM = ['Proses pengiriman'];
const RESI_FROM = ['Proses pengiriman', 'Di-pick up kurir', 'Resi diterima'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung' }, 405);
  const input = await req.json().catch(() => ({}));

  try {
    switch (input.action) {
      case 'ajukan': {
        // Kolom jebakan: diisi berarti bot.
        if (input.website) return json({ ok: true });
        const f = input.form ?? {};
        const v: Values = {
          tanggal: new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10),
          unit: UNITS.includes(f.unit) ? f.unit : '',
          unitLainnya: f.unit === 'Lainnya' ? clean(f.unitLainnya, 80) : '',
          pengirim: clean(f.pengirim, 80),
          kontak: clean(f.kontak, 30),
          tujuan: clean(f.tujuan, 160),
          alamat: cleanLines(f.alamat),
          isi: clean(f.isi, 160),
          catatan: clean(f.catatan, 500),
          sumber: 'Formulir online',
        };
        if (!v.unit || !v.pengirim) return json({ error: 'Unit dan nama pemohon wajib diisi' }, 400);
        if (v.unit === 'Lainnya' && !v.unitLainnya) return json({ error: 'Tulis nama unitnya' }, 400);
        if (!waNumber(v.kontak)) return json({ error: 'Nomor WA tidak valid' }, 400);
        if (!v.tujuan || !v.alamat) return json({ error: 'Penerima dan alamat tujuan wajib diisi' }, 400);
        for (const k of Object.keys(v)) if (!v[k]) delete v[k];
        v.token = newToken();

        const at = new Date().toISOString();
        const { data, error } = await admin
          .from('records')
          .insert({
            module: 'pos',
            status: 'Didaftarkan unit',
            values: v,
            history: [{ status: 'Didaftarkan unit', at, by: v.pengirim }],
          })
          .select('id, module, status, values, history')
          .single();
        if (error) throw error;
        const r = data as Rec;
        await notify(r);
        await tellStaff(
          [
            'Permohonan kirim paket baru',
            `${v.pengirim} (${unitOf(v)}), ${v.kontak}`,
            `${v.isi || 'Paket'} ke ${v.tujuan}`,
          ].join('\n'),
        );
        return json({ ok: true });
      }

      case 'lihat': {
        const r = await byToken(input);
        return r ? json({ ok: true, paket: courierView(r) }) : json({ error: 'Tautan tidak valid' }, 404);
      }

      case 'pickup': {
        const r = await byToken(input);
        if (!r) return json({ error: 'Tautan tidak valid' }, 404);
        if (r.status === 'Di-pick up kurir') return json({ ok: true, paket: courierView(r) });
        if (!PICKUP_FROM.includes(r.status))
          return json({ error: `Belum bisa: paket masih di tahap "${r.status}"`, paket: courierView(r) }, 409);
        const moved = await save(r, 'Di-pick up kurir', r.values, r.values.kurir || 'Kurir');
        await notify(moved);
        await tellStaff(`${Paket(moved.values)} ke ${moved.values.tujuan} sudah di-pick up ${moved.values.kurir || 'kurir'}.`);
        return json({ ok: true, paket: courierView(moved) });
      }

      case 'resi': {
        const r = await byToken(input);
        if (!r) return json({ error: 'Tautan tidak valid' }, 404);
        if (!RESI_FROM.includes(r.status))
          return json({ error: `Belum bisa: paket masih di tahap "${r.status}"`, paket: courierView(r) }, 409);
        const resi = clean(input.resi, 60);
        if (!resi) return json({ error: 'Nomor resi wajib diisi' }, 400);
        const by = r.values.kurir || 'Kurir';
        const values: Values = { ...r.values, resi };
        const biaya = clean(input.biaya, 20).replace(/\D/g, '');
        if (biaya) values.biaya = biaya;
        if (input.foto) {
          const att = await uploadFoto(r, input.foto, by);
          if (!att) return json({ error: 'Foto resi harus gambar JPG/PNG di bawah 4 MB' }, 400);
          let list: unknown[] = [];
          try {
            list = JSON.parse(r.values.lampiran || '[]');
          } catch {
            list = [];
          }
          values.lampiran = JSON.stringify([...(Array.isArray(list) ? list : []), att]);
        }
        const fixed = r.status === 'Resi diterima';
        const moved = await save(r, 'Resi diterima', values, by);
        await tellStaff(
          [
            fixed ? 'Nomor resi diperbarui kurir' : 'Resi paket sudah dikirim kurir',
            `${Paket(moved.values)} ke ${moved.values.tujuan}`,
            `Resi: ${resi}${biaya ? ` · Rp${Number(biaya).toLocaleString('id-ID')}` : ''}`,
            `Pemohon: ${moved.values.pengirim} (${unitOf(moved.values)})`,
          ].join('\n'),
        );
        return json({ ok: true, paket: courierView(moved) });
      }

      case 'kabari': {
        const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
          global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
        });
        const { data: user } = await db.auth.getUser();
        if (!user?.user) return json({ error: 'Harus masuk terlebih dahulu' }, 401);
        const { data } = await db
          .from('records')
          .select('id, module, status, values, history')
          .eq('id', clean(input.id, 40))
          .maybeSingle();
        const r = data as Rec | null;
        if (!r || r.module !== 'pos') return json({ error: 'Data tidak ditemukan' }, 404);
        // Data yang dicatat staf langsung di dashboard belum punya token: buatkan agar tautan kurir jalan.
        if (!r.values.token) {
          r.values = { ...r.values, token: newToken() };
          await admin.from('records').update({ values: r.values }).eq('id', r.id);
        }
        const out = await notify(r);
        return 'error' in out ? json({ error: out.error }, 502) : json({ ok: true, target: out.target });
      }

      default:
        return json({ error: 'Aksi tidak dikenal' }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: 'Terjadi kesalahan di server' }, 500);
  }
});
