// Peminjaman drone oleh unit-unit di Balai Yasa Lahat.
//
// Tanpa login (formulir publik lewat QR dan tautan pribadi di WA):
//   ajukan      unit mengisi formulir pengajuan
//   lihat       peminjam melihat status pengajuannya (butuh token rahasia dari WA)
//   konfirmasi  peminjam menandai drone sudah diambil atau sudah dikembalikan (butuh token)
//   jadwal      tanggal-tanggal drone sudah terpakai, tanpa data pribadi
// Dengan login staf:
//   kabari      kirim WA ke peminjam sesuai tahapnya sekarang (setelah staf memindah tahap)
//
// WA dikirim lewat Fonnte (secret FONNTE_TOKEN). Bila secret DOKUMEN_WA diisi (nomor WA
// Unit Dokumen), pengajuan baru dan pengembalian juga dikabarkan ke nomor itu.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = Deno.env.get('SITE_URL') || 'https://dokumenbylt.my.id';
const SIGN = 'Unit Dokumen Balai Yasa Lahat';
const UNITS = ['SDM', 'Quality Control', 'Fasilitas', 'Rencana', 'Logistik', 'Keuangan', 'Lainnya'];
const SERAH = ['Diantar ke unit', 'Diambil di Unit Dokumen'];

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

const isDate = (s = '') => /^\d{4}-\d{2}-\d{2}$/.test(s);
const clean = (s: unknown, max = 200) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

