// Membaca surat lalu menampilkan langkah tinjau. Dimuat terpisah (lazy) bersama pembaca PDF dan OCR.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, LoaderCircle, Paperclip, RotateCcw, ScanText, TriangleAlert, X } from 'lucide-react';
import type { Field } from '../modules';
import { readLetter, ReadError, type PageText, type Progress } from './extract';
import { parseLetter, UNSURE, type Guesses, type LetterModule } from './parse';
import type { AutofillProps, ScanUpload } from './index';
import './panel.css';

interface Props extends AutofillProps {
  file: File;
  /**
   * Jumlah isian yang diterapkan, label isian yang masih perlu dicek, dan status lampiran.
   * Tanpa info berarti dibatalkan: form tidak berubah dan berkasnya tidak dilampirkan.
   */
  onClose: (applied: number, info?: { check: string[]; attached: Promise<string | null> }) => void;
}

/** Field yang diisi dari surat, berurutan seperti di form. */
const KEYS: Record<LetterModule, string[]> = {
  surat: ['nomorSurat', 'tanggalSurat', 'asal', 'perihal', 'tujuan', 'catatan'],
  keluar: ['nomorSurat', 'tanggal', 'tujuan', 'perihal', 'sifat', 'catatan'],
};

type Row = { value: string; on: boolean; unsure?: boolean; found: boolean };
type State =
  | { step: 'read'; pct: number; label: string; detail: string; note: string }
  | { step: 'review'; pages: PageText[]; rows: Record<string, Row> }
  | { step: 'error'; message: string };

const fmtSize = (b: number) => (b > 1_000_000 ? `${(b / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1000))} KB`);

/** Persen keseluruhan: menyiapkan mesin ±15%, sisanya dibagi rata per halaman. */
function overall(p: Progress) {
  if (p.phase === 'open') return 3;
  if (p.phase === 'engine') return 3 + (p.ratio ?? 0) * 12;
  const per = 85 / Math.max(1, p.pages);
  return 15 + (p.page - 1) * per + (p.phase === 'ocr' ? (p.ratio ?? 0) * per : 0);
}

/** Judul tahap dan catatan kecil di bawah bilah. */
function describe(p: Progress): [string, string] {
  const of = p.pages > 1 ? ` · halaman ${p.page} dari ${p.pages}` : '';
  if (p.phase === 'open') return ['Membuka berkas…', ''];
  if (p.phase === 'engine') return ['Menyiapkan pengenal teks…', 'Pertama kali dipakai butuh beberapa detik; selanjutnya lebih cepat.'];
  if (p.phase === 'read') return [`Membaca halaman ${p.page}${p.pages > 1 ? ` dari ${p.pages}` : ''}…`, ''];
  return [`Mengenali teks${of}`, 'Hasil scan dibaca per baris, termasuk angka tulisan tangan.'];
}

/** Perkiraan jumlah baris agar isian tinjau menampilkan seluruh teksnya. */
const rowsFor = (v: string, max: number) =>
  Math.min(max, Math.max(1, v.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 52)), 0)));

