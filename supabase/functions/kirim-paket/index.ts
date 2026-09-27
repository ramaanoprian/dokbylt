// Pengiriman paket lewat Kantor Pos, dengan pemohon dan kurir pick-up yang tidak perlu login.
//
// Tanpa login:
//   ajukan  pemohon dari unit mengisi formulir (#kirim-paket, dibuka dari QR), boleh beberapa paket
//   lihat   kurir membuka tautan pribadinya dari WA (butuh token; satu tautan bisa beberapa paket)
//   pickup  kurir menandai paket sudah diambil
//   resi    kurir mengisi nomor resi (dan foto resi bila ada); resi dan foto langsung diteruskan ke pemohon
// Dengan login staf:
//   kabari  kirim WA untuk beberapa paket sekaligus, digabung per nomor: ke pemohon saat paket diterima, ke kurir saat
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
/** Satu tautan kurir untuk beberapa paket sekaligus: #kirim-paket/<id>.<token>,<id>.<token>… */
const linkOf = (recs: Rec[]) => `${SITE}/#kirim-paket/${recs.map((r) => `${r.id}.${r.values.token}`).join(',')}`;
const isiOf = (v: Values) => (v.isi ? `"${v.isi}"` : 'Paket');
const paketOf = (v: Values) => (v.isi ? `paket "${v.isi}"` : 'paket');
const PaketOf = (v: Values) => (v.isi ? `Paket "${v.isi}"` : 'Paket');
const MAX_PAKET = 20;

/** Kirim WA lewat Fonnte; kosong bila berhasil, alasan gagal bila tidak. */
async function sendWa(target: string, text: string, image = ''): Promise<string> {
  const token = Deno.env.get('FONNTE_TOKEN');
  if (!token) return 'FONNTE_TOKEN belum diatur';
  const body = new FormData();
  body.set('target', target);
  body.set('message', text);
  body.set('countryCode', '62');
  if (image) body.set('url', image);
  const res = await fetch('https://api.fonnte.com/send', { method: 'POST', headers: { Authorization: token }, body });
  const out = await res.json().catch(() => ({}));
  console.log(image ? 'fonnte gambar' : 'fonnte teks', JSON.stringify(out));
  return !res.ok || out.status === false ? out.reason || `Fonnte menolak (${res.status})` : '';
}

interface Att {
  path: string;
  name: string;
}

/** Tautan sementara (30 hari) ke foto resi terbaru satu paket, bila ada. */
async function resiPhoto(r: Rec) {
  let latest: Att | null = null;
  try {
    const list = JSON.parse(r.values.lampiran || '[]') as Att[];
    for (const a of list) if (a?.name?.startsWith('Foto resi') && (!latest || a.path > latest.path)) latest = a;
  } catch {
    // lampiran rusak: lewati
  }
  if (!latest) return '';
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(latest.path, 30 * 24 * 3600);
  return data?.signedUrl ?? '';
}

async function tellStaff(text: string) {
  const to = staffNumbers();
  if (to) await sendWa(to, `${text}\n\nBuka: ${SITE}/#pos`);
}

const letter = (name: string, lines: string[]) =>
  [`Halo ${name || 'Bapak/Ibu'},`, '', ...lines, '', 'Terima kasih,', SIGN].join('\n');

/** "Paket X untuk Y" atau "3 paket berikut" + daftar bernomor. */
function listed(recs: Rec[], one: (v: Values) => string, many: string, line: (v: Values) => string) {
  if (recs.length === 1) return [one(recs[0].values)];
  return [many.replace('{n}', String(recs.length)), ...recs.map((r, i) => `${i + 1}. ${line(r.values)}`)];
}

const STATUSES = [
  'Didaftarkan unit',
  'Diterima dari unit',
  'Proses pengiriman',
  'Di-pick up kurir',
  'Resi diterima',
  'Resi dikirim ke user',
];
const COURIER_STAGES = ['Proses pengiriman', 'Di-pick up kurir'];
const SENT = 'Resi dikirim ke user';
/** Field nomor WA tujuan untuk tahap itu. */
const targetKey = (stage: string) => (COURIER_STAGES.includes(stage) ? 'kontakKurir' : 'kontak');
const nameOf = (v: Values, stage: string) => (COURIER_STAGES.includes(stage) ? v.kurir : v.pengirim);

