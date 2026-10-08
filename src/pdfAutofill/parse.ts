// Mengurai teks surat (hasil lapisan teks PDF atau OCR) menjadi isian form Surat Masuk / Surat Keluar.
// Prinsipnya: lebih baik kosong daripada salah. Semua hasil tetap ditinjau pengguna sebelum diterapkan.

export type LetterModule = 'surat' | 'keluar';

export interface Guess {
  value: string;
  /** Hasil kurang yakin (OCR ragu atau tebakan dari isi surat): ditandai di langkah tinjau. */
  unsure?: boolean;
}

export type Guesses = Record<string, Guess>;

/** Penanda dari tahap OCR: angka sesudahnya hasil baca ulang tulisan tangan, jadi perlu diperiksa. */
export const UNSURE = '\u2063';

const MONTHS = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
const MONTH_ALIAS: Record<string, number> = { pebruari: 2, nopember: 11, okt: 10, sept: 9, agt: 8, des: 12, jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, nov: 11, ags: 8 };
const MONTH_RE =
  '(januari|februari|pebruari|maret|april|mei|juni|juli|agustus|september|oktober|nopember|november|desember|okt|sept|agt|ags|des|jan|feb|mar|apr|jun|jul|nov)';
const DAYS = '(senin|selasa|rabu|kamis|jum\'?at|sabtu|minggu|ahad)';

const SMALL = new Set(
  'dan di ke dari untuk yang pada dengan atas bagi oleh atau serta tentang dalam sebagai kepada s.d. s/d per'.split(' '),
);
/** Singkatan yang tetap huruf besar saat teks kapital diubah ke huruf judul. */
const ACRONYMS = new Set(
  (
    'PT CV KAI PLN UPT ULP UP3 UID TK SD SDN SDIT SMP SMPN SMPIT SMA SMAN SMAIT SMK SMKN MI MTS MTSN MA MAN PAUD RI ' +
    'NKRI BUMN DPP DPD DPW DPC PD PW PC CSR SK PJS SPKA YWKA IKADI OSIS PKK RT RW RSUD TNI POLRI KUA BPJS BRI BNI ' +
    'BSI BTN PDAM PGRI LPK LSM UMKM HUT IPS IPA KKN PKL PPL MOU NIPP NIP ASN PNS OPD DPRD KPU BPS BKD BPBD OJK PJKA ' +
    'EVP UPTD DAOP DIVRE LRT MRT KCI KRL WIB WITA WIT CP HP NPWP NIK KTP SIM STNK BBM APBD APBN RAB UMD UMDS'
  ).split(' '),
);
const ROMAN = /^(I|II|III|IV|VI|VII|VIII|IX|XI|XII)$/;

/** Singkatan tingkat kepengurusan organisasi. */
const LEVELS: [RegExp, string][] = [
  [/\bdewan pengurus pusat\b/i, 'DPP'],
  [/\bdewan pengurus daerah\b/i, 'DPD'],
  [/\bdewan pengurus wilayah\b/i, 'DPW'],
  [/\bdewan pengurus cabang\b/i, 'DPC'],
  [/\bpengurus pusat\b/i, 'PP'],
  [/\bpengurus daerah\b/i, 'PD'],
  [/\bpengurus wilayah\b/i, 'PW'],
  [/\bpengurus cabang\b/i, 'PC'],
];

/** Nama jenis sekolah yang biasa disingkat. */
const SCHOOLS: [RegExp, string][] = [
  [/\bsekolah dasar islam terpadu\b/i, 'SDIT'],
  [/\bsekolah menengah pertama islam terpadu\b/i, 'SMPIT'],
  [/\bsekolah menengah pertama\b/i, 'SMP'],
  [/\bsekolah menengah atas\b/i, 'SMA'],
  [/\bsekolah menengah kejuruan\b/i, 'SMK'],
  [/\bsekolah dasar\b/i, 'SD'],
  [/\btaman kanak\s*-\s*kanak\b/i, 'TK'],
  [/\bmadrasah ibtidaiyah\b/i, 'MI'],
  [/\bmadrasah tsanawiyah\b/i, 'MTs'],
  [/\bmadrasah aliyah\b/i, 'MA'],
];

const LABEL_HEAD = /^[^\p{L}\d]{0,3}(nomor|nomer|nornor|no|lampiran|lamp|hal|perihal|prihal|perlhal|sifat|tentang)\b\s*\.?\s*[:;.]/iu;

interface Line {
  text: string;
  page: number;
  /** Urutan baris di halamannya. */
  idx: number;
  /** Jumlah baris di halamannya. */
  of: number;
  /** Ada angka tulisan tangan yang dibaca ulang di baris ini. */
  unsure?: boolean;
}

// ---------- Bantuan teks ----------

function normalize(s: string) {
  return s
    .normalize('NFC')
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ');
}

