// Laporan bulanan siap cetak A4: dibuka di jendela baru lalu disimpan sebagai PDF lewat dialog cetak.
import interUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import { MODULES, type ModuleDef } from '../modules';
import type { DocRecord } from '../backend';
import { fmtDays } from '../stats';
import { shown } from '../util';
import { openOwnTab } from '../ownTab';
import {
  avg,
  dayKey,
  labelOf,
  monthLabel,
  monthOnly,
  onTimeRate,
  unitOf,
  type Core,
  type MonthReport,
  type Week,
} from './compute';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const cssStr = (s: string) => `"${s.replace(/["\\]/g, '\\$&')}"`;
const nf = (n: number) => n.toLocaleString('id-ID');
const date = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d + 'T00:00:00').toLocaleDateString('id-ID', o);
const dShort = (d: string) => date(d, { day: 'numeric', month: 'short' });
const dLong = (d: string) => date(d, { day: 'numeric', month: 'long', year: 'numeric' });
const rupiah = (n: number) => 'Rp ' + nf(n);
const pct = (n?: number) => (n === undefined ? '–' : `${Math.round(n)}%`);
const days = (n?: number) => (n === undefined ? '–' : fmtDays(n));
const field = (m: ModuleDef, key: string, r: DocRecord) => {
  const f = m.fields.find((x) => x.key === key);
  return f ? shown(f, r.values) : '';
};

// ---------- Perbandingan dengan bulan lalu (teks + panah, tidak hanya warna) ----------

export type Tone = 'good' | 'bad' | 'flat';
export interface Delta {
  text: string;
  tone: Tone;
  arrow: string;
}

function toneOf(up: boolean, upGood?: boolean): Tone {
  return upGood === undefined ? 'flat' : up === upGood ? 'good' : 'bad';
}

export function countDelta(now: number, before: number, prev: string, hasPrev: boolean, upGood?: boolean): Delta {
  if (!hasPrev) return { text: `Belum ada data ${prev} sebagai pembanding`, tone: 'flat', arrow: '' };
  const d = now - before;
  if (d === 0) return { text: `Sama dengan ${prev}`, tone: 'flat', arrow: '=' };
  // Persentase dari basis kecil (mis. 4 → 25) hanya membingungkan.
  const share = before >= 10 ? ` (${nf(Math.round((Math.abs(d) / before) * 100))}%)` : '';
  return { text: `${d > 0 ? 'Naik' : 'Turun'} ${nf(Math.abs(d))}${share} dari ${prev}`, tone: toneOf(d > 0, upGood), arrow: d > 0 ? '▲' : '▼' };
}

export function rateDelta(now: number | undefined, before: number | undefined, prev: string): Delta {
  if (now === undefined || before === undefined) return { text: `Belum ada pembanding dari ${prev}`, tone: 'flat', arrow: '' };
  const d = Math.round(now) - Math.round(before);
  if (d === 0) return { text: `Sama dengan ${prev}`, tone: 'flat', arrow: '=' };
  return { text: `${d > 0 ? 'Naik' : 'Turun'} ${nf(Math.abs(d))} poin dari ${prev}`, tone: toneOf(d > 0, true), arrow: d > 0 ? '▲' : '▼' };
}

export function daysDelta(now: number | undefined, before: number | undefined, prev: string): Delta {
  if (now === undefined || before === undefined) return { text: `Belum ada pembanding dari ${prev}`, tone: 'flat', arrow: '' };
  const d = now - before;
  if (Math.abs(d) < 0.05) return { text: `Sama dengan ${prev}`, tone: 'flat', arrow: '=' };
  const n = Math.abs(d).toLocaleString('id-ID', { maximumFractionDigits: 1 });
  return { text: `${n} hari lebih ${d < 0 ? 'cepat' : 'lambat'} dari ${prev}`, tone: toneOf(d > 0, false), arrow: d > 0 ? '▲' : '▼' };
}

const deltaHtml = (d: Delta) =>
  `<span class="delta ${d.tone}">${d.arrow ? `<i aria-hidden="true">${d.arrow}</i>` : ''}${esc(d.text)}</span>`;

// ---------- Grafik (SVG sebaris, satu warna, angka langsung di batang) ----------

function niceScale(max: number) {
  if (max <= 4) return { top: 4, step: 1 };
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  return { top: Math.ceil(max / step) * step, step };
}

/** Batang dengan ujung data membulat 4px dan pangkal rata di garis dasar. */
function colPath(x: number, base: number, w: number, h: number) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${base}V${base - h + r}Q${x},${base - h} ${x + r},${base - h}H${x + w - r}Q${x + w},${base - h} ${x + w},${base - h + r}V${base}Z`;
}
function rowPath(x: number, y: number, w: number, h: number) {
  if (w <= 0) return '';
  const r = Math.min(4, h / 2, w);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

function weekLabel(w: Week) {
  const a = Number(w.from.slice(8));
  const b = Number(w.to.slice(8));
  const mon = date(w.to, { month: 'short' });
  return a === b ? `${a} ${mon}` : `${a}–${b} ${mon}`;
}

function columnChart(weeks: Week[]) {
  const W = 340;
  const H = 152;
  const padL = 30;
  const padR = 6;
  const padT = 18;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const { top, step } = niceScale(Math.max(0, ...weeks.map((w) => w.value)));
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  const band = plotW / weeks.length;
  const bw = Math.min(24, band * 0.46);
  const ticks: string[] = [];
  for (let t = step; t <= top; t += step)
    ticks.push(
      `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 6}" y="${y(t) + 3}" class="axis" text-anchor="end">${nf(t)}</text>`,
    );
  const bars = weeks
    .map((w, i) => {
      const cx = padL + band * i + band / 2;
      const h = y(0) - y(w.value);
      return `<path class="bar" d="${colPath(cx - bw / 2, y(0), bw, h)}"/>
<text x="${cx}" y="${y(w.value) - 5}" class="val" text-anchor="middle">${nf(w.value)}</text>
<text x="${cx}" y="${H - 8}" class="axis" text-anchor="middle">${esc(weekLabel(w))}</text>`;
    })
    .join('');
  const label = weeks.map((w) => `${weekLabel(w)}: ${w.value}`).join(', ');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Masuk per pekan. ${esc(label)}">