/** Pesan untuk pemohon atau kurir untuk beberapa paket di tahap itu; kosong bila tahap ini tidak dikabari. */
function message(recs: Rec[], stage: string): string | null {
  const name = nameOf(recs[0].values, stage);
  switch (stage) {
    case 'Didaftarkan unit':
      return letter(name, [
        ...listed(
          recs,
          (v) => `Permohonan pengiriman ${paketOf(v)} ke ${v.tujuan || 'tujuan'} sudah kami catat.`,
          'Permohonan pengiriman {n} paket berikut sudah kami catat:',
          (v) => `${isiOf(v)} ke ${v.tujuan}`,
        ),
        '',
        'Silakan serahkan paketnya ke Unit Dokumen. Kami akan menginformasikan lagi setelah paket diterima.',
      ]);
    case 'Diterima dari unit':
      return letter(name, [
        ...listed(
          recs,
          (v) => `${PaketOf(v)} untuk ${v.tujuan || 'tujuan'} sudah kami terima dan akan segera dikirim lewat Kantor Pos.`,
          '{n} paket berikut sudah kami terima dan akan segera dikirim lewat Kantor Pos:',
          (v) => `${isiOf(v)} ke ${v.tujuan}`,
        ),
        '',
        'Kami akan menginformasikan nomor resinya setelah paket dikirim.',
      ]);
    case 'Proses pengiriman':
      return letter(name, [
        recs.length === 1
          ? 'Ada paket dari Unit Dokumen Balai Yasa Lahat yang siap di-pick up:'
          : `Ada ${recs.length} paket dari Unit Dokumen Balai Yasa Lahat yang siap di-pick up:`,
        ...recs.flatMap((r, i) => {
          const v = r.values;
          const head = recs.length === 1 ? '' : `${i + 1}. `;
          return [
            ...(recs.length > 1 && i > 0 ? [''] : []),
            `${head}Isi: ${v.isi || '–'}`,
            `${recs.length === 1 ? '' : '   '}Tujuan: ${v.tujuan || '–'}`,
            ...(v.alamat ? [`${recs.length === 1 ? '' : '   '}Alamat: ${v.alamat.replace(/\n+/g, ', ')}`] : []),
          ];
        }),
        '',
        `Setelah ${recs.length === 1 ? 'paket' : 'semua paket'} diambil, tekan tautan ini untuk konfirmasi. Tautan yang sama dipakai untuk mengirim nomor resi:`,
        linkOf(recs),
      ]);
    case 'Di-pick up kurir':
      return letter(name, [
        recs.length === 1
          ? `Terima kasih, paket untuk ${recs[0].values.tujuan || 'tujuan'} sudah tercatat diambil.`
          : `Terima kasih, ${recs.length} paket sudah tercatat diambil.`,
        'Setelah dikirim di Kantor Pos, isi nomor resinya (dan foto resi bila ada) lewat tautan ini:',
        linkOf(recs),
      ]);
    case 'Resi dikirim ke user':
      return letter(name, [
        ...(recs.length === 1
          ? [
              `${PaketOf(recs[0].values)} untuk ${recs[0].values.tujuan || 'tujuan'} sudah dikirim lewat Kantor Pos.`,
              `Nomor resi: *${recs[0].values.resi || '–'}*`,
            ]
          : [
              `${recs.length} paket berikut sudah dikirim lewat Kantor Pos:`,
              ...recs.map((r, i) => `${i + 1}. ${isiOf(r.values)} ke ${r.values.tujuan}, resi *${r.values.resi || '–'}*`),
            ]),
        '',
        'Status pengiriman bisa dicek di https://www.posindonesia.co.id/id/tracking',
      ]);
    default:
      return null;
  }
}

/** Kirim WA untuk paket-paket di tahap itu, digabung per nomor tujuan. */
async function notify(recs: Rec[], stage: string) {
  const groups = new Map<string, Rec[]>();
  for (const r of recs) {
    const target = waNumber(r.values[targetKey(stage)]);
    if (target) groups.set(target, [...(groups.get(target) ?? []), r]);
  }
  if (!groups.size)
    return { error: COURIER_STAGES.includes(stage) ? 'Nomor WA kurir belum diisi' : 'Nomor WA pemohon belum diisi' };
  const sent: string[] = [];
  const sentIds: string[] = [];
  let failure = '';
  for (const [target, list] of groups) {
    let text = message(list, stage);
    if (!text) return { error: 'Tahap ini tidak dikabari lewat WA' };
    // Resi untuk pemohon: tautan foto resi tiap paket ikut di teks (pasti sampai), lalu fotonya
    // dikirim sebagai gambar terpisah bila paket Fonnte mendukung lampiran.
    const photos =
      stage === SENT
        ? (await Promise.all(list.map(async (r) => ({ r, url: await resiPhoto(r) })))).filter((x) => x.url)
        : [];
    if (photos.length)
      text += `\n\nFoto resi:\n${photos
        .map((x) => (list.length > 1 ? `${list.indexOf(x.r) + 1}. ${x.url}` : x.url))
        .join('\n')}`;
    const fail = await sendWa(target, text);
    if (fail) failure = fail;
    else {
      sent.push(target);
      sentIds.push(...list.map((r) => r.id));
      for (const x of photos)
        await sendWa(target, `Foto resi ${x.r.values.tujuan || ''}: ${x.r.values.resi || ''}`.trim(), x.url);
    }
  }
  return sent.length ? { target: sent.join(','), sentIds, failed: failure || undefined } : { error: failure };
}