const letters = (s: string) => s.match(/\p{L}/gu)?.length ?? 0;
const upperRatio = (s: string) => {
  const l = s.match(/\p{L}/gu) ?? [];
  return l.length ? l.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length / l.length : 0;
};
const isCaps = (s: string) => letters(s) >= 3 && upperRatio(s) > 0.85;
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Ubah teks kapital semua menjadi huruf judul; singkatan dan angka Romawi tetap. */
export function titleCase(s: string, known: Set<string> = new Set()) {
  if (!isCaps(s)) return s;
  let first = true;
  return s.replace(/[\p{L}\d'.&/-]+/gu, (w) => {
    const bare = w.replace(/[^\p{L}\d]/gu, '');
    const up = bare.toUpperCase();
    let out: string;
    if (/\d/.test(w) || ACRONYMS.has(up) || known.has(up) || ROMAN.test(bare) || (bare.length > 1 && !/[AIUEO]/i.test(bare))) {
      out = w.toUpperCase();
    } else if (!first && SMALL.has(w.toLowerCase())) out = w.toLowerCase();
    else out = w.toLowerCase().replace(/(^|[-/'(])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
    // Huruf sesudah tanda petik (Da'i) tetap kecil.
    out = out.replace(/'(\p{Lu})/gu, (_m, c: string) => "'" + c.toLowerCase());
    first = false;
    return out;
  });
}

/** Apakah singkatan bisa dibentuk dari kata-kata ini (huruf awal tiap kata, boleh ditambah huruf dalam kata). */
function spells(acr: string, ws: string[]): boolean {
  if (!ws.length) return !acr;
  const w = ws[0].toUpperCase();
  if (!acr || acr[0] !== w[0]) return false;
  // Kata pertama menyumbang huruf awalnya dan mungkin beberapa huruf berikutnya (Pejabat → PJ).
  for (let used = 1, pos = 1; used <= acr.length; used++) {
    if (spells(acr.slice(used), ws.slice(1))) return true;
    const next = w.indexOf(acr[used], pos);
    if (next < 0) return false;
    pos = next + 1;
  }
  return false;
}

/** Singkatan umum yang kadang tertulis huruf kecil di surat ("Sdit" → "SDIT"). */
const FIX_CASE = new Set(
  'SDIT SMPIT SMAIT SMPN SMAN SMKN SDN KAI PLN CSR UPT ULP UPTD BUMN BPJS PDAM PGRI UMKM OSIS RSUD EVP YWKA IKADI SPKA PJS DPP DPD DPRD NIPP PJKA'.split(' '),
);

/** Ganti frasa panjang yang punya singkatan di surat, mis. "Corporate Social Responsibility (CSR)" → "CSR". */
function compact(s: string, docAcr?: Set<string>) {
  s = s.replace(/[\p{L}]{3,6}/gu, (w) => (FIX_CASE.has(w.toUpperCase()) && /^\p{Lu}/u.test(w) ? w.toUpperCase() : w));
  for (const [re, abbr] of LEVELS) s = s.replace(re, abbr);
  if (!docAcr) return squash(s);
  // Frasa diikuti singkatannya dalam kurung.
  s = s.replace(/((?:[\p{L}'-]+\s+){1,6})\(([A-Z]{2,8})\)/gu, (m, words: string, acr: string) => {
    const ws = words.trim().split(/\s+/);
    for (let k = Math.min(ws.length, 6); k >= 2; k--) {
      if (spells(acr, ws.slice(-k))) return ws.slice(0, -k).concat(acr).join(' ') + ' ';
    }
    return m;
  });
  // Frasa tiga kata atau lebih yang singkatannya dipakai di bagian lain surat (mis. SPKA di nomor surat).
  for (const acr of docAcr) {
    if (acr.length < 3) continue;
    const re = new RegExp(`\\b${acr.split('').map((c) => `${c}[\\p{L}'-]*`).join('\\s+')}(?![\\p{L}])`, 'giu');
    s = s.replace(re, (m) => (m.split(/\s+/).every((w) => /^\p{Lu}/u.test(w)) ? acr : m));
  }
  return squash(s.replace(/\s+([,.)])/g, '$1'));
}

/** Rapikan nilai teks: spasi, tanda baca menggantung, dan sampah OCR di ujung. */
function tidy(s: string) {
  return squash(s)
    .replace(/^[^\p{L}\d(]+/u, '')
    .replace(/[\s,;:|_\-'"=~]+$/u, '')
    .replace(/\s+([,.;:])/g, '$1');
}

// ---------- Tanggal ----------

function monthNo(word: string) {
  const w = word.toLowerCase();
  const i = MONTHS.indexOf(w);
  return i >= 0 ? i + 1 : (MONTH_ALIAS[w] ?? 0);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Angka hari hasil OCR: O→0, l/I/|→1, S→5. */
function dayNo(raw: string) {
  const d = raw.replace(/[Oo]/g, '0').replace(/[lI|!]/g, '1').replace(/[Ss]/g, '5');
  return /^\d{1,2}$/.test(d) ? Number(d) : 0;
}

interface DateHit {
  iso: string;
  score: number;
  line: Line;
  at: number;
}

const DATE_RE = new RegExp(`(?<![\\d])([0-9OolI|!S]{1,2})[\\s.,]*${MONTH_RE}[\\s.,]*((?:19|20)\\d{2})(?!\\d)`, 'gi');

function findDates(lines: Line[], primary: number, now: Date): DateHit[] {
  const hits: DateHit[] = [];
  const year = now.getFullYear();
  for (const line of lines) {
    for (const m of line.text.matchAll(DATE_RE)) {
      const d = dayNo(m[1]);
      const mo = monthNo(m[2]);
      const y = Number(m[3]);
      if (!d || d > 31 || !mo) continue;
      const iso = `${y}-${pad(mo)}-${pad(d)}`;
      if (Number.isNaN(Date.parse(iso))) continue;
      const before = line.text.slice(0, m.index);
      const after = line.text.slice(m.index! + m[0].length);
      let score = 0;
      // "Lahat, 6 Oktober 2026" (tempat dan tanggal di atas tanda tangan atau di kanan atas).
      if (/\p{L}{3,}\s*[,.;\-]\s*[.\-]*\s*$/u.test(before) && !new RegExp(`${DAYS}\\s*[,.]?\\s*$`, 'i').test(before)) score += 5;
      if (/(ditetapkan|pada tanggal|tanggal surat|dikeluarkan)[^:]{0,12}:\s*$/i.test(before)) score += 6;
      if (/^\W*$/.test(before) && /^\W*$/.test(after)) score += 2;
      // Koma terbaca sebagai huruf: "Lahats25 September 2026".
      else if (/(^|\s|\W)\p{L}{4,}$/u.test(before) && line.text.length < 45 && !/(tanggal|tgl|bulan)$/i.test(before)) score += 3;
      // Tempat dan tanggal di atas tanda tangan, sesudah kalimat penutup.
      const near = lines.filter((l) => l.page === line.page && l.idx < line.idx && l.idx >= line.idx - 4);
      if (line.text.length < 45 && near.some((l) => /demikian|wassalam|hormat kami|terima ?kasih|mestinya/i.test(l.text))) score += 2;
      if (/^\W{0,3}(nomor|nomer|no)\b/i.test(line.text)) score += 3;
      if (new RegExp(`${DAYS}\\s*[,.]?\\s*(tanggal|tgl\\.?)?\\s*$`, 'i').test(before)) score -= 5;
      if (/(hari|tanggal|tgl|waktu|pelaksanaan)\s*[:;]?\s*\S*\s*$/i.test(before) && !/pada tanggal\s*:/i.test(before)) score -= 3;
      if (/(lambat|sebelum|sampai|s\.?\s?d\.?|sejak|berlaku|mulai|hingga|tempo|batas|periode|bulan)\s+(\w+\s+)?$/i.test(before)) score -= 4;
      if (/(sampai|s\.?\s?d|hingga)/i.test(after.slice(0, 12))) score -= 3;
      if (line.page === primary) score += 1;
      if (Math.abs(y - year) > 1) score -= 3;
      // Surat tidak bertanggal jauh di masa depan.
      if (Date.parse(iso) - now.getTime() > 7 * 864e5) score -= 2;
      hits.push({ iso, score, line, at: m.index! });
    }
  }
  return hits;
}

// ---------- Bagian-bagian surat ----------

function labelValue(line: string, labels: string): string | null {
  const m = line.match(new RegExp(`^[^\\p{L}\\d]{0,3}(?:${labels})\\b\\s*\\.?\\s*[:;.,]\\s*(.*)$`, 'iu'));
  return m ? m[1] : null;
}

/** Potong isi kolom kanan yang ikut terbaca di baris yang sama (tujuan surat, tempat-tanggal). */
function cutRight(s: string) {
  const cuts = [
    /\s(kepada|yth)\b.*$/i,
    new RegExp(`\\s\\p{L}{3,}\\s*[,.;]\\s*\\S{0,4}\\s*${MONTH_RE}\\s+\\d{4}.*$`, 'iu'),
    new RegExp(`\\s\\d{1,2}\\s+${MONTH_RE}\\s+\\d{4}.*$`, 'i'),
    /\s{2,}.*$/,
  ];
  for (const re of cuts) s = s.replace(re, '');
  return s;
}

function parseNumber(lines: Line[]): Guess | null {
  for (const l of lines) {
    const raw = labelValue(l.text, 'nomor|nomer|nornor|nemor') ?? labelValue(l.text, 'no(?=\\s*\\.?\\s*:)');
    if (raw == null) continue;
    let v = cutRight(raw.replace(/^[:;.\s]+/, ''));
    v = v
      .replace(/\s*([/.\-])\s*/g, '$1')
      .replace(/(^|\s)\|(?=\s|\/|$)/g, '$1I')
      .replace(/[,;:'"]+$/, '')
      .trim();
    if (!/\d/.test(v) || v.length < 3) continue;
    // Bulan Romawi yang terbaca keliru, mis. "[X" → "IX".
    v = v.replace(/\/([IVXl1|[\]!]{1,4})\/((?:19|20)\d{2})$/, (m, r: string, y: string) =>
      /[^1]/.test(r) ? `/${r.replace(/[l1|[\]!]/g, 'I')}/${y}` : m,
    );
    let unsure = false;
    // Nomor agenda di depan (sering ditulis tangan): perbaiki huruf yang mirip angka.
    v = v.replace(/^([^/]{1,6})\//, (m, seg: string) => {
      if (/^[\d.]+$/.test(seg) || !/\d/.test(seg)) return m;
      const fixed = seg.replace(/[$§S]/g, '5').replace(/[£]/g, '5').replace(/[Oo]/g, '0').replace(/[lI|!]/g, '1').replace(/[^\d.]/g, '');
      unsure = true;
      return fixed ? `${fixed}/` : m;
    });
    if (/[^\p{L}\d./\-_() &]/u.test(v) || l.unsure) unsure = true;
    return { value: v, unsure };
  }
  return null;
}

function parsePerihal(lines: Line[], docAcr: Set<string>): Guess | null {
  for (let i = 0; i < lines.length; i++) {
    const raw = labelValue(lines[i].text, 'hal|perihal|prihal|perlhal|perihai|hai');
    if (raw == null) continue;
    let v = cutRight(raw);
    const caps = isCaps(v);
    // Perihal panjang berlanjut ke baris berikutnya.
    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      const next = lines[j].text.trim();
      if (!next || LABEL_HEAD.test(next) || isAddress(next) || /[.!?]$/.test(v)) break;
      if (/^(kepada|yth|dengan hormat|assalam|di\b|di-|u\.?p\.?|ka\.?|kepala|pimpinan|direktur|manager|manajer|pt\.?|upt|bapak|ibu|sdr)\b/i.test(next)) break;
      if (/\d{4,}|nipp?\b/i.test(next) && !new RegExp(MONTH_RE, 'i').test(next)) break;
      if (!caps && isCaps(next)) break;
      if (letters(next) < next.length * 0.6 || next.length > 90) break;
      if (!v) {
        v = cutRight(next);
        continue;
      }
      v += ' ' + cutRight(next);
    }
    v = stripCapsTail(v);
    v = tidy(v);
    if (letters(v) < 4) continue;
    return { value: compact(titleCase(v, docAcr), docAcr), unsure: false };
  }
  // Surat keputusan: judul di bawah kata "TENTANG".
  for (let i = 0; i < lines.length; i++) {
    if (!/^\W*tentang\s*:?\s*$/i.test(lines[i].text)) continue;
    const parts: string[] = [];
    // Baris penerbit ("DEWAN PENGURUS PUSAT …") mengulang judul di atasnya; di situ judul selesai.
    const head = fold(lines.slice(Math.max(0, i - 6), i).map((l) => l.text).join(' '));
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const t = lines[j].text.trim();
      if (!t || /^(menimbang|mengingat|memperhatikan|dengan|kepada)/i.test(t)) break;
      if (parts.length && fold(t).length > 10 && head.includes(fold(t))) break;
      parts.push(t);
    }
    if (parts.length) return { value: compact(titleCase(tidy(parts.join(' ')), docAcr), docAcr) };
  }
  return null;
}

/** Nama dalam huruf kapital dari kolom kanan yang menempel di akhir perihal (mis. nama pejabat tujuan). */
function stripCapsTail(v: string) {
  if (isCaps(v)) return v;
  return v.replace(/(\s+[\p{Lu}.,]{2,}){2,}\s*$/u, '');
}

/** Judul surat seperti "SURAT PENGANTAR" ditambah pokok kegiatannya, untuk surat tanpa baris Hal. */
function titleSubject(lines: Line[], body: string, docAcr: Set<string>): Guess | null {
  const title = lines.slice(0, 14).find((l) => /^\W*(surat\s+\p{L}+|undangan|pemberitahuan|pengumuman)\W*$/iu.test(l.text) && isCaps(l.text));
  if (!title || /keputusan/i.test(title.text)) return null;
  const head = titleCase(tidy(title.text));
  const subj =
    body.match(/\bkegiatan\s+((?:\p{Lu}[\p{L}'-]*\s*){1,5})/u) ??
    body.match(/\bacara\s+((?:\p{Lu}[\p{L}'-]*\s*){1,5})/u) ??
    body.match(/\bdalam rangka\s+([\p{L}' -]{4,60}?)(?=[,.]|\s+(?:yang|kami|maka|akan|di|ke)\b)/iu);
  const tail = subj ? tidy(subj[1]) : '';
  return { value: compact(tail ? `${head} Kegiatan ${tail}`.replace(/Kegiatan Kegiatan/, 'Kegiatan') : head, docAcr), unsure: !tail };
}

const ADDRESS = /\b(jl|jln|jalan|ji|alamat|telp|telepon|tlp|fax|faks|email|e-mail|website|kode pos|kel|kec|kab|kelurahan|kecamatan|hp|wa|po box|gedung)\b\.?|@|www\.|https?:/i;
const isAddress = (s: string) => ADDRESS.test(s);

/** Kata sampah OCR di tepi baris kop (sisa logo). */
function cleanKop(s: string) {
  let t = s.replace(/[^\p{L}\d\s().,'&/-]/gu, ' ');
  const words = squash(t).split(' ');
  const caps = isCaps(t);
  const ok = (w: string) => {
    const bare = w.replace(/[^\p{L}\d]/gu, '');
    if (!bare) return false;
    if (caps && /\p{Ll}/u.test(bare) && !/^\(/.test(w)) return false;
    if (bare.length <= 2) return ACRONYMS.has(bare.toUpperCase()) || ROMAN.test(bare) || /^\d+$/.test(bare) || /^\(.*\)$/.test(w);
    return true;
  };
  while (words.length && !ok(words[0])) words.shift();
  while (words.length && !ok(words[words.length - 1])) words.pop();
  // Satu huruf/angka di ujung setelah kata biasa biasanya sisa logo ("… SELATAN 1"), kecuali "NEGERI 1".
  const n = words.length;
  if (n > 2 && /^[\p{L}\d]$/u.test(words[n - 1]) && !/^(negeri|swasta|no|nomor|kelas|unit|cabang|ywka)$/i.test(words[n - 2]))
    words.pop();
  t = words.join(' ').replace(/\b(SMP|SMA|SMK|SD|MTS)\s*(NEGERI)\b/gi, '$1 $2');
  // Nama yang terbaca dua kali (dua logo di kiri dan kanan): ambil satu.
  const ws = t.split(' ');
  const again = ws.findIndex((w, i) => i > 0 && w.length > 3 && w === ws[0]);
  if (again > 0) t = ws.slice(again).join(' ');
  return t.replace(/\b\d{5}\b/g, '').replace(/[,.\s]+$/, '').trim();
}

const SCHOOL = /\b(SMP|SMA|SMK|SD|SDN|SDIT|SMPIT|SMPN|SMAN|SMKN|MI|MTS|MAN|TK|PAUD|SEKOLAH|MADRASAH|TAMAN KANAK|PONDOK PESANTREN|UNIVERSITAS|POLITEKNIK|INSTITUT|AKADEMI)\b/i;
const UNIT =
  /\b(KANTOR\s?POS|KANTORPOS|KANTOR|CABANG|ULP|UP3|UPT|UPTD|DINAS|BADAN|BAGIAN|POLRES|POLSEK|KODIM|KORAMIL|KECAMATAN|KELURAHAN|DESA|PUSKESMAS|RUMAH SAKIT|RSUD|SATUAN|DIVISI|DAOP|DIVRE)\b/i;
const ORG =
  /\b(PT|CV|PERSERO|YAYASAN|IKATAN|SERIKAT|PERSATUAN|PERKUMPULAN|HIMPUNAN|ASOSIASI|KOPERASI|BANK|LEMBAGA|ORGANISASI|PEMERINTAH|KEMENTERIAN|KEPOLISIAN|MASJID|GEREJA|KARANG TARUNA|KOMUNITAS|FORUM|DEWAN|PENGURUS|FEDERASI|PARTAI|PANITIA|TBK)\b/i;
const PARENT = /^(PEMERINTAH|KEMENTERIAN|YAYASAN|PT\.? KERETA API)/i;
const FOREIGN = /\b(indonesian|union|association|railways?|worker'?s|company|limited|ministry|of the)\b/i;
const SKIP_KOP = /\b(akreditasi|terakreditasi|npsn|nss|nis|nds|izin operasional|sk\s+no)\b/i;

function kopLines(lines: Line[]): string[] {
  const out: string[] = [];
  for (const l of lines.slice(0, 10)) {
    const t = l.text;
    if (LABEL_HEAD.test(t) || /^\W*(kepada|yth|dengan hormat|assalam)/i.test(t)) break;
    if (/^\W*surat\s+\p{L}+/iu.test(t) && isCaps(t) && out.length) break;
    if (new RegExp(`\\d{1,2}\\s+${MONTH_RE}\\s+\\d{4}`, 'i').test(t)) break;
    out.push(t);
  }
  return out;
}

function parseAsal(lines: Line[], all: string, place: string, docAcr: Set<string>): Guess | null {
  const kop = kopLines(lines);
  type Cand = { text: string; rank: number; i: number };
  const cands: Cand[] = [];
  kop.forEach((raw, i) => {
    if (isAddress(raw) || FOREIGN.test(raw) || SKIP_KOP.test(raw)) return;
    const t = cleanKop(raw);
    if (letters(t) < 4 || letters(t) < t.replace(/[\s()]/g, '').length * 0.6) return;
    const paren = t.match(/^\(([^)]+)\)$/);
    let rank = 0;
    if (paren) rank = 5;
    else if (SCHOOL.test(t)) rank = 4;
    else if (/^(dewan pengurus|pengurus)\s+(pusat|daerah|wilayah|cabang)$/i.test(t)) rank = -1;
    else if (UNIT.test(t)) rank = 3;
    else if (ORG.test(t)) rank = PARENT.test(t) ? 1 : 2;
    else if (isCaps(t) && t.split(' ').length >= 2) rank = 1;
    if (rank) cands.push({ text: titleCase(paren ? paren[1] : t, docAcr), rank, i });
  });
  if (!cands.length) return null;
  // Baris unit yang lebih bawah lebih spesifik (UP3 → ULP); nama organisasi ambil yang pertama.
  const best = cands.reduce((a, b) => (b.rank > a.rank || (b.rank === a.rank && b.rank === 3) ? b : a));
  let name = best.text;
  // Kantor/unit di bawah nama induknya: "PT POS INDONESIA (PERSERO)" + "KANTORPOS LAHAT".
  if (best.rank === 3 && !ORG.test(name)) {
    const parent = cands.find((c) => c.i < best.i && c.rank === 2);
    if (parent) name = `${parent.text} ${name}`;
    else if (/\b(ULP|UP3|UID|UIW)\b/.test(name) && /\bPLN\b/.test(all)) name = `PT PLN (Persero) ${name}`;
  }
  // Tingkat kepengurusan (DPP, PD, …) di baris kop tersendiri.
  const level = cands.find((c) => c.rank === -1);
  if (level && best.rank === 2) name = `${level.text} ${name}`;
  name = titleCase(name, docAcr);
  // Nama lengkap di isi surat: "Pengurus Daerah Ikatan Dai Indonesia (IKADI) Kabupaten Lahat".
  const core = name.split(' ').filter((w) => letters(w) > 2 && !/^(pt|persero|\(persero\))$/i.test(w));
  if (core.length >= 2 && best.rank === 2 && !level) {
    const loose = core
      .map((w) => w.replace(/[^\p{L}]/gu, ''))
      .map((w) => (w.length <= 3 ? "[\\p{L}']{2,5}" : w.split('').join("[\\s'.]?")))
      .join('[\\s\\p{P}]+');
    const re = new RegExp(
      `((?:dewan\\s+)?pengurus\\s+(?:pusat|daerah|wilayah|cabang)\\s+)?(${loose})(\\s*\\([A-Z]{2,10}\\))?((?:\\s+(?:kabupaten|kab\\.|kota|provinsi)\\s+\\p{Lu}\\p{L}+))?`,
      'iu',
    );
    const ext = (x: RegExpMatchArray) => (x[1] ? 2 : 0) + (x[3] ? 1 : 0) + (x[4] ? 1 : 0);
    const m = [...all.matchAll(new RegExp(re.source, 'giu'))].sort((a, b) => ext(b) - ext(a))[0];
    if (m && ext(m)) name = `${m[1] ?? ''}${m[2]}${m[3] ?? ''}${m[4] ?? ''}`;
  }
  // Nama sekolah: "Sekolah Islam Terpadu …" → SDIT bila surat memakai singkatan itu.
  for (const [re, abbr] of SCHOOLS) name = name.replace(re, abbr);
  const it = all.match(/\b(SD|SMP|SMA)IT\b/i);
  if (it) name = name.replace(/^sekolah islam terpadu\b/i, it[0].toUpperCase());
  name = compact(titleCase(name, docAcr));
  if (best.rank === 5) {
    // Angka Romawi I di akhir singkatan sering terbaca "1"; pakai bentuk yang tertulis di bagian lain surat.
    const head = name.replace(/\s+1$/, '');
    if (head !== name && new RegExp(`${head.replace(/\s+/g, '\\s+')}\\s+[I|l](?![\\p{L}\\d])`, 'u').test(all)) name = `${head} I`;
    // Singkatan saja (mis. "TK YWKA I"): tambahkan kota agar jelas.
    if (place && !new RegExp(`\\b${place}\\b`, 'i').test(name)) name += ` ${place}`;
  }
  // Hanya singkatan jenis (mis. "TK") tanpa nama: lebih baik dikosongkan.
  if (letters(name) < 4) return null;
  return { value: tidy(name).replace(/\bPt\b/, 'PT').replace(/\(PERSERO\)/, '(Persero)'), unsure: best.rank < 2 };
}

/** Baris tujuan surat: setelah "Kepada"/"Yth" sampai "di …"/"Tempat". */
function addressee(lines: Line[]): string[] {
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].text;
    const m = t.match(/\b(kepada(?:\s+yth)?|yth|yang terhormat)\b\.?\s*[:,.]?\s*(.*)$/i);
    if (!m || /dengan hormat/i.test(t)) continue;
    const out: string[] = [];
    if (m[2].trim()) out.push(m[2]);
    for (let j = i + 1; j < Math.min(i + 7, lines.length); j++) {
      const n = lines[j].text.trim();
      if (!n) {
        if (out.length) break;
        continue;
      }
      if (/^\W*(di[\s.-]|di$|ditempat|tempat|dengan hormat|assalam|bersama|dalam rangka|sehubungan)/i.test(n)) break;
      if (LABEL_HEAD.test(n) && !out.length) continue;
      out.push(n.replace(/^\W*(yth|yih|ykh)\b\.?\s*/i, ''));
    }
    // Baris "U.p." (untuk perhatian) ikut dibaca.
    const up = lines.slice(i, i + 9).find((l) => /\bu\.\s?p\.?\s/i.test(l.text));
    if (up && !out.includes(up.text)) out.push(up.text);
    if (out.length) return out.map((s) => tidy(s.replace(/^(kepada|yth)\b\.?\s*:?/i, '')));
  }
  return [];
}

const UNIT_WORDS: [RegExp, string][] = [
  [/\b(keuangan|finance|akuntansi|anggaran)\b/i, 'Keuangan'],
  [/\b(sdm|sumber daya manusia|human capital|personalia|kepegawaian)\b/i, 'SDM'],
  [/\b(logistik|pengadaan|gudang|material)\b/i, 'Logistik'],
  [/\b(perencanaan|rencana|planning)\b/i, 'Rencana'],
  [/\b(dokumen|sekretariat|kearsipan|persuratan)\b/i, 'Dokumen'],
];

const EVP_RE =
  /\b(evp|e\.v\.p|executive\s+vice\s+president|exe?cutive\s+vice)\b|\b(kepala|ka\.?|kpl\.?|pimpinan|pimp\.?|ketua|direktur|general manager)\s+(upt\s+)?(pt\.?\s*)?(kai|balai\s*yasa|kereta api|by\b)|\bupt\s+balai\s*yasa\b/i;

function parseTujuanSurat(lines: Line[], all: string, units: string[]): Guess | null {
  const to = addressee(lines).join(' ');
  if (to) {
    if (EVP_RE.test(to)) return { value: 'EVP' };
    for (const [re, unit] of UNIT_WORDS) if (re.test(to) && units.includes(unit)) return { value: unit };
  }
  // Tanpa tujuan yang jelas, surat untuk Balai Yasa Lahat diserahkan ke EVP.
  if (/balai\s*yasa|balaiyasa|\bpt\.?\s*kai\b|kereta api indonesia/i.test(to || all)) return { value: 'EVP', unsure: !to };
  return null;
}

function parseTujuanKeluar(lines: Line[], docAcr: Set<string>): Guess | null {
  const to = addressee(lines).filter((s) => !/^u\.?\s?p\.?\s/i.test(s));
  if (!to.length) return null;
  const v = tidy(to.slice(0, 3).join(', ').replace(/,\s*,/g, ','));
  return letters(v) >= 3 ? { value: compact(titleCase(v, docAcr), docAcr) } : null;
}

function parseSifat(lines: Line[]): string {
  for (const l of lines.slice(0, 30)) {
    const v = labelValue(l.text, 'sifat');
    if (v == null) continue;
    const m = v.match(/\b(sangat segera|segera|rahasia|penting|biasa|terbatas)\b/i);
    if (m) return m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  }
  return '';
}

// ---------- Catatan ----------

const PHONE = /(?<![\p{L}\d])(?:\+62|62|\(0\d{2,3}\)|0)[\s.-]?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{2,5}(?!\d)/gu;

function fmtRp(raw: string) {
  const digits = raw.replace(/,-$|,00$|\.00$/, '').replace(/[.,\s]/g, '');
  if (!/^\d{3,}$/.test(digits)) return '';
  return 'Rp' + Number(digits).toLocaleString('id-ID');
}

function parseNotes(lines: Line[], kop: Set<string>, mod: LetterModule, sifat: string): string {
  const out: string[] = [];
  const add = (s: string) => {
    const t = squash(s);
    if (t && !out.some((o) => fold(o) === fold(t)) && out.length < 8) out.push(t);
  };
  const KEYS =
    /^[^\p{L}]{0,3}(hari\s*[,/]?\s*tanggal|hari|tanggal|tgl|waktu|pukul|jam|tempat|lokasi|acara|agenda|tema|kegiatan|peserta(?:\s+\p{L}+)?|jum[l1i]ah\s+\p{L}+|narasumber|batas\s+\p{L}+|jatuh tempo)\s*[:;]\s*(.+)$/iu;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].text.match(KEYS);
    if (!m || kop.has(lines[i].text)) continue;
    let val = tidy(m[2]);
    // Rincian bernomor di baris-baris berikutnya ("1. Peserta didik : 132", "2. Guru : 21").
    if (/^1\s*\./.test(val)) {
      const items = [val];
      for (let j = i + 1; j < lines.length && /^\s*\d\s*\./.test(lines[j].text); j++) items.push(tidy(lines[j].text));
      val = items.map((s) => s.replace(/^\d\s*\.\s*/, '').replace(/\s*:\s*/, ' ')).join('; ');
    }
    const label = squash(m[1])
      .replace(/\s*\/\s*/g, '/')
      .replace(/^jum[1i]ah/i, 'Jumlah')
      .replace(/^./, (c) => c.toUpperCase());
    if (letters(val) + (val.match(/\d/g)?.length ?? 0) >= 2) add(`${label}: ${val}`);
  }
  const body = lines.map((l) => l.text).join('\n');
  // Nilai uang.
  for (const m of body.matchAll(/([\p{L} ]{0,24}?)\s*:?\s*Rp\.?\s*([\d][\d.,]*(?:,-)?)/giu)) {
    const rp = fmtRp(m[2]);
    if (!rp) continue;
    const ctx = tidy(m[1]).split(' ').slice(-3).join(' ');
    const label = /tagihan|biaya|total|jumlah|sebesar|nilai|anggaran|dana|bantuan|harga/i.test(ctx) ? ctx.replace(/^\w/, (c) => c.toUpperCase()) : 'Nilai';
    add(`${label.replace(/^(Sebesar|Adalah Sebesar)$/i, 'Nilai')}: ${rp}`);
  }
  // Batas waktu.
  const due = body.replace(/\n/g, ' ').match(
    new RegExp(
      `\\b(paling lambat|selambat-lambatnya|batas waktu|batas akhir|jatuh tempo)\\s+(?:tanggal\\s+|pada\\s+)?(\\d{1,2}\\s+${MONTH_RE}\\s+\\d{4}|\\d+\\s*(?:\\([\\p{L} ]+\\))?\\s*hari(?:\\s+(?:kerja|kalender))?(?:\\s+setelah(?:\\s+(?!dikarenakan|karena|dan|maka|apabila|jika|sehingga|agar)\\p{L}+){1,3})?)`,
      'iu',
    ),
  );
  if (due) add(`Batas: ${due[1].toLowerCase()} ${tidy(due[2])}`);
  // Masa berlaku (surat keputusan, izin).
  const valid = body
    .replace(/\n/g, ' ')
    .match(new RegExp(`\\bberlaku\\s+(?:sejak|mulai)\\s+(?:\\S+\\s+){0,4}?(\\d{1,2}\\s+${MONTH_RE}\\s+\\d{4})\\s+(?:sampai dengan|s\\.?\\s?d\\.?|hingga)\\s+(?:\\S+\\s+){0,4}?(\\d{1,2}\\s+${MONTH_RE}\\s+\\d{4})`, 'i'));
  if (valid) add(`Berlaku: ${valid[1]} s.d. ${valid[3]}`);
  // Narahubung dan nomor telepon.
  const phones = new Set<string>();
  const office: string[] = [];
  for (const l of lines) {
    const t = l.text;
    for (const m of t.matchAll(PHONE)) {
      const num = m[0].trim();
      const digits = num.replace(/\D/g, '');
      if (digits.length < 9 || digits.length > 14 || phones.has(digits)) continue;
      if (/\b(idpel|rek|rekening|briva|va|nip|nipp|nik|nuptk|npwp|no\.?\s*resi)\b/i.test(t.slice(Math.max(0, m.index! - 20), m.index!))) continue;
      if (/\b(fax|faks|faximile)\s*[:.]?\s*$/i.test(t.slice(Math.max(0, m.index! - 10), m.index!))) continue;
      phones.add(digits);
      const name =
        t.match(/(?:contact person|cp|narahubung|hubungi)\s*[:.]?\s*([\p{L}.,' ]{3,40}?)\s*[(:]/iu)?.[1] ??
        t.slice(m.index! + num.length).match(/^\s*\(\s*([\p{L}.' ]{3,40}?)\s*\)/u)?.[1] ??
        t.slice(0, m.index).match(/^\W*([\p{Lu}][\p{L}.,' ]{2,40}?)\s*[:(]\s*(?:hp\.?|wa|telp\.?)?\s*$/iu)?.[1];
      if (kop.has(t) || (!name && isAddress(t))) office.push(num);
      else add(name ? `Kontak: ${tidy(name).replace(/,(?=\S)/g, ', ')} ${num}` : `Kontak: ${num}`);
    }
  }
  if (office.length) add(`Telp. pengirim: ${office.slice(0, 2).join(' / ')}`);
  if (mod === 'surat' && sifat && !/^biasa$/i.test(sifat)) out.unshift(`Sifat: ${sifat}`);
  return out.join('\n');
}

// ---------- Utama ----------

/** Halaman surat utama: yang punya nomor, perihal, tujuan, dan salam pembuka. */
function letterPage(pages: string[]) {
  let best = 0;
  let top = -1;
  pages.forEach((t, i) => {
    let s = 0;
    if (/^\W{0,3}(nomor|nomer|no)\s*\.?\s*[:;]/im.test(t)) s += 3;
    if (/^\W{0,3}(hal|perihal|tentang)\b/im.test(t)) s += 2;
    if (/\b(kepada|yth)\b/i.test(t)) s += 1;
    if (/dengan hormat|assalam/i.test(t)) s += 1;
    if (new RegExp(`\\p{L}{3,}\\s*,\\s*\\d{1,2}\\s+${MONTH_RE}\\s+\\d{4}`, 'iu').test(t)) s += 1;
    if (s > top) {
      top = s;
      best = i;
    }
  });
  return best;
}

export interface ParseOptions {
  mod: LetterModule;
  /** Pilihan field tujuan Surat Masuk (EVP dan nama unit). */
  units: string[];
  now?: Date;
}

export function parseLetter(pageTexts: string[], opt: ParseOptions): Guesses {
  const now = opt.now ?? new Date();
  const texts = pageTexts.map(normalize);
  const primary = letterPage(texts);
  const toLines = (t: string, page: number): Line[] => {
    const ls = t.split('\n').map((s) => s.trim());
    return ls.map((text, idx) => ({ text: text.replaceAll(UNSURE, ''), page, idx, of: ls.length, unsure: text.includes(UNSURE) }));
  };
  const main = toLines(texts[primary], primary).filter((l) => l.text);
  const all = texts.flatMap((t, i) => toLines(t, i)).filter((l) => l.text);
  const allText = texts.join('\n').replaceAll(UNSURE, '');
  // Singkatan yang dipakai di surat (dari kurung dan nomor surat), untuk merapikan nama.
  const docAcr = new Set<string>();
  for (const m of allText.matchAll(/\(([A-Z]{2,6})\)/g)) docAcr.add(m[1]);
  for (const l of all) {
    const no = labelValue(l.text, 'nomor|nomer|no(?=\\s*\\.?\\s*:)');
    if (no != null) for (const m of no.matchAll(/(?<![A-Za-z])([A-Z]{2,6})(?![A-Za-z])/g)) docAcr.add(m[1]);
    if (upperRatio(l.text) < 0.5) for (const m of l.text.matchAll(/(?<![\p{L}])(\p{Lu}{2,6})(?![\p{L}])/gu)) docAcr.add(m[1]);
  }
  // Kata biasa yang kebetulan ditulis kapital (LAHAT, YASA) bukan singkatan: bentuk huruf kecilnya juga ada.
  for (const a of docAcr) {
    const word = a[0] + a.slice(1).toLowerCase();
    if (new RegExp(`(?<![\\p{L}])(${word}|${a.toLowerCase()})(?![\\p{L}])`, 'u').test(allText)) docAcr.delete(a);
  }

  const g: Guesses = {};
  const put = (key: string, v: Guess | null) => {
    if (v && v.value.trim()) g[key] = { value: v.value.trim(), ...(v.unsure ? { unsure: true } : {}) };
  };

  const nomor = parseNumber(main) ?? parseNumber(all);
  put('nomorSurat', nomor);

  const dates = findDates(all, primary, now).sort((a, b) => b.score - a.score || a.line.page - b.line.page || a.line.idx - b.line.idx);
  const date = dates[0] && dates[0].score >= 2 ? dates[0] : null;
  put(opt.mod === 'surat' ? 'tanggalSurat' : 'tanggal', date ? { value: date.iso, unsure: date.score < 4 || date.line.unsure } : null);
  // Kota tempat surat dibuat ("Lahat, 6 Oktober 2026").
  const place =
    date?.line.text.slice(0, date.at).match(/(\p{Lu}\p{L}{2,})\s*[,.;-]?\s*[.\-]*\s*$/u)?.[1] ??
    allText.match(new RegExp(`(\\p{Lu}\\p{L}{2,})\\s*,\\s*\\d{1,2}\\s+${MONTH_RE}`, 'iu'))?.[1] ??
    '';
  const city = place ? place[0].toUpperCase() + place.slice(1).toLowerCase() : '';

  const body = main.map((l) => l.text).join('\n');
  const perihal = parsePerihal(main, docAcr) ?? parsePerihal(all, docAcr) ?? titleSubject(main, body, docAcr);
  if (perihal && /^tagihan\b/i.test(perihal.value) && !new RegExp(MONTH_RE, 'i').test(perihal.value)) {
    // Tagihan tanpa periode: tambahkan bulan tagihan dari isi surat.
    const per = body.match(new RegExp(`\\bbulan\\s+${MONTH_RE}\\s+(\\d{4})`, 'i'));
    if (per) perihal.value += ` Bulan ${per[1][0].toUpperCase()}${per[1].slice(1).toLowerCase()} ${per[2]}`;
  }
  put('perihal', perihal);

  const sifat = parseSifat(main);
  const kop = new Set(kopLines(main));
  if (opt.mod === 'surat') {
    put('asal', parseAsal(main, allText, /^eahat$/i.test(city) ? 'Lahat' : city, docAcr));
    put('tujuan', parseTujuanSurat(main, allText, opt.units));
  } else {
    put('tujuan', parseTujuanKeluar(main, docAcr));
    if (/^(segera|sangat segera|penting)$/i.test(sifat)) put('sifat', { value: 'Segera' });
    else if (/^(rahasia|terbatas)$/i.test(sifat)) put('sifat', { value: 'Rahasia' });
    else if (/^biasa$/i.test(sifat)) put('sifat', { value: 'Biasa' });
  }
  put('catatan', { value: parseNotes(main, kop, opt.mod, sifat) });
  return g;
}
