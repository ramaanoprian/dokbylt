// Membaca teks dari PDF atau foto surat. Bagian ini baru dimuat saat fitur dipakai.
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { Bbox, Line as OcrLine, Page as OcrPage, Worker as OcrWorker } from 'tesseract.js';
import { UNSURE } from './parse';

declare const __OCR_DIR__: string;
declare const __PDF_DIR__: string;

export type Phase = 'open' | 'engine' | 'read' | 'ocr';

export interface Progress {
  phase: Phase;
  /** Halaman yang sedang dibaca (mulai 1) dan jumlah halaman yang dibaca. */
  page: number;
  pages: number;
  /** 0–1, hanya untuk tahap yang bisa diukur. */
  ratio?: number;
}

export interface PageText {
  page: number;
  text: string;
  /** "text": lapisan teks PDF, "ocr": hasil pengenalan gambar. */
  source: 'text' | 'ocr';
}

/** Hanya dua halaman pertama yang dibaca: surat biasanya di halaman 1, kadang setelah sampul. */
export const MAX_PAGES = 2;
/** Halaman dengan huruf sesedikit ini dianggap hasil scan dan dibaca dengan OCR. */
const MIN_LETTERS = 60;
/** Sisi terpanjang gambar untuk OCR: setara ±300 dpi pada A4, cukup tajam dan tetap cepat. */
const OCR_SIDE = 3300;

const abs = (dir: string) => new URL(import.meta.env.BASE_URL + dir, document.baseURI).href;

export class ReadError extends Error {}

interface Options {
  onProgress: (p: Progress) => void;
  signal: AbortSignal;
  /** Dipanggil setelah tiap halaman; true berarti isi surat sudah lengkap dan halaman berikutnya dilewati. */
  enough?: (pages: PageText[]) => boolean;
}

export async function readLetter(file: File, opt: Options): Promise<PageText[]> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) return readPdf(file, opt);
  if (file.type.startsWith('image/')) {
    opt.onProgress({ phase: 'open', page: 1, pages: 1 });
    const bmp = await createImageBitmap(file).catch(() => {
      throw new ReadError('Foto tidak bisa dibuka. Gunakan JPG atau PNG.');
    });
    const scale = Math.min(OCR_SIDE / Math.max(bmp.width, bmp.height), 2);
    const canvas = toCanvas(bmp.width * scale, bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    clean(canvas);
    const ocr = await startOcr(opt, 1);
    try {
      return [{ page: 1, text: await ocr.read(canvas, 1), source: 'ocr' }];
    } finally {
      ocr.stop();
    }
  }
  throw new ReadError('Pilih berkas PDF atau foto (JPG/PNG).');
}

async function readPdf(file: File, opt: Options): Promise<PageText[]> {
  opt.onProgress({ phase: 'open', page: 0, pages: 0 });
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    wasmUrl: abs(__PDF_DIR__ + 'wasm/'),
    disableFontFace: true,
  });
  const stopPdf = () => task.destroy();
  opt.signal.addEventListener('abort', stopPdf);
  let ocr: Ocr | null = null;
  try {
    const doc = await task.promise.catch((e: Error) => {
      throw new ReadError(
        e?.name === 'PasswordException' ? 'PDF ini dikunci kata sandi.' : 'PDF tidak bisa dibuka. Mungkin berkasnya rusak.',
      );
    });
    const pages = Math.min(doc.numPages, MAX_PAGES);
    const out: PageText[] = [];
    for (let n = 1; n <= pages; n++) {
      opt.onProgress({ phase: 'read', page: n, pages });
      const page = await doc.getPage(n);
      const text = await pageText(page);
      if ((text.match(/\p{L}/gu)?.length ?? 0) >= MIN_LETTERS) {
        out.push({ page: n, text, source: 'text' });
      } else {
        // Halaman hasil scan: gambar halaman lalu kenali teksnya.
        ocr ??= await startOcr(opt, pages);
        const canvas = await renderPage(page);
        out.push({ page: n, text: await ocr.read(canvas, n), source: 'ocr' });
      }
      page.cleanup();
      if (opt.signal.aborted) throw new DOMException('Dibatalkan', 'AbortError');
      if (n < pages && opt.enough?.(out)) break;
    }
    return out;
  } finally {
    opt.signal.removeEventListener('abort', stopPdf);
    ocr?.stop();
    stopPdf();
  }
}

