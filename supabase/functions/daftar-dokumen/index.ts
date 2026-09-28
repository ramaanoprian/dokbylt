// Pendaftaran dokumen TTD EVP oleh unit, tanpa login (formulir #daftar-dokumen lewat QR).
// Setiap berkas menjadi satu data di menu TTD EVP dengan tahap "Didaftarkan unit". Setelah
// staf menerima dokumen fisiknya, PIC dikabari lewat fungsi "kabari-pic".
//
// Bila secret DOKUMEN_WA diisi (nomor WA Unit Dokumen, boleh beberapa dipisah koma), pendaftaran
// baru dikabarkan ke sana.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = Deno.env.get('SITE_URL') || 'https://dokumenbylt.my.id';
const UNITS = ['Rencana', 'Logistik', 'Keuangan', 'SDM', 'Dokumen', 'Lainnya'];
const JENIS = ['Justifikasi & RAB', 'UMDS', 'UMD', 'Tagihan', 'Lainnya'];
const MAX_BERKAS = 20;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

function waNumber(kontak = '') {
  // Spasi, strip, titik, dan kurung di antara angka diabaikan, mis. "+62 822-8078-5113" atau "(0812) 345 678".
  const joined = kontak.replace(/(?<=[\d+])[\s().-]+(?=[\d(])/g, '');
  const m = joined.match(/(\+?62|0)8\d{7,13}/);
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

async function tellStaff(text: string) {
  const to = staffNumbers();
  const token = Deno.env.get('FONNTE_TOKEN');
  if (!to || !token) return;
  const body = new FormData();
  body.set('target', to);
  body.set('message', text);
  body.set('countryCode', '62');
  await fetch('https://api.fonnte.com/send', { method: 'POST', headers: { Authorization: token }, body }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung' }, 405);
  const input = await req.json().catch(() => ({}));
  if (input.action !== 'daftar') return json({ error: 'Aksi tidak dikenal' }, 400);
  // Kolom jebakan: diisi berarti bot.
  if (input.website) return json({ ok: true, count: 0 });

  try {
    const f = input.form ?? {};
    const common: Record<string, string> = {
      unit: UNITS.includes(f.unit) ? f.unit : '',
      unitLainnya: f.unit === 'Lainnya' ? clean(f.unitLainnya, 80) : '',
      pic: clean(f.pic, 80),
      kontakPic: clean(f.kontakPic, 30),
      catatan: clean(f.catatan, 500),
      tanggalMasuk: new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10),
      sumber: 'Formulir online',
    };
    if (!common.unit || !common.pic) return json({ error: 'Unit dan nama PIC wajib diisi' }, 400);
    if (common.unit === 'Lainnya' && !common.unitLainnya) return json({ error: 'Tulis nama unitnya' }, 400);
    if (!waNumber(common.kontakPic)) return json({ error: 'Nomor WA tidak valid' }, 400);

    const list = (Array.isArray(input.berkas) ? input.berkas : []).slice(0, MAX_BERKAS);
    const berkas = list.map((b: Record<string, unknown>) => ({
      jenis: JENIS.includes(String(b?.jenis)) ? String(b.jenis) : '',
      jenisLainnya: b?.jenis === 'Lainnya' ? clean(b.jenisLainnya, 80) : '',
      perihal: clean(b?.perihal, 200),
      nomor: clean(b?.nomor, 80),
    }));
    if (!berkas.length) return json({ error: 'Tambahkan minimal satu berkas' }, 400);
    const bad = berkas.findIndex((b) => !b.jenis || !b.perihal || (b.jenis === 'Lainnya' && !b.jenisLainnya));
    if (bad >= 0) return json({ error: `Lengkapi jenis dan nama berkas nomor ${bad + 1}` }, 400);

    const at = new Date().toISOString();
    const rows = berkas.map((b) => {
      const values: Record<string, string> = { ...common, ...b };
      for (const k of Object.keys(values)) if (!values[k]) delete values[k];
      return {
        module: 'evp',
        status: 'Didaftarkan unit',
        values,
        history: [{ status: 'Didaftarkan unit', at, by: common.pic }],
      };
    });
    const { error } = await admin.from('records').insert(rows);
    if (error) throw error;

    await tellStaff(
      [
        `${rows.length} dokumen TTD EVP didaftarkan`,
        `${common.pic} (${common.unitLainnya || common.unit}), ${common.kontakPic}`,
        ...berkas.map((b, i) => `${i + 1}. ${b.jenisLainnya || b.jenis} "${b.perihal}"`),
        '',
        `Buka: ${SITE}/#evp`,
      ].join('\n'),
    );
    return json({ ok: true, count: rows.length });
  } catch (e) {
    console.error(e);
    return json({ error: 'Terjadi kesalahan di server' }, 500);
  }
});