${ticks.join('')}
<text x="${padL - 6}" y="${y(0) + 3}" class="axis" text-anchor="end">0</text>
${bars}
<line x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}" class="base"/>
</svg>`;
}

function barList(items: { label: string; value: number }[]) {
  const W = 300;
  const row = 21;
  const bh = 12;
  const labelW = 78;
  const valW = 30;
  const H = items.length * row + 4;
  const max = Math.max(1, ...items.map((d) => d.value));
  const scale = (W - labelW - valW) / max;
  const rows = items
    .map((d, i) => {
      const yy = 2 + i * row + (row - bh) / 2;
      const w = d.value * scale;
      return `<text x="${labelW - 8}" y="${yy + bh / 2 + 3.2}" class="lbl" text-anchor="end">${esc(d.label)}</text>
<path class="bar" d="${rowPath(labelW, yy, w, bh)}"/>
<text x="${labelW + w + 5}" y="${yy + bh / 2 + 3.2}" class="val">${nf(d.value)}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Masuk per menu. ${esc(items.map((d) => `${d.label}: ${d.value}`).join(', '))}">
<line x1="${labelW}" x2="${labelW}" y1="0" y2="${H}" class="base"/>
${rows}
</svg>`;
}

// ---------- Bagian laporan ----------

const kpi = (label: string, value: string, sub: string, d: Delta) =>
  `<div class="kpi"><span class="kpi-label">${esc(label)}</span><b class="kpi-value">${value}</b><span class="kpi-sub">${sub}</span>${deltaHtml(d)}</div>`;

const head = (no: number, title: string, sub: string) =>
  `<header class="sec-head"><span class="no">${String(no).padStart(2, '0')}</span><div><h2>${esc(title)}</h2><p>${sub}</p></div></header>`;

const empty = (text: string) => `<p class="empty">${esc(text)}</p>`;

function coreCells(c: Core) {
  const rate = onTimeRate(c);
  return `<td class="num">${nf(c.selesai)}</td>
<td class="num">${nf(c.berjalan)}</td>
<td class="num">${days(avg(c))}</td>
<td class="num">${rate === undefined ? '–' : `${pct(rate)} <small>${nf(c.onTime)}/${nf(c.onTime + c.late)}</small>`}</td>
<td class="num">${c.overdue ? `<b>${nf(c.overdue)}</b>` : '0'}</td>`;
}

function highlights(rep: MonthReport) {
  const { total, prev, period: p } = rep;
  const prevName = rep.prevLabel;
  const out: string[] = [];
  const delta =
    rep.hasPrev && prev.masuk
      ? total.masuk === prev.masuk
        ? `, sama dengan ${prevName}`
        : `, ${total.masuk > prev.masuk ? 'naik' : 'turun'} ${nf(Math.round((Math.abs(total.masuk - prev.masuk) / prev.masuk) * 100))}% dibanding ${prevName}`
      : '';
  out.push(`<b>${nf(total.masuk)}</b> pekerjaan baru masuk di tujuh menu${delta}.`);
  const busiest = [...rep.mods].sort((a, b) => b.c.masuk - a.c.masuk)[0];
  if (busiest && busiest.c.masuk && total.masuk)
    out.push(
      `Menu tersibuk adalah <b>${esc(busiest.m.menu)}</b> dengan ${nf(busiest.c.masuk)} data, atau ${nf(Math.round((busiest.c.masuk / total.masuk) * 100))}% dari seluruh pekerjaan masuk.`,
    );
  const rate = onTimeRate(total);
  const a = avg(total);
  if (total.selesai)
    out.push(
      `<b>${nf(total.selesai)}</b> pekerjaan diselesaikan${rate !== undefined ? `, <b>${pct(rate)}</b> di antaranya tepat waktu` : ''}${a !== undefined ? `, rata-rata ${esc(fmtDays(a))} dari dicatat sampai tuntas` : ''}.`,
    );
  const asOf = p.current ? 'hari ini' : `akhir ${monthOnly(p.month)}`;
  if (total.overdue) {
    const worst = [...rep.mods].sort((x, y) => y.c.overdue - x.c.overdue)[0];
    out.push(
      `<b>${nf(total.overdue)}</b> pekerjaan masih melewati tenggat pada ${asOf}; terbanyak di ${esc(worst.m.menu)} (${nf(worst.c.overdue)}).`,
    );
  } else if (total.berjalan) out.push(`Tidak ada pekerjaan yang melewati tenggat pada ${asOf}.`);
  const unit = [...rep.evpUnits].sort((x, y) => y.c.masuk - x.c.masuk)[0];
  if (unit?.c.masuk) {
    const waiting = rep.evpStages.find((s) => s.status === 'Diserahkan ke EVP');
    out.push(
      `Dokumen TTD EVP paling banyak datang dari unit <b>${esc(unit.unit)}</b> (${nf(unit.c.masuk)} dokumen)${waiting ? `; ${nf(waiting.count)} dokumen masih menunggu tanda tangan EVP` : ''}.`,
    );
  }
  return `<ul class="highlights">${out.map((x) => `<li>${x}</li>`).join('')}</ul>`;
}

function summary(rep: MonthReport) {
  const { total, prev, hasPrev } = rep;
  const prevName = rep.prevLabel;
  const rate = onTimeRate(total);
  const tiles = [
    kpi('Masuk', nf(total.masuk), 'pekerjaan baru di semua menu', countDelta(total.masuk, prev.masuk, prevName, hasPrev)),
    kpi('Selesai', nf(total.selesai), 'mencapai tahap terakhir', countDelta(total.selesai, prev.selesai, prevName, hasPrev, true)),
    kpi(
      'Masih berjalan',
      nf(total.berjalan),
      rep.period.current ? 'posisi saat laporan dibuat' : 'posisi akhir periode',
      countDelta(total.berjalan, prev.berjalan, prevName, hasPrev, false),
    ),
    kpi(
      'Rata-rata selesai',
      esc(days(avg(total))),
      'dari dicatat sampai tuntas',
      daysDelta(avg(total), avg(prev), prevName),
    ),
    kpi(
      'Tepat waktu',
      pct(rate),
      rate === undefined ? 'belum ada yang bisa dinilai' : `${nf(total.onTime)} dari ${nf(total.onTime + total.late)} selesai sesuai tenggat`,
      rateDelta(rate, onTimeRate(prev), prevName),
    ),
    kpi(
      'Lewat tenggat',
      nf(total.overdue),
      total.late ? `belum selesai; ${nf(total.late)} lainnya selesai terlambat` : 'pekerjaan berjalan yang terlambat',
      countDelta(total.overdue, prev.overdue, prevName, hasPrev, false),
    ),
  ];
  const perMenu = rep.mods.map(({ m, c }) => ({ label: m.menu, value: c.masuk })).sort((a, b) => b.value - a.value);
  return `<section class="sec first">
