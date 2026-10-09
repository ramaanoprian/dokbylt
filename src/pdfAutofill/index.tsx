// Tombol "Isi dari PDF / foto surat" di form Surat Masuk dan Surat Keluar. Bagian ini sengaja kecil:
// pembaca PDF, OCR, dan langkah tinjau baru dimuat saat berkas dipilih.
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, Check, FileUp, Paperclip, RefreshCw, ScanText, TriangleAlert } from 'lucide-react';
import type { Attachment } from '../backend';
import type { ModuleDef } from '../modules';
import { quoteList } from '../util';
import './pdfAutofill.css';

const load = () => lazy(() => import('./Panel'));
let Panel = load();

/** Menangkap kegagalan memuat atau menampilkan Panel agar form (dan aplikasi) tidak ikut kosong. */
class Guard extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Unggahan berkas surat: data lampirannya, atau pesan galat. */
export type ScanUpload = Promise<Attachment | string>;

export interface AutofillProps {
  mod: ModuleDef;
  /** Isian form saat ini; yang sudah terisi tidak dicentang di langkah tinjau. */
  values: Record<string, string>;
  /** Nilai bawaan form baru (tanggal hari ini); boleh diganti seperti isian kosong. */
  defaults: Record<string, string>;
  onApply: (patch: Record<string, string>) => void;
  /** Unggah berkas surat ke penyimpanan, sambil dibaca. Belum masuk daftar lampiran. */
  upload: (file: File) => ScanUpload;
  /** Masukkan hasil unggahan ke lampiran setelah selesai. Hasilnya null bila berhasil, atau pesan galat. */
  keep: (job: ScanUpload) => Promise<string | null>;
  /** Buang hasil unggahan yang tidak jadi dipakai (pembacaan dibatalkan). */
  discard: (job: ScanUpload) => void;
}

/** Menu yang punya fitur ini. */
export const canAutofill = (mod: ModuleDef) => mod.id === 'surat' || mod.id === 'keluar';

const ACCEPT = 'application/pdf,image/*';
type Done = { name: string; count: number; check: string[]; att: 'busy' | 'ok' | 'fail' };
const ATT = {
  busy: 'Berkas sedang dilampirkan. ',
  ok: 'Berkas sudah terlampir. ',
  fail: 'Berkas belum terlampir; tambahkan lewat Lampiran. ',
};
/** Sama dengan yang bisa dibaca dan dilampirkan: PDF atau foto. */
const readable = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name) || f.type.startsWith('image/');