export default function Panel({ file, mod, values, defaults, onApply, upload, keep, discard, onClose }: Props) {
  const kind = mod.id as LetterModule;
  const fields = useMemo(
    () => KEYS[kind].map((k) => mod.fields.find((f) => f.key === k)).filter((f): f is Field => !!f),
    [kind, mod],
  );
  const [state, setState] = useState<State>({ step: 'read', pct: 2, label: 'Membuka berkas…', detail: '', note: '' });
  const [att, setAtt] = useState<'busy' | 'ok' | 'fail'>('busy');
  const [attErr, setAttErr] = useState('');
  const [run, setRun] = useState(0);
  // Isian form saat berkas dipilih, untuk menentukan centang bawaan. Nilai bawaan dianggap kosong.
  const start = useRef(values);
  const typed = (k: string) => {
    const v = start.current[k]?.trim() ?? '';
    return v && v !== defaults[k] ? v : '';
  };
  const opts = useMemo(() => ({ mod: kind, units: mod.fields.find((f) => f.key === 'tujuan')?.options ?? [] }), [kind, mod]);

  // Berkas diunggah bersamaan dengan pembacaan, tetapi baru masuk lampiran saat diterapkan.
  // Satu unggahan per berkas, walau efeknya dijalankan dua kali (StrictMode).
  const job = useRef<{ file: File; p: ScanUpload } | null>(null);
  const send = () => {
    const p = upload(file);
    job.current = { file, p };
    setAtt('busy');
    p.then((a) => {
      if (job.current?.p !== p) return;
      setAtt(typeof a === 'string' ? 'fail' : 'ok');
      setAttErr(typeof a === 'string' ? a : '');
    });
  };
  useEffect(() => {
    if (job.current?.file !== file) send();
  }, [file]);

  // Batal: form tidak berubah dan unggahannya dibuang.
  const cancel = () => {
    if (job.current) discard(job.current.p);
    job.current = null;
    onClose(0);
  };
  // Terapkan, atau lampirkan saja bila surat tak terbaca: berkasnya masuk lampiran setelah unggahan selesai.
  // Unggahan yang sudah diserahkan ke keep() tidak pernah dibuang lagi.
  const finish = (patch: Record<string, string>, check: string[]) => {
    const n = Object.keys(patch).length;
    if (n) onApply(patch);
    const p = job.current?.p;
    job.current = null;
    onClose(n, { check, attached: p ? keep(p) : Promise.resolve('Berkas belum terunggah.') });
  };
  // Form ditutup (Esc, latar, Batal, Simpan) sebelum Terapkan: unggahannya dibuang agar tidak tertinggal di penyimpanan.
  // Ditunda satu giliran karena StrictMode melepas lalu memasang ulang efek.
  const gone = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(gone.current);
    return () => {
      gone.current = setTimeout(() => {
        if (job.current) discard(job.current.p);
        job.current = null;
      });
    };
  }, []);
  // Esc menutup langkah ini saja, bukan seluruh form. Ditangkap lebih dulu (capture) dari pendengar Esc form.
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      cancelRef.current();
    };
    addEventListener('keydown', esc, true);
    return () => removeEventListener('keydown', esc, true);
  }, []);

  // Fokus pindah ke kartu yang baru tampil bila fokus sebelumnya hilang bersama kartu lama,
  // bukan saat pengguna sedang mengisi field lain sambil menunggu.
  const box = useRef<HTMLElement | null>(null);
  const setBox = useCallback((el: HTMLElement | null) => {
    box.current = el;
  }, []);
  useEffect(() => {
    const a = document.activeElement;
    if (!a || a === document.body) box.current?.focus();
  }, [state.step]);

  useEffect(() => {
    const ctl = new AbortController();
    let top = 0;
    setState({ step: 'read', pct: 2, label: 'Membuka berkas…', detail: '', note: '' });
    readLetter(file, {
      signal: ctl.signal,
      onProgress: (p) => {
        if (ctl.signal.aborted) return;
        top = Math.max(top, overall(p));
        const [label, note] = describe(p);
        // Persen yang tampil sama dengan panjang bilah, jadi tidak pernah mundur.
        setState({ step: 'read', pct: top, label, detail: `${Math.round(top)}%`, note });
      },
      // Halaman berikutnya dilewati bila nomor, tanggal, dan perihal sudah ditemukan.
      enough: (pages) => {
        const g = parseLetter(pages.map((x) => x.text), opts);
        return !!(g.nomorSurat && g.perihal && (g.tanggalSurat || g.tanggal));
      },
    })
      .then((pages) => {
        if (ctl.signal.aborted) return;
        const g: Guesses = pages.some((x) => x.text.trim()) ? parseLetter(pages.map((x) => x.text), opts) : {};
        if (!Object.keys(g).length && !pages.some((x) => x.text.trim())) {
          setState({ step: 'error', message: 'Tidak ada teks yang terbaca. Coba foto yang lebih terang dan tegak, atau isi form secara manual.' });
          return;
        }
        const rows: Record<string, Row> = {};
        for (const f of fields) {
          const v = g[f.key]?.value ?? '';
          rows[f.key] = { value: v, found: !!v, unsure: g[f.key]?.unsure, on: !!v && !typed(f.key) };
        }
        setState({ step: 'review', pages, rows });
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        setState({
          step: 'error',
          message: e instanceof ReadError ? e.message : 'Surat gagal dibaca. Coba lagi, atau isi form secara manual.',
        });
      });
    return () => ctl.abort();
  }, [file, run, fields, opts]);

  const attachNote =
    att === 'busy' ? (
      <span className="paf-chip">
        <LoaderCircle size={13} className="spin" /> Mengunggah…
      </span>
    ) : att === 'ok' ? (
      <span className="paf-chip paf-ok">
        <Paperclip size={13} /> Siap dilampirkan
      </span>
    ) : (
      <span className="paf-chip paf-fail">
        <TriangleAlert size={13} /> {attErr || 'Gagal diunggah'}
        <button type="button" className="link" onClick={send}>
          Coba lagi
        </button>
      </span>
    );

  if (state.step === 'read') {
    return (
      <div ref={setBox} tabIndex={-1} className="paf paf-work" role="status" aria-live="polite">
        <span className="paf-icon paf-busy" aria-hidden="true">
          <ScanText size={19} />
        </span>
        <div className="paf-copy">
          <div className="paf-line">
            <b>{state.label}</b>
            {state.detail && <span className="paf-pct">{state.detail}</span>}
          </div>
          <span className="paf-sub paf-name">
            <span className="paf-file" title={file.name}>
              {file.name}
            </span>
            <span>· {fmtSize(file.size)}</span>
          </span>
          <span
            className="paf-bar"
            role="progressbar"
            aria-label="Kemajuan membaca surat"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(state.pct)}
          >
            <span style={{ width: `${Math.max(2, Math.min(100, state.pct))}%` }} />
          </span>
          {state.note && <span className="paf-note">{state.note}</span>}
        </div>
        <button type="button" className="btn small paf-cancel" onClick={cancel}>
          Batal
        </button>
      </div>
    );
  }

  if (state.step === 'error') {
    return (
      <div ref={setBox} tabIndex={-1} className="paf paf-error" role="alert">
        <span className="paf-icon paf-warn" aria-hidden="true">
          <TriangleAlert size={18} />
        </span>
        <div className="paf-copy">
          <b>Surat belum bisa dibaca</b>
          <span className="paf-sub">{state.message}</span>
          <span className="paf-meta">
            <span className="paf-file" title={file.name}>
              {file.name}
            </span>
            {attachNote}
          </span>
        </div>
        <div className="paf-actions">
          <button type="button" className="btn small" onClick={() => setRun((n) => n + 1)}>
            <RotateCcw size={14} /> Coba lagi
          </button>
          {att !== 'fail' && (
            <button type="button" className="btn small" onClick={() => finish({}, [])}>
              <Paperclip size={14} /> Lampirkan saja
            </button>
          )}
          <button type="button" className="icon-btn" onClick={cancel} aria-label="Tutup tanpa melampirkan">
            <X size={18} />
          </button>
        </div>
      </div>
    );
  }

  const { rows, pages } = state;
  const setRow = (k: string, r: Partial<Row>) => setState({ ...state, rows: { ...rows, [k]: { ...rows[k], ...r } } });
  const picked = fields.filter((f) => rows[f.key].on && rows[f.key].value.trim());
  const found = fields.filter((f) => rows[f.key].found).length;
  const apply = () => {
    const patch: Record<string, string> = {};
    for (const f of picked) patch[f.key] = rows[f.key].value.trim();
    finish(patch, picked.filter((f) => rows[f.key].unsure).map((f) => f.label));
  };
  // Enter di langkah tinjau tidak boleh menyimpan form utama. Baris baru tetap boleh di isian catatan.
  const noSubmit = (e: React.KeyboardEvent) => {
    const t = e.target;
    const field =
      t instanceof HTMLInputElement ||
      t instanceof HTMLSelectElement ||
      (t instanceof HTMLTextAreaElement && t.classList.contains('paf-oneline'));
    if (e.key === 'Enter' && field) e.preventDefault();
  };

  return (
    <section ref={setBox} tabIndex={-1} className="paf paf-review" aria-label="Tinjau hasil baca surat" onKeyDown={noSubmit}>
      <header className="paf-head">
        <span className="paf-icon" aria-hidden="true">
          <ScanText size={19} />
        </span>
        <div className="paf-copy">
          <b>Periksa hasil baca</b>
          <span className="paf-sub">
            {found ? `${found} dari ${fields.length} isian ditemukan.` : 'Isian tidak dikenali otomatis.'} Centang yang
            ingin dipakai; isian yang sudah Anda tulis tidak ditimpa kecuali dicentang.
          </span>
          <span className="paf-meta">
            <span className="paf-file" title={file.name}>
              {file.name}
            </span>
            {attachNote}
          </span>
        </div>
        <button type="button" className="icon-btn" onClick={cancel} aria-label="Tutup tanpa menerapkan">
          <X size={18} />
        </button>
      </header>

      <ul className="paf-rows">
        {fields.map((f, i) => {
          const r = rows[f.key];
          const now = typed(f.key);
          const same = !!now && now === r.value.trim();
          const id = `paf-${f.key}`;
          const common = { id, value: r.value, placeholder: r.found ? undefined : 'Tidak terbaca' };
          // Nilai yang sudah disunting pengguna tidak lagi ditandai "Periksa".
          const change = (v: string) => setRow(f.key, { value: v, on: !!v.trim() && (r.on || !now), unsure: false });
          return (
            <li key={f.key} className={(r.on ? 'paf-on' : '') + (r.found ? '' : ' paf-missing')} style={{ ['--i' as string]: i }}>
              <label className="paf-check">
                <input
                  type="checkbox"
                  checked={r.on}
                  disabled={!r.value.trim()}
                  onChange={(e) => setRow(f.key, { on: e.target.checked })}
                  aria-label={`Pakai ${f.label.toLowerCase()}`}
                />
                <span className="paf-box" aria-hidden="true">
                  <Check size={12} strokeWidth={3.2} />
                </span>
              </label>
              <div className="paf-label">
                <label htmlFor={id}>{f.label}</label>
                {r.unsure && r.found && <span className="paf-flag">Periksa</span>}
                {now && !same && (
                  <span className="paf-now" title={now}>
                    Sekarang: {now.replace(/\n/g, ' · ')}
                  </span>
                )}
                {same && <span className="paf-now">Sama dengan isian sekarang</span>}
              </div>
              <div className="paf-input">
                {f.type === 'select' ? (
                  <select {...common} onChange={(e) => change(e.target.value)}>
                    <option value="">Pilih…</option>
                    {f.options!.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea {...common} rows={Math.max(2, rowsFor(r.value, 8))} onChange={(e) => change(e.target.value)} />
                ) : f.type === 'date' ? (
                  <input {...common} type="date" onChange={(e) => change(e.target.value)} />
                ) : (
                  // Isian satu baris yang ikut melebar ke bawah agar nilai panjang terlihat utuh.
                  <textarea
                    {...common}
                    className="paf-oneline"
                    rows={rowsFor(r.value, 3)}
                    onChange={(e) => change(e.target.value.replace(/\n/g, ' '))}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <details className="paf-raw">
        <summary>
          <ChevronDown size={15} /> Lihat teks yang terbaca
        </summary>
        <pre>
          {pages
            .map((p) => `— Halaman ${p.page} (${p.source === 'ocr' ? 'hasil pindai' : 'teks PDF'}) —\n${p.text.replaceAll(UNSURE, '').trim()}`)
            .join('\n\n')}
        </pre>
      </details>

      <footer className="paf-foot">
        <span className="paf-sub">
          {picked.length ? `${picked.length} isian akan diterapkan ke form.` : 'Belum ada isian yang dicentang.'}
        </span>
        <span className="spacer" />
        <button type="button" className="btn small" onClick={cancel}>
          Batal
        </button>
        <button type="button" className="pill-btn" onClick={apply} disabled={!picked.length}>
          <Check size={15} /> Terapkan
        </button>
      </footer>
    </section>
  );
}