${head(
  1,
  'Ringkasan eksekutif',
  rep.period.current
    ? `Angka utama ${esc(monthLabel(rep.period.month))} sampai hari ini, dibanding ${esc(rep.prevLabel)} ${esc(rep.prevMonth.slice(0, 4))}.`
    : `Angka utama ${esc(monthLabel(rep.period.month))} dibanding ${esc(monthLabel(rep.prevMonth))}.`,
)}
<div class="kpis">${tiles.join('')}</div>
${rep.empty ? empty('Belum ada data pada bulan ini. Laporan tetap dibuat dengan angka nol sebagai catatan.') : `<div class="box"><h3>Sorotan</h3>${highlights(rep)}</div>`}
<div class="charts">
  <figure class="chart">
    <figcaption><b>Masuk per pekan</b><span>Jumlah data baru menurut tanggal utama, pekan Senin–Minggu</span></figcaption>
    ${total.masuk ? columnChart(rep.weeks) : empty('Belum ada data masuk.')}
  </figure>
  <figure class="chart">
    <figcaption><b>Masuk per menu</b><span>Jumlah data baru di tiap menu</span></figcaption>
    ${total.masuk ? barList(perMenu) : empty('Belum ada data masuk.')}
  </figure>
</div>
</section>`;
}

function perModule(rep: MonthReport) {
  const prevShort = rep.prevShort;
  const rows = rep.mods
    .map(({ m, c, prev }) => {
      const d = c.masuk - prev.masuk;
      const vs = !rep.hasPrev ? '–' : d === 0 ? '0' : `${d > 0 ? '+' : '−'}${nf(Math.abs(d))}`;
      return `<tr><th scope="row">${esc(m.menu)}${m.title !== m.menu ? `<small>${esc(m.title)}</small>` : ''}</th><td class="num">${nf(c.masuk)}</td><td class="num muted">${vs}</td>${coreCells(c)}</tr>`;
    })
    .join('');
  const t = rep.total;
  const dt = t.masuk - rep.prev.masuk;
  const totalVs = !rep.hasPrev ? '–' : dt === 0 ? '0' : `${dt > 0 ? '+' : '−'}${nf(Math.abs(dt))}`;
  return `<section class="sec page-start">