/** Paket-paket dari tautan kurir: `items` [{id, token}] (atau satu id dan token). */
async function byTokens(input: { items?: unknown; id?: unknown; token?: unknown }) {
  const raw = Array.isArray(input.items) ? input.items : [{ id: input.id, token: input.token }];
  const want = raw
    .slice(0, MAX_PAKET)
    .map((x: { id?: unknown; token?: unknown }) => ({ id: clean(x?.id, 40), token: clean(x?.token, 64) }))
    .filter((x) => x.id && x.token);
  if (!want.length) return [];
  const { data } = await admin
    .from('records')
    .select('id, module, status, values, history')
    .in(
      'id',
      want.map((x) => x.id),
    );
  const found = (data ?? []) as Rec[];
  return want
    .map((w) => found.find((r) => r.id === w.id && r.module === 'pos' && r.values.token && r.values.token === w.token))
    .filter((r): r is Rec => !!r);
}

// Yang boleh dilihat kurir: tidak ada nomor WA pemohon.
const courierView = (r: Rec) => ({
  id: r.id,
  status: r.status,
  unit: unitOf(r.values),
  pengirim: r.values.pengirim,
  tujuan: r.values.tujuan,
  alamat: r.values.alamat,
  isi: r.values.isi,
  kurir: r.values.kurir,
  resi: r.values.resi,
  biaya: r.values.biaya,
  history: r.history.map((h) => ({ status: h.status, at: h.at })),
});

async function save(r: Rec, status: string, values: Values, by: string) {
  const at = new Date().toISOString();
  const history = status === r.status ? r.history : [...r.history, { status, at, by }];
  const { error } = await admin.from('records').update({ status, values, history }).eq('id', r.id);
  if (error) throw error;
  return { ...r, status, values, history };
}

