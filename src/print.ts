// Dokumen cetak: tanda terima untuk semua menu, lembar disposisi untuk surat masuk.
import QRCode from 'qrcode';
import { OTHER, SIFAT_SURAT, UNITS, type ModuleDef } from './modules';
import type { DocRecord } from './backend';
import { fmtDate, shown } from './util';
import { siteTrackUrl, trackCode } from './track';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const STYLE = `
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 11pt/1.45 -apple-system, 'Segoe UI', Arial, sans-serif; color: #111; margin: 0; }
  .doc { max-width: 178mm; margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 18px; }
  header b { font-size: 13pt; display: block; }
  header span { font-size: 9.5pt; color: #444; }
  h1 { font-size: 15pt; text-align: center; margin: 4px 0 2px; letter-spacing: .04em; text-transform: uppercase; }
  .sub { text-align: center; color: #444; font-size: 10pt; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  .data td { padding: 6px 8px; border: 1px solid #999; vertical-align: top; }
  .data td:first-child { width: 34%; background: #f3f3f3; font-weight: 600; }
  .sign { margin-top: 28px; }
  .sign td { width: 50%; text-align: center; padding: 0 10px; vertical-align: top; }
  .sign .line { margin-top: 64px; border-top: 1px solid #111; padding-top: 4px; }
  .grid td { border: 1px solid #999; padding: 7px 8px; vertical-align: top; }
  .box { display: inline-block; width: 11px; height: 11px; border: 1px solid #111; margin-right: 6px; vertical-align: -1px; }
  .box.on { background: #111; }
  .lines div { border-bottom: 1px dotted #777; height: 26px; }
  .foot { margin-top: 22px; font-size: 8.5pt; color: #666; }
  .lacak { display: flex; align-items: center; gap: 14px; margin-top: 26px; padding: 10px 14px 10px 10px; border: 1px solid #999; border-radius: 6px; break-inside: avoid; }
  .lacak svg { width: 25mm; height: 25mm; display: block; flex: none; }
  .lacak b { display: block; font-size: 11pt; margin-bottom: 2px; }
  .lacak span { display: block; font-size: 9.5pt; color: #444; }
  .lacak .code { display: inline; font: 600 12pt/1.3 ui-monospace, 'SF Mono', Menlo, Consolas, monospace; letter-spacing: .08em; color: #111; }
  .isi { white-space: pre-line; min-height: 120px; margin-top: 4px; }
  .opt { display: inline-block; white-space: nowrap; margin-right: 14px; }
  @media screen { body { background: #eee; padding: 24px; } .doc { background: #fff; padding: 18mm 16mm; box-shadow: 0 2px 12px rgba(0,0,0,.15); } }
`;