${head(2, 'Kinerja per menu', `Masuk dan selesai dalam ${esc(monthLabel(rep.period.month))}; berjalan dan lewat tenggat pada ${rep.period.current ? 'saat laporan dibuat' : 'akhir periode'}.`)}
<table class="tbl">
<thead><tr><th>Menu</th><th class="num">Masuk</th><th class="num">vs ${esc(prevShort)}</th><th class="num">Selesai</th><th class="num">Berjalan</th><th class="num">Rata-rata selesai</th><th class="num">Tepat waktu</th><th class="num">Lewat tenggat</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><th scope="row">Total</th><td class="num">${nf(t.masuk)}</td><td class="num muted">${totalVs}</td>${coreCells(t)}</tr></tfoot>
</table>
</section>`;
}

function evpSection(rep: MonthReport) {
  const evp = rep.mods.find((x) => x.m.id === 'evp')!;
  const units = rep.evpUnits
    .map(({ unit, c }) => `<tr><th scope="row">${esc(unit)}</th><td class="num">${nf(c.masuk)}</td>${coreCells(c)}</tr>`)
    .join('');
  const jenisTotal = rep.evpJenis.reduce((n, j) => n + j.value, 0);
  const jenis = rep.evpJenis
    .map(
      (j) =>
        `<tr><th scope="row">${esc(j.label)}</th><td class="num">${nf(j.value)}</td><td class="share"><span class="meter"><i style="width:${(j.value / jenisTotal) * 100}%"></i></span>${nf(Math.round((j.value / jenisTotal) * 100))}%</td></tr>`,
    )
    .join('');
  const stages = rep.evpStages.map((s) => `<span>${esc(s.status)} <b>${nf(s.count)}</b></span>`).join('');
  return `<section class="sec">
${head(3, 'TTD EVP per unit', `Dokumen fisik yang butuh tanda tangan EVP, menurut unit asal.`)}
${
  units
    ? `<table class="tbl">
<thead><tr><th>Unit</th><th class="num">Masuk</th><th class="num">Selesai</th><th class="num">Berjalan</th><th class="num">Rata-rata selesai</th><th class="num">Tepat waktu</th><th class="num">Lewat tenggat</th></tr></thead>
<tbody>${units}</tbody>
<tfoot><tr><th scope="row">Total</th><td class="num">${nf(evp.c.masuk)}</td>${coreCells(evp.c)}</tr></tfoot>
</table>`
    : empty('Tidak ada dokumen TTD EVP pada periode ini.')
}
${stages ? `<p class="facts"><span class="facts-head">Posisi dokumen yang masih berjalan</span>${stages}</p>` : ''}
${
  jenis
    ? `<div class="keep"><h3 class="sub-title">Jenis dokumen masuk</h3>
<table class="tbl compact jenis"><thead><tr><th>Jenis</th><th class="num">Jumlah</th><th>Porsi</th></tr></thead><tbody>${jenis}</tbody></table></div>`
    : ''
}
</section>`;
}

const LATE_LIMIT = 60;

function lateSection(rep: MonthReport) {
  const list = rep.late.slice(0, LATE_LIMIT);
  const rows = list
    .map(({ m, r, due, days: d, doneDay, status }) => {
      const nomor = r.values.nomor || r.values.nomorSurat || r.values.resi || '';
      return `<tr>
<td>${esc(m.menu)}</td>
<td class="wrap">${esc(labelOf(r.values) || m.itemName)}${nomor ? `<small>${esc(nomor)}</small>` : ''}</td>
<td>${esc(unitOf(m, r) || '–')}</td>
<td class="nowrap">${esc(dShort(due))}</td>
<td>${doneDay ? `<span class="tag">Selesai ${esc(dShort(doneDay))}</span>` : `<span class="tag open">Belum selesai</span><small>${esc(status)}</small>`}</td>
<td class="num"><b>${nf(d)}</b> hari</td>
</tr>`;
    })
    .join('');
  const open = rep.late.filter((x) => !x.doneDay).length;
  const done = rep.late.length - open;
  return `<section class="sec">
${head(4, 'Lewat tenggat & selesai terlambat', `${nf(open)} belum selesai melewati tenggat dan ${nf(done)} selesai setelah tenggat. Urut dari yang paling lama.`)}
${
  rows
    ? `<table class="tbl">
<thead><tr><th>Menu</th><th>Dokumen</th><th>Unit</th><th>Tenggat</th><th>Keterangan</th><th class="num">Terlambat</th></tr></thead>
<tbody>${rows}</tbody></table>
${rep.late.length > LATE_LIMIT ? `<p class="note">Ditampilkan ${LATE_LIMIT} dari ${nf(rep.late.length)} data. Daftar lengkap ada di dashboard.</p>` : ''}`
    : empty('Tidak ada pekerjaan yang lewat tenggat atau selesai terlambat. Semua sesuai jadwal.')
}
</section>`;
}

function posSection(rep: MonthReport) {
  const pos = MODULES.find((m) => m.id === 'pos')!;
  const { rows, sent, resi, cost } = rep.pos;
  const body = rows
    .map(
      (r) => `<tr>
<td class="nowrap">${esc(dShort(r.values.tanggal))}</td>
<td>${esc(r.values.pengirim || '–')}<small>${esc(field(pos, 'unit', r) || '')}</small></td>
<td class="wrap">${esc(r.values.tujuan || '–')}${r.values.isi ? `<small>${esc(r.values.isi)}</small>` : ''}</td>
<td>${esc(r.values.kurir || '–')}</td>
<td>${esc(r.values.resi || '–')}</td>
<td class="num">${Number(r.values.biaya?.replace(/[^\d]/g, '')) ? esc(rupiah(Number(r.values.biaya.replace(/[^\d]/g, '')))) : '–'}</td>
<td>${esc(r.status)}</td>
</tr>`,
    )
    .join('');
  return `<section class="sec">