async function uploadFoto(id: string, foto: { data?: unknown; type?: unknown }, by: string) {
  const type = String(foto.type ?? '');
  if (!/^image\/(jpeg|png|webp)$/.test(type)) return null;
  const bytes = Uint8Array.from(atob(String(foto.data ?? '')), (c) => c.charCodeAt(0));
  if (!bytes.length || bytes.length > MAX_FOTO) return null;
  const ext = type.split('/')[1].replace('jpeg', 'jpg');
  const path = `pos/${id}/resi-${Date.now()}.${ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: type });
  if (error) throw error;
  return { path, name: `Foto resi.${ext}`, type, size: bytes.length, at: new Date().toISOString(), by };
}

function withAttachment(v: Values, att: unknown) {
  let list: unknown[] = [];
  try {
    list = JSON.parse(v.lampiran || '[]');
  } catch {
    list = [];
  }
  return JSON.stringify([...(Array.isArray(list) ? list : []), att]);
}

const PICKUP_FROM = ['Proses pengiriman'];
// Resi yang sudah terkirim ke pemohon pun masih bisa diperbaiki kurir; pemohon dikirimi yang baru.
const RESI_FROM = ['Proses pengiriman', 'Di-pick up kurir', 'Resi diterima', 'Resi dikirim ke user'];
const kurirOf = (recs: Rec[]) => recs.find((r) => r.values.kurir)?.values.kurir || 'Kurir';
const lines = (recs: Rec[], line: (v: Values) => string) =>
  recs.length === 1 ? [line(recs[0].values)] : recs.map((r, i) => `${i + 1}. ${line(r.values)}`);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung' }, 405);
  const input = await req.json().catch(() => ({}));

  try {
    switch (input.action) {
      case 'ajukan': {
        // Kolom jebakan: diisi berarti bot.
        if (input.website) return json({ ok: true, count: 0 });
        const f = input.form ?? {};
        const common: Values = {
          tanggal: new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10),
          unit: UNITS.includes(f.unit) ? f.unit : '',
          unitLainnya: f.unit === 'Lainnya' ? clean(f.unitLainnya, 80) : '',
          pengirim: clean(f.pengirim, 80),
          kontak: clean(f.kontak, 30),
          catatan: clean(f.catatan, 500),
          sumber: 'Formulir online',
        };
        if (!common.unit || !common.pengirim) return json({ error: 'Unit dan nama pemohon wajib diisi' }, 400);
        if (common.unit === 'Lainnya' && !common.unitLainnya) return json({ error: 'Tulis nama unitnya' }, 400);
        if (!waNumber(common.kontak)) return json({ error: 'Nomor WA tidak valid' }, 400);
        // Beberapa paket sekaligus; formulir lama mengirim satu paket di dalam `form`.
        const list = (Array.isArray(input.paket) ? input.paket : [f]).slice(0, MAX_PAKET);
        const items = list.map((p: Record<string, unknown>) => ({
          tujuan: clean(p?.tujuan, 160),
          alamat: cleanLines(p?.alamat),
          isi: clean(p?.isi, 160),
        }));
        if (!items.length) return json({ error: 'Tambahkan minimal satu paket' }, 400);
        const bad = items.findIndex((p) => !p.tujuan || !p.alamat);
        if (bad >= 0)
          return json({ error: items.length > 1 ? `Lengkapi penerima dan alamat paket nomor ${bad + 1}` : 'Penerima dan alamat tujuan wajib diisi' }, 400);

        const at = new Date().toISOString();
        const rows = items.map((p) => {
          const v: Values = { ...common, ...p, token: newToken() };
          for (const k of Object.keys(v)) if (!v[k]) delete v[k];
          return { module: 'pos', status: 'Didaftarkan unit', values: v, history: [{ status: 'Didaftarkan unit', at, by: common.pengirim }] };
        });
        const { data, error } = await admin.from('records').insert(rows).select('id, module, status, values, history');
        if (error) throw error;
        const recs = (data ?? []) as Rec[];
        await notify(recs, 'Didaftarkan unit');
        await tellStaff(
          [
            recs.length > 1 ? `${recs.length} permohonan kirim paket baru` : 'Permohonan kirim paket baru',
            `${common.pengirim} (${unitOf(common)}), ${common.kontak}`,
            ...lines(recs, (v) => `${v.isi || 'Paket'} ke ${v.tujuan}`),
          ].join('\n'),
        );
        return json({ ok: true, count: recs.length });
      }

      case 'lihat': {
        const recs = await byTokens(input);
        return recs.length ? json({ ok: true, paket: recs.map(courierView) }) : json({ error: 'Tautan tidak valid' }, 404);
      }

      case 'pickup': {
        const recs = await byTokens(input);
        if (!recs.length) return json({ error: 'Tautan tidak valid' }, 404);
        const ready = recs.filter((r) => PICKUP_FROM.includes(r.status));
        if (!ready.length) {
          const view = recs.map(courierView);
          return recs.some((r) => r.status === 'Di-pick up kurir')
            ? json({ ok: true, paket: view })
            : json({ error: `Belum bisa: paket masih di tahap "${recs[0].status}"`, paket: view }, 409);
        }
        const moved = await Promise.all(ready.map((r) => save(r, 'Di-pick up kurir', r.values, r.values.kurir || 'Kurir')));
        await notify(moved, 'Di-pick up kurir');
        await tellStaff(
          [
            `${moved.length > 1 ? `${moved.length} paket` : 'Paket'} sudah di-pick up ${kurirOf(moved)}:`,
            ...lines(moved, (v) => `${v.isi || 'Paket'} ke ${v.tujuan}`),
          ].join('\n'),
        );
        const after = recs.map((r) => moved.find((m) => m.id === r.id) ?? r);
        return json({ ok: true, paket: after.map(courierView) });
      }

      case 'resi': {
        const recs = await byTokens(input);
        if (!recs.length) return json({ error: 'Tautan tidak valid' }, 404);
        // Nomor resi per paket: items [{id, token, resi, biaya}], atau satu resi untuk satu paket.
        const raw: Record<string, unknown>[] = Array.isArray(input.items) ? input.items : [input];
        const entries = recs
          .map((r) => {
            const x = raw.find((i) => clean(i?.id, 40) === r.id) ?? {};
            return {
              r,
              resi: clean(x.resi, 60),
              biaya: clean(x.biaya, 20).replace(/\D/g, ''),
              foto: x.foto as { data?: unknown; type?: unknown } | undefined,
            };
          })
          .filter((e) => e.resi);
        if (!entries.length) return json({ error: 'Nomor resi wajib diisi' }, 400);
        const blocked = entries.find((e) => !RESI_FROM.includes(e.r.status));
        if (blocked)
          return json({ error: `Belum bisa: paket masih di tahap "${blocked.r.status}"`, paket: recs.map(courierView) }, 409);
        const by = kurirOf(recs);
        // Foto resi per paket (items[].foto). Satu foto di luar items (formulir lama) berlaku untuk semua.
        const shared = input.foto ? await uploadFoto(entries[0].r.id, input.foto, by) : null;
        if (input.foto && !shared) return json({ error: 'Foto resi harus gambar JPG/PNG di bawah 4 MB' }, 400);
        const atts = new Map<string, unknown>();
        for (const e of entries)
          if (e.foto) {
            const att = await uploadFoto(e.r.id, e.foto, by);
            if (!att) return json({ error: `Foto resi ${e.r.values.tujuan || ''} harus gambar JPG/PNG di bawah 4 MB` }, 400);
            atts.set(e.r.id, att);
          }
        const withFoto = atts.size > 0 || !!shared;
        const fixed = entries.every((e) => STATUSES.indexOf(e.r.status) >= STATUSES.indexOf('Resi diterima'));
        const saved = await Promise.all(
          entries.map((e) => {
            const values: Values = { ...e.r.values, resi: e.resi };
            if (e.biaya) values.biaya = e.biaya;
            const att = atts.get(e.r.id) ?? shared;
            if (att) values.lampiran = withAttachment(values, att);
            return save(e.r, 'Resi diterima', values, by);
          }),
        );
        // Resi dan fotonya langsung diteruskan ke pemohon (digabung per nomor), lalu tahapnya
        // menjadi "Resi dikirim ke user". Yang gagal terkirim tetap di "Resi diterima" untuk staf.
        const out = await notify(saved, SENT);
        const ok = new Set('sentIds' in out ? out.sentIds : []);
        const moved = await Promise.all(saved.map((r) => (ok.has(r.id) ? save(r, SENT, r.values, 'sistem') : r)));
        const failed = moved.filter((r) => !ok.has(r.id));
        await tellStaff(
          [
            fixed ? 'Nomor resi diperbarui kurir' : `Resi ${moved.length > 1 ? `${moved.length} paket ` : ''}sudah dikirim ${by}:`,
            ...lines(
              moved,
              (v) =>
                `${v.isi || 'Paket'} ke ${v.tujuan}: ${v.resi}${v.biaya ? ` (Rp${Number(v.biaya).toLocaleString('id-ID')})` : ''}`,
            ),
            '',
            failed.length
              ? `Belum terkirim ke pemohon (${'error' in out ? out.error : out.failed}). Kirim dari dashboard dengan memindah ke tahap "${SENT}".`
              : `Resi${withFoto ? ' dan fotonya' : ''} sudah diteruskan ke pemohon lewat WA.`,
          ].join('\n'),
        );
        const after = recs.map((r) => moved.find((m) => m.id === r.id) ?? r);
        return json({ ok: true, paket: after.map(courierView) });
      }

      case 'kabari': {
        const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
          global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
        });
        const { data: user } = await db.auth.getUser();
        if (!user?.user) return json({ error: 'Harus masuk terlebih dahulu' }, 401);
        // Beberapa id sekaligus; paket dengan nomor tujuan yang sama digabung jadi satu pesan.
        const ids: string[] = (Array.isArray(input.ids) ? input.ids : input.id ? [input.id] : [])
          .filter((x: unknown) => typeof x === 'string')
          .slice(0, 50);
        if (!ids.length) return json({ error: 'id kosong' }, 400);
        const { data } = await db.from('records').select('id, module, status, values, history').in('id', ids);
        const found = ((data ?? []) as Rec[]).filter((r) => r.module === 'pos');
        if (!found.length) return json({ error: 'Data tidak ditemukan' }, 404);
        found.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
        const stage = typeof input.stage === 'string' ? input.stage : found[0].status;
        // Hanya paket yang memang sudah sampai (atau melewati) tahap itu.
        const recs = found.filter((r) => STATUSES.indexOf(r.status) >= STATUSES.indexOf(stage));
        if (!recs.length) return json({ error: 'Belum ada paket yang perlu dikabari' }, 409);
        // Data yang dicatat staf langsung di dashboard belum punya token: buatkan agar tautan kurir jalan.
        for (const r of recs)
          if (!r.values.token) {
            r.values = { ...r.values, token: newToken() };
            await admin.from('records').update({ values: r.values }).eq('id', r.id);
          }
        const out = await notify(recs, stage);
        return 'error' in out ? json({ error: out.error }, 502) : json({ ok: true, target: out.target, failed: out.failed });
      }

      default:
        return json({ error: 'Aksi tidak dikenal' }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: 'Terjadi kesalahan di server' }, 500);
  }
});