function page(title: string, body: string) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head>
<body><div class="doc">
<header><div><b>UNIT DOKUMEN</b><span>Balai Yasa Lahat</span></div><span>Dicetak ${esc(new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }))}</span></header>
${body}
</div><script>window.onload = () => setTimeout(() => window.print(), 250);</script></body></html>`;
}

function open(html: string) {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Jendela cetak diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/** Pihak yang menyerahkan dan menerima pada tanda terima, sesuai menu. */
function parties(mod: ModuleDef, r: DocRecord): [string, string] {
  const v = r.values;
  switch (mod.id) {
    case 'evp':
      return [`Unit ${shown(mod.fields.find((f) => f.key === 'unit')!, v) || '…'}${v.pic ? ` (${v.pic})` : ''}`, 'Unit Dokumen'];
    case 'surat': {
      const to = shown(mod.fields.find((f) => f.key === (v.disposisiKepada ? 'disposisiKepada' : 'tujuan'))!, v);
      return ['Unit Dokumen', `${to || '…'}${v.penerima ? ` (${v.penerima})` : ''}`];
    }
    case 'keluar':
      return ['Unit Dokumen', `${v.tujuan || '…'}${v.penerima ? ` (${v.penerima})` : ''}`];
    case 'pos':
      return [`${v.pengirim || '…'} (Unit ${shown(mod.fields.find((f) => f.key === 'unit')!, v) || '…'})`, 'Unit Dokumen'];
    case 'arsip':
      return [`Unit ${shown(mod.fields.find((f) => f.key === 'unit')!, v) || '…'}`, 'Unit Dokumen (Depo Arsip)'];
    case 'drone':
      return ['Unit Dokumen', `${v.pic || '…'} (Unit ${shown(mod.fields.find((f) => f.key === 'unit')!, v) || '…'})`];
    default:
      return ['', 'Unit Dokumen'];
  }
}

/** Kode QR sebagai SVG (dibuat langsung tanpa menunggu, agar jendela cetak tidak diblokir browser). */
function qrSvg(text: string) {
  const { size, data } = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules;
  const pad = 2;
  let d = '';
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) if (data[y * size + x]) d += `M${x + pad} ${y + pad}h1v1h-1z`;
  const n = size + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" aria-hidden="true"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/** Kotak "pantau status": QR ke halaman lacak, alamatnya, dan kode lacak. */
function trackBox(r: DocRecord) {
  const code = trackCode(r);
  const url = siteTrackUrl([code]);
  return `<div class="lacak">${qrSvg(url)}<div>
  <b>Pantau status dokumen ini</b>
  <span>Scan kode QR atau buka ${esc(url.replace(/^https?:\/\//, ''))}</span>
  <span>Kode lacak <span class="code">${esc(code)}</span></span>
</div></div>`;
}

export function printReceipt(mod: ModuleDef, r: DocRecord) {
  const rows = mod.fields
    .filter((f) => f.key !== 'tenggat' && f.type !== 'textarea' && shown(f, r.values))
    .map((f) => `<tr><td>${esc(f.label)}</td><td>${esc(f.type === 'date' ? fmtDate(r.values[f.key]) : shown(f, r.values))}</td></tr>`)
    .join('');
  const note = r.values.catatan ? `<tr><td>Catatan</td><td>${esc(r.values.catatan)}</td></tr>` : '';
  const [from, to] = parties(mod, r);
  const body = `
<h1>Tanda Terima</h1>
<div class="sub">${esc(mod.title)}</div>
<table class="data">${rows}<tr><td>Tahap saat ini</td><td>${esc(r.status)}</td></tr>${note}</table>
<table class="sign"><tr>
  <td>Yang menyerahkan,<div class="line">${esc(from)}</div></td>
  <td>Lahat, ${esc(fmtDate(new Date().toISOString()))}<br>Yang menerima,<div class="line" style="margin-top:44px">${esc(to)}</div></td>
</tr></table>
${trackBox(r)}
<p class="foot">Dokumen ini dibuat dari Dashboard Dokumen BYLT.</p>`;
  open(page(`Tanda terima – ${r.values.perihal || r.values.kegiatan || r.values.uraian || r.values.keperluan || mod.itemName}`, body));
}

/**
 * Lembar disposisi surat masuk. Bila disposisi EVP sudah dicatat, isinya ikut tercetak (tujuan,
 * isi, sifat, tanggal); bila belum, lembar dicetak kosong untuk ditulis tangan oleh EVP.
 */
export function printDisposition(mod: ModuleDef, r: DocRecord) {
  const v = r.values;
  const field = (key: string) => mod.fields.find((f) => f.key === key)!;
  const filled = !!(v.isiDisposisi?.trim() || v.disposisiKepada);
  const tujuan = shown(field('tujuan'), v);
  const kepada = filled ? shown(field('disposisiKepada'), v) : '';
  const box = (on: boolean, label: string) => `<span class="box${on ? ' on' : ''}"></span>${esc(label)}`;
  // EVP yang memberi disposisi, jadi pilihannya unit-unit saja.
  const targets = UNITS.filter((u) => u !== OTHER);
  const checks = targets.map((t) => `<div>${box(t === kepada, t)}</div>`).join('');
  const other = kepada && !targets.includes(kepada) ? `<div>${box(true, kepada)}</div>` : '<div><span class="box"></span>…………………</div>';
  const sifat = SIFAT_SURAT.map((s) => `<span class="opt">${box(s === v.sifat, s)}</span>`).join('');
  const isi = filled && v.isiDisposisi?.trim()
    ? `<div class="isi">${esc(v.isiDisposisi.trim())}</div>`
    : '<div class="lines"><div></div><div></div><div></div><div></div><div></div><div></div></div>';
  const body = `
<h1>Lembar Disposisi</h1>
<div class="sub">Surat Masuk</div>
<table class="grid">
  <tr><td style="width:50%"><b>Surat dari</b><br>${esc(v.asal || '')}</td><td><b>Diterima tanggal</b><br>${esc(fmtDate(v.tanggalTerima))}</td></tr>
  <tr><td><b>Nomor surat</b><br>${esc(v.nomorSurat || '–')}${v.tanggalSurat ? `<br><b>Tanggal surat</b><br>${esc(fmtDate(v.tanggalSurat))}` : ''}</td><td><b>Sifat</b><br>${sifat}</td></tr>
  <tr><td colspan="2"><b>Perihal</b><br>${esc(v.perihal || '')}${tujuan ? `<br><b>Tujuan (sesuai map)</b><br>${esc(tujuan)}` : ''}</td></tr>
  <tr><td><b>Diteruskan kepada</b>${checks}${other}</td><td><b>Isi disposisi</b>${isi}</td></tr>
  <tr><td><b>Tanggal penyelesaian</b><br>${esc(v.tenggat ? fmtDate(v.tenggat) : '')}</td><td><b>Tanggal disposisi</b><br>${esc(filled && v.tanggalDisposisi ? fmtDate(v.tanggalDisposisi) : '')}<br><br><b>Paraf</b><br><br><br></td></tr>
</table>
<p class="foot">Dokumen ini dibuat dari Dashboard Dokumen BYLT.</p>`;
  open(page(`Disposisi – ${v.perihal || 'surat masuk'}`, body));
}