${head(5, 'Kantor Pos', 'Paket dari unit yang dikirim lewat Kantor Pos, menurut tanggal diterima dari unit.')}
<div class="stat-row">
  <div><b>${nf(rows.length)}</b><span>paket diterima dari unit</span></div>
  <div><b>${nf(sent)}</b><span>sudah diambil kurir</span></div>
  <div><b>${nf(resi)}</b><span>resi diteruskan ke pemohon</span></div>
  <div><b>${cost ? esc(rupiah(cost)) : '–'}</b><span>total biaya tercatat</span></div>
</div>
${
  body
    ? `<table class="tbl compact"><thead><tr><th>Tanggal</th><th>Pemohon</th><th>Tujuan</th><th>Kurir</th><th>Resi</th><th class="num">Biaya</th><th>Tahap</th></tr></thead><tbody>${body}</tbody></table>`
    : empty('Tidak ada paket pada periode ini.')
}
</section>`;
}

function mediaSection(rep: MonthReport) {
  const media = MODULES.find((m) => m.id === 'multimedia')!;
  const { rows, covered, archived } = rep.media;
  const body = rows
    .map(
      (r) => `<tr>
<td class="nowrap">${esc(dShort(r.values.tanggal))}</td>
<td class="wrap">${esc(r.values.kegiatan || '–')}</td>
<td>${esc(r.values.lokasi || '–')}</td>
<td>${esc(field(media, 'jenis', r) || '–')}</td>
<td>${esc(r.values.petugas || '–')}</td>
<td>${esc(r.status)}</td>
</tr>`,
    )
    .join('');
  return `<section class="sec">
${head(6, 'Multimedia', 'Kegiatan Balai Yasa Lahat yang didokumentasikan Unit Dokumen.')}
<div class="stat-row three">
  <div><b>${nf(rows.length)}</b><span>kegiatan pada bulan ini</span></div>
  <div><b>${nf(covered)}</b><span>sudah diliput</span></div>
  <div><b>${nf(archived)}</b><span>selesai dan diarsipkan</span></div>
</div>
${
  body
    ? `<table class="tbl compact"><thead><tr><th>Tanggal</th><th>Kegiatan</th><th>Lokasi</th><th>Jenis</th><th>Petugas</th><th>Tahap</th></tr></thead><tbody>${body}</tbody></table>`
    : empty('Tidak ada kegiatan yang didokumentasikan pada periode ini.')
}
</section>`;
}

function otherSection(rep: MonthReport) {
  const { arsip, drone } = rep;
  return `<section class="sec keep">
${head(7, 'Arsip & peminjaman drone', 'Layanan pendukung Unit Dokumen pada periode ini.')}
<div class="panels">
  <div class="panel"><h3>Arsip & depo arsip</h3>
    <div class="stat-row three"><div><b>${nf(arsip.masuk)}</b><span>penyerahan arsip</span></div><div><b>${nf(arsip.boxes)}</b><span>boks arsip</span></div><div><b>${nf(arsip.stored)}</b><span>sudah disimpan di depo</span></div></div>
  </div>
  <div class="panel"><h3>Peminjaman drone</h3>
    <div class="stat-row three"><div><b>${nf(drone.masuk)}</b><span>peminjaman dari ${nf(drone.units)} unit</span></div><div><b>${nf(drone.returned)}</b><span>sudah dikembalikan</span></div><div><b>${nf(drone.issues)}</b><span>kembali perlu dicek atau rusak</span></div></div>
  </div>
</div>
</section>`;
}

function staffSection(rep: MonthReport) {
  const { rows, complete, since } = rep.staff;
  const body = rows
    .map(
      (s) => `<tr${s.system ? ' class="muted"' : ''}>
<th scope="row">${esc(s.system ? 'Sistem (formulir publik, kurir, impor)' : s.name)}</th>
<td class="num">${nf(s.added)}</td><td class="num">${nf(s.moved)}</td><td class="num">${nf(s.edited)}</td><td class="num">${nf(s.removed)}</td>
<td class="num"><b>${nf(s.total)}</b></td><td>${esc(s.top?.menu ?? '–')}</td>
</tr>`,
    )
    .join('');
  return `<section class="sec">
${head(8, 'Aktivitas staf', 'Pencatatan, perpindahan tahap, perubahan, dan penghapusan data menurut akun yang mengerjakan.')}
${
  body
    ? `<table class="tbl"><thead><tr><th>Nama</th><th class="num">Dicatat</th><th class="num">Dipindah tahap</th><th class="num">Diubah</th><th class="num">Dihapus</th><th class="num">Total</th><th>Menu terbanyak</th></tr></thead><tbody>${body}</tbody></table>`
    : empty('Belum ada aktivitas yang tercatat pada periode ini.')
}
${!complete && since ? `<p class="note">Riwayat aktivitas yang termuat baru mulai ${esc(dLong(since.slice(0, 10)))}, sehingga angka di atas bisa lebih kecil dari yang sebenarnya.</p>` : ''}
</section>`;
}

const METHOD = [
  '<b>Masuk</b> dihitung dari tanggal utama tiap menu, mis. tanggal masuk untuk TTD EVP dan tanggal diterima untuk Surat Masuk.',
  '<b>Selesai</b> adalah data yang mencapai tahap terakhir di dalam periode.',
  '<b>Berjalan</b> dan <b>lewat tenggat</b> adalah posisi pada akhir periode (atau saat laporan dibuat untuk bulan berjalan), disusun ulang dari riwayat tahap.',
  '<b>Rata-rata selesai</b> diukur dari dicatat sampai tahap terakhir. Data hasil impor Excel dan data yang langsung dicatat di tahap terakhir tidak dihitung.',
  '<b>Tepat waktu</b> membandingkan tanggal selesai dengan tenggat; hanya data yang punya tenggat dan bukan hasil impor.',
];

// ---------- Dokumen ----------

const LOGO = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8M16 13H8M16 17H8"/></svg>`;