/** Susun potongan teks PDF menjadi baris sesuai posisinya di halaman. */
async function pageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  type Run = { x: number; y: number; w: number; h: number; s: string };
  const runs: Run[] = [];
  for (const it of content.items) {
    if (!('str' in it) || !it.str) continue;
    const [, , , d, e, f] = it.transform as number[];
    runs.push({ x: e, y: f, w: it.width, h: Math.abs(d) || it.height || 10, s: it.str });
  }
  runs.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Run[][] = [];
  for (const r of runs) {
    const line = lines.find((l) => Math.abs(l[0].y - r.y) < Math.min(l[0].h, r.h) * 0.5);
    if (line) line.push(r);
    else lines.push([r]);
  }
  return lines
    .sort((a, b) => b[0].y - a[0].y)
    .map((l) => {
      l.sort((a, b) => a.x - b.x);
      let s = '';
      let end = -Infinity;
      for (const r of l) {
        // Jarak lebar antarpotongan (kolom/tab) dijadikan spasi ganda agar tetap terpisah.
        const gap = r.x - end;
        if (s && gap > r.h * 1.5) s += '  ';
        else if (s && gap > r.h * 0.15 && !/\s$/.test(s) && !/^\s/.test(r.s)) s += ' ';
        s += r.s;
        end = r.x + r.w;
      }
      return s.replace(/[ \t]+$/, '');
    })
    .filter((l) => l.trim())
    .join('\n');
}

async function renderPage(page: PDFPageProxy): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(OCR_SIDE / Math.max(base.width, base.height), 6) });
  const canvas = toCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return clean(canvas);
}

/**
 * Ubah ke abu-abu dan hapus garis mendatar panjang (garis bawah perihal, garis kop, tabel). Teks yang
 * digarisbawahi sering tidak terbaca OCR bila garisnya dibiarkan.
 */
function clean(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const minRun = Math.round(w * 0.045);
  const gray = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) gray[j] = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const dark = x < w && gray[row + x] < 150;
      if (dark && start < 0) start = x;
      else if (!dark && start >= 0) {
        if (x - start >= minRun) gray.fill(255, row + start, row + x);
        start = -1;
      }
    }
  }
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) px[i] = px[i + 1] = px[i + 2] = gray[j];
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function toCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  return c;
}

interface Ocr {
  read: (canvas: HTMLCanvasElement, page: number) => Promise<string>;
  stop: () => void;
}

/** SIMD membuat OCR jauh lebih cepat; browser lama memakai versi biasa. */
const SIMD_TEST = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

async function startOcr(opt: Options, pages: number): Promise<Ocr> {
  let page = 1;
  opt.onProgress({ phase: 'engine', page, pages, ratio: 0 });
  const { createWorker, OEM, PSM } = await import('tesseract.js');
  const dir = abs(__OCR_DIR__);
  const core = WebAssembly.validate(SIMD_TEST) ? 'tesseract-core-simd-lstm.js' : 'tesseract-core-lstm.js';
  let worker: OcrWorker | null = null;
  const stop = () => {
    worker?.terminate();
    worker = null;
  };
  opt.signal.addEventListener('abort', stop, { once: true });
  worker = await createWorker(['ind', 'eng'], OEM.LSTM_ONLY, {
    workerPath: dir + 'worker.min.js',
    corePath: dir + core,
    langPath: dir.replace(/\/$/, ''),
    workerBlobURL: false,
    logger: (m) => {
      if (m.status === 'recognizing text') opt.onProgress({ phase: 'ocr', page, pages, ratio: m.progress });
      else if (/loading|initializ/.test(m.status)) opt.onProgress({ phase: 'engine', page, pages, ratio: m.progress });
    },
    errorHandler: () => {},
  }).catch(() => {
    throw new ReadError('Mesin pengenal teks gagal dimuat. Periksa koneksi lalu coba lagi.');
  });
  if (opt.signal.aborted) stop();
  return {
    read: async (canvas, n) => {
      if (!worker) throw new DOMException('Dibatalkan', 'AbortError');
      page = n;
      opt.onProgress({ phase: 'ocr', page, pages, ratio: 0 });
      const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
      const w = worker;
      // Angka tulisan tangan (nomor agenda, tanggal) dibaca ulang khusus angka dengan beberapa mode.
      return refine(data, async (box) => {
        const img = crop(canvas, box);
        const votes: string[] = [];
        try {
          for (const psm of [PSM.SINGLE_LINE, PSM.SINGLE_WORD, PSM.RAW_LINE]) {
            await w.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: '0123456789' });
            votes.push((await w.recognize(img)).data.text.replace(/\D/g, ''));
          }
        } finally {
          await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO, tessedit_char_whitelist: '' });
        }
        return vote(votes);
      });
    },
    stop,
  };
}

const MONTH = /^(januari|februari|pebruari|maret|april|mei|juni|juli|agustus|september|oktober|nopember|november|desember)$/i;

/**
 * Hasil yang disepakati minimal dua mode. Bacaan pendek yang termuat di bacaan lebih panjang ("53" dalam
 * "553") ikut menguatkan yang panjang, karena angka tulisan tangan di tepi sering terlewat.
 */