function fmtDate(d = '') {
  if (!isDate(d)) return d;
  return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const period = (v: Values) =>
  v.tanggalKembali && v.tanggalKembali !== v.tanggalPakai
    ? `${fmtDate(v.tanggalPakai)} sampai ${fmtDate(v.tanggalKembali)}`
    : fmtDate(v.tanggalPakai);

const linkOf = (r: Rec) => `${SITE}/#pinjam-drone/${r.id}.${r.values.token}`;

function message(r: Rec, sender = '') {
  const v = r.values;
  const hi = `Halo ${v.pic || 'Bapak/Ibu'},`;
  const close = ['', 'Terima kasih,', ...(sender ? [sender] : []), SIGN];
  const lines: Record<string, string[]> = {
    Diajukan: [
      `Pengajuan peminjaman drone untuk ${v.keperluan || 'kegiatan unit'} pada ${period(v)} sudah kami terima.`,
      'Kami akan mengabari lagi setelah pengajuan dikonfirmasi.',
      '',
      `Cek status pengajuan: ${linkOf(r)}`,
    ],
    Disetujui: [
      `Peminjaman drone untuk ${v.keperluan || 'kegiatan unit'} pada ${period(v)} sudah disetujui.`,
      v.serah === 'Diantar ke unit'
        ? `Drone akan kami antar ke unit ${v.unit || ''}.`.replace(' .', '.')
        : 'Silakan ambil drone di Unit Dokumen.',
      '',
      'Setelah drone Anda terima, tekan tautan ini untuk konfirmasi:',
      linkOf(r),
    ],
    Dipinjam: [
      'Drone sudah tercatat Anda terima. Selamat bertugas.',
      ...(v.tanggalKembali ? [`Rencana kembali: ${fmtDate(v.tanggalKembali)}.`] : []),
      '',
      'Setelah selesai dan drone dikembalikan ke Unit Dokumen, tekan tautan ini:',
      linkOf(r),
    ],
    Dikembalikan: ['Drone sudah tercatat dikembalikan. Terima kasih sudah menjaga drone dengan baik.'],
  };
  return [hi, '', ...(lines[r.status] ?? []), ...close].join('\n');
}

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

/** Kabar singkat ke nomor Unit Dokumen, bila diatur. */
async function tellStaff(text: string) {
  const to = waNumber(Deno.env.get('DOKUMEN_WA') ?? '');
  if (to) await sendWa(to, text);
}

async function byToken(input: { id?: unknown; token?: unknown }) {
  const id = clean(input.id, 40);
  const token = clean(input.token, 64);
  if (!id || !token) return null;
  const { data } = await admin.from('records').select('id, module, status, values, history').eq('id', id).maybeSingle();
  const r = data as Rec | null;
  if (!r || r.module !== 'drone' || !r.values.token || r.values.token !== token) return null;
  return r;
}

const publicView = (r: Rec) => ({
  status: r.status,
  unit: r.values.unit === 'Lainnya' ? r.values.unitLainnya || 'Lainnya' : r.values.unit,
  pic: r.values.pic,
  keperluan: r.values.keperluan,
  lokasi: r.values.lokasi,
  tanggalPakai: r.values.tanggalPakai,
  tanggalKembali: r.values.tanggalKembali,
  serah: r.values.serah,
  history: r.history.map((h) => ({ status: h.status, at: h.at })),
});

async function move(r: Rec, status: string, by: string) {
  const at = new Date().toISOString();
  const history = [...r.history, { status, at, by }];
  const { error } = await admin.from('records').update({ status, history }).eq('id', r.id);
  if (error) throw error;
  return { ...r, status, history };
}

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
          pic: clean(f.pic, 80),
          unit: UNITS.includes(f.unit) ? f.unit : '',
          unitLainnya: f.unit === 'Lainnya' ? clean(f.unitLainnya, 80) : '',
          kontakPic: clean(f.kontakPic, 30),
          tanggalPakai: clean(f.tanggalPakai, 10),
          tanggalKembali: clean(f.tanggalKembali, 10),
          keperluan: clean(f.keperluan, 200),
          lokasi: clean(f.lokasi, 120),
          serah: SERAH.includes(f.serah) ? f.serah : '',
          catatan: clean(f.catatan, 500),
          sumber: 'Formulir online',
        };
        const target = waNumber(v.kontakPic);
        if (!v.pic || !v.unit || !v.keperluan) return json({ error: 'Nama, unit, dan keperluan wajib diisi' }, 400);
        if (v.unit === 'Lainnya' && !v.unitLainnya) return json({ error: 'Tulis nama unitnya' }, 400);
        if (!target) return json({ error: 'Nomor WA tidak valid' }, 400);
        if (!isDate(v.tanggalPakai)) return json({ error: 'Tanggal pakai wajib diisi' }, 400);
        if (v.tanggalKembali && (!isDate(v.tanggalKembali) || v.tanggalKembali < v.tanggalPakai))
          return json({ error: 'Tanggal kembali tidak boleh sebelum tanggal pakai' }, 400);
        const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
        if (v.tanggalPakai < today) return json({ error: 'Tanggal pakai sudah lewat' }, 400);
        for (const k of Object.keys(v)) if (!v[k]) delete v[k];
        v.token = crypto.randomUUID().replace(/-/g, '');

        const at = new Date().toISOString();
        const { data, error } = await admin
          .from('records')
          .insert({ module: 'drone', status: 'Diajukan', values: v, history: [{ status: 'Diajukan', at, by: v.pic }] })
          .select('id, module, status, values, history')
          .single();
        if (error) throw error;
        const r = data as Rec;
        await sendWa(target, message(r));
        await tellStaff(
          [
            'Pengajuan pinjam drone baru',
            `${v.pic} (${v.unitLainnya || v.unit}), ${v.kontakPic}`,
            `${period(v)}: ${v.keperluan}`,
            '',
            `Buka: ${SITE}/#drone`,
          ].join('\n'),
        );
        return json({ ok: true, id: r.id, token: v.token });
      }

      case 'lihat': {
        const r = await byToken(input);
        return r ? json({ ok: true, loan: publicView(r) }) : json({ error: 'Tautan tidak valid' }, 404);
      }

      case 'konfirmasi': {
        const r = await byToken(input);
        if (!r) return json({ error: 'Tautan tidak valid' }, 404);
        const next = input.step === 'ambil' ? 'Dipinjam' : input.step === 'kembali' ? 'Dikembalikan' : '';
        const from = next === 'Dipinjam' ? 'Disetujui' : 'Dipinjam';
        if (!next) return json({ error: 'Langkah tidak dikenal' }, 400);
        if (r.status === next) return json({ ok: true, loan: publicView(r) });
        if (r.status !== from)
          return json({ error: `Belum bisa: peminjaman masih di tahap "${r.status}"`, loan: publicView(r) }, 409);
        const moved = await move(r, next, r.values.pic || 'Peminjam');
        const target = waNumber(moved.values.kontakPic);
        if (target) await sendWa(target, message(moved));
        if (next === 'Dikembalikan')
          await tellStaff(
            `Drone dikembalikan oleh ${moved.values.pic} (${moved.values.unitLainnya || moved.values.unit}). Mohon cek kondisinya.\n${SITE}/#drone`,
          );
        return json({ ok: true, loan: publicView(moved) });
      }

      case 'jadwal': {
        const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
        const { data } = await admin
          .from('records')
          .select('status, values')
          .eq('module', 'drone')
          .in('status', ['Disetujui', 'Dipinjam']);
        const busy = (data ?? [])
          .map((r) => {
            const v = r.values as Values;
            return { mulai: v.tanggalPakai, selesai: v.tanggalKembali || v.tanggalPakai, unit: v.unitLainnya || v.unit };
          })
          .filter((b) => isDate(b.mulai) && b.selesai >= today)
          .sort((a, b) => a.mulai.localeCompare(b.mulai))
          .slice(0, 20);
        return json({ ok: true, busy });
      }

      case 'kabari': {
        const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
          global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
        });
        const { data: user } = await db.auth.getUser();
        if (!user?.user) return json({ error: 'Harus masuk terlebih dahulu' }, 401);
        const { data } = await db.from('records').select('id, module, status, values, history').eq('id', clean(input.id, 40)).maybeSingle();
        const r = data as Rec | null;
        if (!r || r.module !== 'drone') return json({ error: 'Data tidak ditemukan' }, 404);
        // Data yang dicatat staf langsung di dashboard belum punya token: buatkan agar tautannya jalan.
        if (!r.values.token) {
          r.values = { ...r.values, token: crypto.randomUUID().replace(/-/g, '') };
          await admin.from('records').update({ values: r.values }).eq('id', r.id);
        }
        const target = waNumber(r.values.kontakPic);
        if (!target) return json({ error: 'Nomor WA peminjam belum diisi' }, 422);
        const meta = user.user.user_metadata ?? {};
        const fail = await sendWa(target, message(r, String(meta.full_name || meta.name || '').trim()));
        return fail ? json({ error: fail }, 502) : json({ ok: true, target });
      }

      default:
        return json({ error: 'Aksi tidak dikenal' }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: 'Terjadi kesalahan di server' }, 500);
  }
});