const STYLE = (font: string, footLeft: string) => `
@font-face { font-family: 'Inter Laporan'; font-style: normal; font-display: swap; font-weight: 100 900; src: url(${cssStr(font)}) format('woff2-variations'); }
@page {
  size: A4; margin: 14mm 14mm 17mm;
  @bottom-left { content: ${cssStr(footLeft)}; font: 7pt 'Inter Laporan', Arial, sans-serif; color: #64748b; }
  @bottom-right { content: "Halaman " counter(page) " dari " counter(pages); font: 7pt 'Inter Laporan', Arial, sans-serif; color: #64748b; }
}
:root { --ink: #0f172a; --ink-2: #334155; --muted: #64748b; --hair: #e2e8f0; --fill: #f1f5f9; --fill-2: #f8fafc; --band: #0b1f3a; --accent: #1f5fbf; --good: #146c2e; --bad: #b42318; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 8.6pt/1.45 'Inter Laporan', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: var(--ink); letter-spacing: -0.005em; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
.doc { width: 182mm; margin: 0 auto; }
h1, h2, h3, p, figure { margin: 0; }
b { font-weight: 600; }
small { display: block; color: var(--muted); font-size: 7pt; line-height: 1.3; margin-top: 1px; font-weight: 400; }
.muted { color: var(--muted); }

/* Pita judul */
.band { position: relative; overflow: hidden; border-radius: 3mm; padding: 6mm 7.5mm 6.5mm; color: #fff;
  background: radial-gradient(120% 140% at 100% 0%, #1d4f91 0%, rgba(29,79,145,0) 55%), linear-gradient(120deg, #0a1a33 0%, #0e2a52 100%); }
.band::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 1.2mm; background: linear-gradient(90deg, #2f7de1, #5fb0ff); }
.band-top { display: flex; justify-content: space-between; align-items: center; }
.org { display: flex; align-items: center; gap: 2.6mm; }
.mark { width: 8mm; height: 8mm; border-radius: 2mm; display: grid; place-items: center; background: linear-gradient(165deg, #4fb0ff, #0060df); box-shadow: inset 0 0 0 0.3mm rgba(255,255,255,.25); }
.org b { display: block; font-size: 9.5pt; letter-spacing: 0.01em; }
.org span { display: block; font-size: 7.6pt; color: rgba(255,255,255,.72); }
.badge { font-size: 6.8pt; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,.8); border: 0.25mm solid rgba(255,255,255,.35); border-radius: 99px; padding: 1mm 2.6mm; }
.band-title { margin-top: 6.5mm; }
.kicker { font-size: 7.6pt; font-weight: 650; letter-spacing: 0.1em; text-transform: uppercase; color: #8cc4ff; }
.band h1 { font-size: 23pt; font-weight: 650; letter-spacing: -0.025em; line-height: 1.1; margin-top: 1mm; }
.band-lead { margin-top: 1.4mm; font-size: 8.6pt; color: rgba(255,255,255,.78); max-width: 125mm; }
.meta { display: grid; grid-template-columns: repeat(4, 1fr); margin: 3.4mm 0 0; border: 0.25mm solid var(--hair); border-radius: 2.5mm; }
.meta div { padding: 2.2mm 3.4mm; }
.meta div + div { border-left: 0.25mm solid var(--hair); }
.meta span { display: block; font-size: 6.6pt; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.meta b { display: block; margin-top: 0.6mm; font-size: 8.4pt; }

/* Bagian */
.sec { margin-top: 8mm; }
.sec.first { margin-top: 6mm; }
.page-start { break-before: page; margin-top: 0; }
.sec-head { display: flex; gap: 3mm; align-items: flex-start; margin-bottom: 3.2mm; break-after: avoid; break-inside: avoid; }
.no { flex: none; font-size: 7.4pt; font-weight: 700; color: var(--accent); border: 0.3mm solid currentColor; border-radius: 1.2mm; padding: 0.5mm 1.3mm; margin-top: 0.9mm; font-variant-numeric: tabular-nums; }
.sec-head h2 { font-size: 13pt; font-weight: 650; letter-spacing: -0.015em; line-height: 1.25; }
.sec-head p { font-size: 8pt; color: var(--muted); margin-top: 0.6mm; }
.sub-title { font-size: 9.5pt; font-weight: 600; margin: 5mm 0 2mm; break-after: avoid; }
.keep { break-inside: avoid; }

/* Ringkasan eksekutif */
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.6mm; break-inside: avoid; }
.kpi { border: 0.25mm solid var(--hair); border-radius: 2.5mm; padding: 3mm 3.6mm 2.8mm; display: flex; flex-direction: column; background: #fff; }
.kpi-label { font-size: 6.8pt; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.kpi-value { font-size: 19pt; font-weight: 650; letter-spacing: -0.03em; line-height: 1.15; margin-top: 0.8mm; }
.kpi-sub { font-size: 7.2pt; color: var(--muted); margin: 0.2mm 0 1.8mm; }
.delta { margin-top: auto; padding-top: 1.6mm; border-top: 0.25mm solid var(--hair); font-size: 7.2pt; font-weight: 500; color: var(--ink-2); display: flex; gap: 1.2mm; align-items: baseline; }
.delta i { font-style: normal; font-size: 6pt; }
.delta.good { color: var(--good); }
.delta.bad { color: var(--bad); }
.box { margin-top: 3.4mm; padding: 3.2mm 4.2mm; background: var(--fill-2); border: 0.25mm solid var(--hair); border-left: 0.9mm solid var(--accent); border-radius: 2.5mm; break-inside: avoid; }
.box h3 { font-size: 8pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-2); }
.highlights { margin: 1.4mm 0 0; padding-left: 4.2mm; display: grid; gap: 0.9mm; }
.highlights li { padding-left: 0.6mm; }
.highlights li::marker { color: var(--accent); }
.charts { display: grid; grid-template-columns: 1.12fr 1fr; gap: 3mm; margin-top: 3.4mm; break-inside: avoid; }
.chart { border: 0.25mm solid var(--hair); border-radius: 2.5mm; padding: 3mm 3.6mm 2.4mm; display: flex; flex-direction: column; }
.chart figcaption { margin-bottom: 2mm; }
.chart svg { margin-block: auto; }
.chart figcaption b { display: block; font-size: 8.8pt; }
.chart figcaption span { display: block; font-size: 7pt; color: var(--muted); margin-top: 0.3mm; }
.chart svg { display: block; width: 100%; height: auto; overflow: visible; }
.chart .bar { fill: var(--accent); }
.chart .grid { stroke: var(--hair); stroke-width: 0.6; }
.chart .base { stroke: #94a3b8; stroke-width: 0.8; }
.chart .axis { font-size: 8px; fill: var(--muted); font-variant-numeric: tabular-nums; }
.chart .lbl { font-size: 8.4px; fill: var(--ink-2); }
.chart .val { font-size: 8.4px; font-weight: 650; fill: var(--ink); font-variant-numeric: tabular-nums; }

/* Tabel */
.tbl { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.tbl thead { display: table-header-group; }
.tbl tr { break-inside: avoid; }
.tbl th, .tbl td { text-align: left; vertical-align: top; padding: 1.7mm 2mm; }
.tbl thead th { font-size: 6.6pt; font-weight: 650; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); border-bottom: 0.35mm solid var(--ink); padding-top: 0; white-space: nowrap; }
.tbl tbody th { font-weight: 600; }
.tbl tbody tr + tr > * { border-top: 0.2mm solid var(--hair); }
.tbl tbody tr:nth-child(even) > * { background: var(--fill-2); }
.tbl tfoot > tr > * { border-top: 0.35mm solid var(--ink); font-weight: 650; }
.tbl tfoot small { font-weight: 400; }
.tbl .num { text-align: right; white-space: nowrap; }
.tbl .num small { display: inline; margin-left: 1mm; }
.tbl .nowrap { white-space: nowrap; }
.tbl .wrap { overflow-wrap: anywhere; }
.tbl tr.muted > * { color: var(--muted); }
.tbl.compact th, .tbl.compact td { padding: 1.3mm 1.8mm; font-size: 8pt; }
.tbl.compact thead th { font-size: 6.4pt; padding-top: 0; }
.jenis { width: 60%; }
.share { display: flex; align-items: center; gap: 2mm; }
.meter { flex: 1; height: 1.6mm; border-radius: 1mm; background: var(--fill); overflow: hidden; }
.meter i { display: block; height: 100%; background: var(--accent); border-radius: 1mm; }
.tag { display: inline-block; font-size: 6.8pt; font-weight: 600; padding: 0.3mm 1.6mm; border-radius: 99px; background: var(--fill); color: var(--ink-2); white-space: nowrap; }
.tag.open { background: #fff; color: var(--bad); box-shadow: inset 0 0 0 0.25mm currentColor; }
.facts { display: flex; flex-wrap: wrap; gap: 1mm 5mm; margin-top: 3mm; font-size: 7.8pt; color: var(--ink-2); break-inside: avoid; }
.facts-head { width: 100%; font-size: 6.6pt; font-weight: 650; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); }
.stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2.4mm; margin-bottom: 3.4mm; break-inside: avoid; break-after: avoid; }
.stat-row.three { grid-template-columns: repeat(3, 1fr); }
.stat-row div { background: var(--fill-2); border: 0.25mm solid var(--hair); border-radius: 2mm; padding: 2.4mm 3mm; }
.stat-row b { display: block; font-size: 13pt; font-weight: 650; letter-spacing: -0.02em; line-height: 1.2; }
.stat-row span { display: block; font-size: 7pt; color: var(--muted); }
.panels { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
.panel { border: 0.25mm solid var(--hair); border-radius: 2.5mm; padding: 3.2mm 3.6mm 0.2mm; }
.panel h3 { font-size: 8.8pt; margin-bottom: 2.2mm; }
.panel .stat-row div { background: none; border: 0; padding: 0; }
.empty { padding: 4mm; border: 0.25mm dashed #cbd5e1; border-radius: 2.5mm; color: var(--muted); text-align: center; font-size: 8pt; }
.kpis + .empty { margin-top: 3.4mm; }
.chart .empty { border: 0; padding: 10mm 0; }
.note { margin-top: 2mm; font-size: 7.2pt; color: var(--muted); }
.method { margin-top: 9mm; padding-top: 3mm; border-top: 0.25mm solid var(--hair); font-size: 7pt; color: var(--muted); break-inside: avoid; }
.method h3 { font-size: 7pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-2); margin-bottom: 1.2mm; }
.method ul { margin: 0; padding-left: 3.6mm; display: grid; gap: 0.6mm; }
.method b { color: var(--ink-2); }
.sign { margin-top: 3mm; }

/* Pratinjau di layar sebelum dicetak */
.toolbar { display: none; }
@media screen {
  html { background: #e8eaee; }
  body { padding: 76px 0 48px; }
  .doc { width: 210mm; padding: 14mm; background: #fff; border-radius: 2px; box-shadow: 0 1px 2px rgba(15,23,42,.06), 0 18px 48px -12px rgba(15,23,42,.22); }
  .page-start { margin-top: 12mm; padding-top: 12mm; border-top: 0.3mm dashed #cbd5e1; }
  .toolbar { display: flex; align-items: center; gap: 16px; position: fixed; inset: 0 0 auto; height: 60px; padding: 0 24px; z-index: 5;
    background: rgba(255,255,255,.86); backdrop-filter: saturate(180%) blur(16px); -webkit-backdrop-filter: saturate(180%) blur(16px); border-bottom: 1px solid rgba(15,23,42,.08); }
  .toolbar div { flex: 1; min-width: 0; }
  .toolbar b { display: block; font-size: 14px; }
  .toolbar span { display: block; font-size: 12px; color: var(--muted); }
  .toolbar button { font: inherit; font-size: 13px; font-weight: 500; border: 0; border-radius: 99px; padding: 9px 18px; cursor: pointer; background: #0071e3; color: #fff; transition: background .18s cubic-bezier(.2,.8,.2,1), transform .18s cubic-bezier(.2,.8,.2,1); }
  .toolbar button:hover { background: #0077ed; }
  .toolbar button:active { transform: scale(.97); }
  .toolbar button.ghost { background: #e8e8ed; color: #1d1d1f; }
}
@media print { body { background: none; } }
`;