export function PdfAutofill(props: AutofillProps) {
  const [file, setFile] = useState<File | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [drag, setDrag] = useState(false);
  const [wrong, setWrong] = useState('');
  // Bagian pembaca gagal dimuat (koneksi putus atau situs baru diperbarui): tawarkan muat ulang.
  const [broken, setBroken] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const mainBtn = useRef<HTMLButtonElement>(null);
  // Setelah langkah tinjau ditutup, fokus kembali ke tombol kartu ini bila fokusnya ikut hilang.
  const back = useRef(false);
  useEffect(() => {
    if (file || !back.current) return;
    back.current = false;
    const a = document.activeElement;
    if (!a || a === document.body) mainBtn.current?.focus();
  }, [file]);

  const choose = (f: File | null | undefined) => {
    if (!f) return;
    setDone(null);
    if (!readable(f)) return setWrong(f.name);
    setWrong('');
    setFile(f);
  };

  if (file) {
    return (
      <Guard
        onError={() => {
          // Lazy menyimpan hasil gagal: buat ulang agar percobaan berikutnya mengunduh lagi.
          Panel = load();
          setFile(null);
          setBroken(true);
        }}
      >
        <Suspense fallback={<Loading name={file.name} />}>
          <Panel
            {...props}
            file={file}
            onClose={(count, info) => {
              back.current = true;
              setFile(null);
              if (!info) return;
              const next: Done = { name: file.name, count, check: info.check, att: 'busy' };
              setDone(next);
              // Lampiran bisa selesai setelah langkah tinjau ditutup.
              info.attached.then((e) => setDone((d) => (d === next ? { ...d, att: e === null ? 'ok' : 'fail' } : d)));
            }}
          />
        </Suspense>
      </Guard>
    );
  }

  if (broken) {
    return (
      <div className="paf paf-entry paf-wrong" role="alert">
        <span className="paf-icon paf-warn" aria-hidden="true">
          <TriangleAlert size={18} />
        </span>
        <div className="paf-copy">
          <b>Fitur ini belum termuat. Muat ulang halaman.</b>
          <span className="paf-sub">
            Biasanya karena koneksi terputus atau aplikasi baru diperbarui. Isian yang sudah diketik tetap ada; simpan dulu
            bila tidak ingin mengetik ulang.
          </span>
        </div>
        <div className="paf-actions">
          <button ref={mainBtn} type="button" className="btn small" onClick={() => location.reload()}>
            <RefreshCw size={14} /> Muat ulang halaman
          </button>
        </div>
      </div>
    );
  }

  const what = props.mod.id === 'surat' ? 'Nomor, tanggal, pengirim, perihal, dan tujuan' : 'Nomor, tanggal, tujuan, dan perihal';
  // Saat berkas sedang diseret, pesan seret didahulukan. "kept": surat tak terbaca, berkasnya saja yang dilampirkan.
  const view = drag ? 'drag' : done ? (done.count ? 'done' : 'kept') : wrong ? 'wrong' : 'idle';
  return (
    <div
      className={'paf paf-entry' + (view === 'idle' ? '' : ' paf-' + view)}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes('Files')) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        choose(e.dataTransfer.files[0]);
      }}
    >
      <span className={'paf-icon' + (view === 'done' ? ' paf-ok' : view === 'wrong' ? ' paf-warn' : '')} aria-hidden="true">
        {view === 'done' ? (
          <Check size={18} strokeWidth={2.6} />
        ) : view === 'kept' ? (
          <Paperclip size={17} />
        ) : view === 'wrong' ? (
          <TriangleAlert size={18} />
        ) : (
          <ScanText size={19} />
        )}
      </span>
      <div className="paf-copy" aria-live="polite">
        {view === 'drag' ? (
          <>
            <b>Lepaskan untuk membaca surat</b>
            <span className="paf-sub">PDF atau foto (JPG/PNG)</span>
          </>
        ) : done ? (
          <>
            <b>{done.count ? `${done.count} isian terisi dari surat` : 'Lengkapi isian secara manual'}</b>
            <span className="paf-sub">
              {ATT[done.att]}
              {!done.count ? null : done.check.length ? (
                <span className="paf-recheck">Cek ulang {quoteList(done.check)}.</span>
              ) : (
                'Periksa lagi sebelum menyimpan.'
              )}
            </span>
            <span className="paf-sub paf-name">
              <span className="paf-file" title={done.name}>
                {done.name}
              </span>
            </span>
          </>
        ) : wrong ? (
          <>
            <b>Berkas ini tidak bisa dibaca</b>
            <span className="paf-sub">
              <span className="paf-file">{wrong}</span> bukan PDF atau foto. Pilih surat dalam bentuk PDF, JPG, atau PNG.
            </span>
          </>
        ) : (
          <>
            <b>Isi dari PDF / foto surat</b>
            <span className="paf-sub">{what} terisi otomatis. Berkasnya sekaligus jadi lampiran.</span>
          </>
        )}
      </div>
      <div className="paf-actions">
        <button type="button" className="btn small paf-cam" onClick={() => camRef.current?.click()} aria-label="Foto surat">
          <Camera size={15} />
        </button>
        <button
          ref={mainBtn}
          type="button"
          className={done ? 'btn small' : 'pill-btn paf-pick'}
          onClick={() => pickRef.current?.click()}
        >
          <FileUp size={15} /> {done ? 'Baca surat lain' : 'Pilih berkas'}
        </button>
      </div>
      <input ref={pickRef} type="file" accept={ACCEPT} hidden onChange={(e) => (choose(e.target.files?.[0]), (e.target.value = ''))} />
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => (choose(e.target.files?.[0]), (e.target.value = ''))}
      />
    </div>
  );
}

/** Tampilan sementara selama bagian pembaca dimuat. */
export function Loading({ name }: { name: string }) {
  return (
    <div className="paf paf-work" role="status">
      <span className="paf-icon paf-busy" aria-hidden="true">
        <ScanText size={19} />
      </span>
      <div className="paf-copy">
        <b>Membuka berkas…</b>
        <span className="paf-sub paf-file">{name}</span>
        <span className="paf-bar">
          <span style={{ width: '2%' }} />
        </span>
      </div>
    </div>
  );
}