function vote(reads: string[]): string {
  const ok = reads.filter(Boolean);
  let best = '';
  let top = 0;
  for (const r of new Set(ok)) {
    const n = ok.filter((x) => x === r || (r.length > x.length && r.includes(x))).length;
    if (n > top || (n === top && r.length > best.length)) {
      best = r;
      top = n;
    }
  }
  return top >= 2 ? best : '';
}

/** Potongan gambar di sekitar kotak kata: tinggi huruf ±48 px dengan tepi putih lega (ukuran ideal OCR). */
function crop(src: HTMLCanvasElement, b: Bbox) {
  const h = b.y1 - b.y0;
  const scale = 48 / Math.max(12, h);
  const pad = 24;
  const c = toCanvas((b.x1 - b.x0) * scale + pad * 2, h * scale + pad * 2);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, b.x0, b.y0, b.x1 - b.x0, h, pad, pad, (b.x1 - b.x0) * scale, h * scale);
  return c;
}

type Sym = { text: string; bbox: Bbox };
const letters = (syms: Sym[]) => syms.filter((s) => /\p{L}/u.test(s.text)).length;
/** Kotak selebar simbol-simbol itu, setinggi barisnya (tulisan tangan sering lebih tinggi dari huruf cetak). */
const span = (syms: Sym[], line: Bbox): Bbox => ({
  x0: Math.min(...syms.map((s) => s.bbox.x0)),
  x1: Math.max(...syms.map((s) => s.bbox.x1)),
  y0: line.y0,
  y1: line.y1,
});

/**
 * Nomor agenda dan tanggal surat sering diisi tangan setelah dicetak ("Nomor : 553/…", "Lahat, 6 Oktober").
 * Bila bagian itu terbaca sebagai coretan ("$3", "&"), kotaknya dibaca ulang dengan OCR khusus angka.
 */
async function refine(data: OcrPage, digits: (b: Bbox) => Promise<string>): Promise<string> {
  const lines: OcrLine[] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
  if (!lines.length) return data.text;
  const out: string[] = [];
  let tries = 0;
  for (const line of lines) {
    const words = line.words.map((w) => ({ text: w.text, symbols: w.symbols as Sym[] }));
    // Tanggal: "Lahat, & Oktober 2026" atau "Lahat,& Oktober 2026".
    for (let i = 1; i < words.length - 1 && tries < 4; i++) {
      if (!MONTH.test(words[i].text.replace(/[^\p{L}]/gu, '')) || !/^\d{4}/.test(words[i + 1].text)) continue;
      const prev = words[i - 1];
      if (/^\W*\d{1,2}\W*$/.test(prev.text)) continue;
      const glued = /^\p{L}{3,}[,;.\-]/u.test(prev.text);
      if (!glued && !(i > 1 && /^\p{L}{3,}[,;.\-]+$/u.test(words[i - 2].text))) continue;
      const cut = glued ? prev.symbols.findIndex((s) => /[,;.\-]/.test(s.text)) + 1 : 0;
      const own = prev.symbols.slice(cut).filter((s) => !/^[,;.\-]$/.test(s.text));
      // Hanya coretan yang jelas bukan kata ("&", "$", "I"), bukan kata seperti "bulan".
      if (!own.length || own.length > 4 || letters(own) > 1) continue;
      tries++;
      const got = await digits(span(own, line.bbox));
      if (/^\d{1,2}$/.test(got) && +got >= 1 && +got <= 31) {
        prev.text = (glued ? prev.symbols.slice(0, cut).map((s) => s.text).join('') + ' ' : '') + UNSURE + got;
      }
    }
    // Nomor: bagian sebelum garis miring pertama, mis. "$3 /400.3.5/…".
    if (/^\W{0,3}(nomor|nomer|no)\b/i.test(line.text) && tries < 4) {
      const at = words.findIndex((w) => w.text.includes('/'));
      if (at > 0) {
        const w = words[at];
        const lead = w.text.startsWith('/') ? words[at - 1] : null;
        const before = lead ? lead.symbols : w.symbols.slice(0, w.symbols.findIndex((s) => s.text === '/'));
        const syms = before.slice(Math.max(0, before.findIndex((s) => !/^[:;.]$/.test(s.text))));
        const seg = syms.map((s) => s.text).join('');
        // Hanya bila ada tanda aneh ($, £, &): nomor berawalan huruf seperti "KA.203" dibiarkan.
        if (syms.length && syms.length <= 6 && /[^\p{L}\d.\-]/u.test(seg) && letters(syms) <= 1) {
          tries++;
          const got = await digits(span(syms, line.bbox));
          if (/^\d{1,5}$/.test(got)) {
            if (lead) lead.text = UNSURE + got;
            else w.text = w.text.replace(seg, UNSURE + got);
          }
        }
      }
    }
    out.push(words.map((w) => w.text).join(' '));
  }
  return out.join('\n');
}