export interface ReportMeta {
  by: string;
  at: Date;
}

export function reportHtml(rep: MonthReport, meta: ReportMeta) {
  const p = rep.period;
  const month = monthLabel(p.month);
  const lastDay = new Date(p.end.getTime() - 86_400_000);
  const periodText = `1–${lastDay.getDate()} ${month}`;
  const asOf = p.current
    ? `Per ${meta.at.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : `Akhir ${dLong(dayKey(lastDay))}`;
  const printed = `${meta.at.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}, ${meta.at.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
  const title = `Laporan Bulanan ${month} – Unit Dokumen BYLT`;
  const font = new URL(interUrl, location.href).href;
  const body = `
<header class="band">
  <div class="band-top">
    <div class="org"><span class="mark">${LOGO}</span><div><b>Unit Dokumen</b><span>Balai Yasa Lahat</span></div></div>
    <span class="badge">Laporan internal</span>
  </div>
  <div class="band-title">
    <p class="kicker">Laporan Bulanan${p.current ? ' · Bulan berjalan' : ''}</p>
    <h1>${esc(month)}</h1>
    <p class="band-lead">Kinerja layanan dokumen: surat, tanda tangan EVP, Kantor Pos, multimedia, arsip, dan peminjaman drone.</p>
  </div>
</header>
<div class="meta">
  <div><span>Periode</span><b>${esc(periodText)}</b></div>
  <div><span>Posisi data</span><b>${esc(asOf)}</b></div>
  <div><span>Dicetak oleh</span><b>${esc(meta.by || '–')}</b></div>
  <div><span>Dicetak pada</span><b>${esc(printed)}</b></div>
</div>
${summary(rep)}
${perModule(rep)}
${evpSection(rep)}
${lateSection(rep)}
${posSection(rep)}
${mediaSection(rep)}
${otherSection(rep)}
${staffSection(rep)}
<footer class="method">
  <h3>Catatan perhitungan</h3>
  <ul>${METHOD.map((x) => `<li>${x}</li>`).join('')}</ul>
  <p class="sign">Dibuat otomatis dari Dashboard Dokumen BYLT pada ${esc(printed)}.</p>
</footer>`;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=860"><title>${esc(title)}</title>
<style>${STYLE(font, `Laporan Bulanan ${month} · Unit Dokumen, Balai Yasa Lahat`)}</style></head>
<body>
<div class="toolbar"><div><b>${esc(`Laporan Bulanan ${month}`)}</b><span>Di jendela cetak, pilih “Simpan sebagai PDF” sebagai tujuan.</span></div><button type="button" class="ghost" onclick="window.close()">Tutup</button><button type="button" onclick="window.print()">Simpan PDF</button></div>
<main class="doc">${body}</main>
<script>window.onload = function () { var go = function () { setTimeout(function () { window.print(); }, 250); }; document.fonts && document.fonts.ready ? document.fonts.ready.then(go, go) : go(); };</script>
</body></html>`;
}

/** Buka laporan di jendela baru (dicetak otomatis). false bila pop-up diblokir browser. */
export function openReport(rep: MonthReport, meta: ReportMeta) {
  const w = openOwnTab();
  if (!w) return false;
  w.document.open();
  w.document.write(reportHtml(rep, meta));
  w.document.close();
  return true;
}
