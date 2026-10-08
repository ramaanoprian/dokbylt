// Tombol "Isi dari PDF / foto surat" di form Surat Masuk dan Surat Keluar. Bagian ini sengaja kecil:
// pembaca PDF, OCR, dan langkah tinjau baru dimuat saat berkas dipilih.
import { lazy, Suspense, useRef, useState } from 'react';
import { Camera, Check, FileUp, ScanText, TriangleAlert } from 'lucide-react';
import type { ModuleDef } from '../modules';
import './pdfAutofill.css';

const Panel = lazy(() => import('./Panel'));

export interface AutofillProps {
  mod: ModuleDef;
  /** Isian form saat ini; yang sudah terisi tidak dicentang di langkah tinjau. */
  values: Record<string, string>;
  /** Nilai bawaan form baru (tanggal hari ini); boleh diganti seperti isian kosong. */
  defaults: Record<string, string>;
  onApply: (patch: Record<string, string>) => void;
  /** Lampirkan berkas ke data ini. Hasilnya null bila berhasil, atau pesan galat. */
  attach: (file: File) => Promise<string | null>;
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
  const pickRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const choose = (f: File | null | undefined) => {
    if (!f) return;
    setDone(null);
    if (!readable(f)) return setWrong(f.name);
    setWrong('');
    setFile(f);
  };

  if (file) {
    return (
      <Suspense fallback={<Loading name={file.name} />}>
        <Panel
          {...props}
          file={file}
          onClose={(count, info) => {
            setFile(null);
            if (!count) return;
            const next: Done = { name: file.name, count, check: info?.check ?? [], att: 'busy' };
            setDone(next);
            // Lampiran bisa selesai setelah langkah tinjau ditutup.
            info?.attached.then((e) => setDone((d) => (d === next ? { ...d, att: e === null ? 'ok' : 'fail' } : d)));
          }}
        />
      </Suspense>
    );
  }

  const what = props.mod.id === 'surat' ? 'Nomor, tanggal, pengirim, perihal, dan tujuan' : 'Nomor, tanggal, tujuan, dan perihal';
  // Saat berkas sedang diseret, pesan seret didahulukan.
  const view = drag ? 'drag' : done ? 'done' : wrong ? 'wrong' : 'idle';
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
        {view === 'done' ? <Check size={18} strokeWidth={2.6} /> : view === 'wrong' ? <TriangleAlert size={18} /> : <ScanText size={19} />}
      </span>
      <div className="paf-copy" aria-live="polite">
        {view === 'drag' ? (
          <>
            <b>Lepaskan untuk membaca surat</b>
            <span className="paf-sub">PDF atau foto (JPG/PNG)</span>
          </>
        ) : done ? (
          <>
            <b>{done.count} isian terisi dari surat</b>
            <span className="paf-sub">
              {ATT[done.att]}
              {done.check.length ? (
                <span className="paf-recheck">Cek ulang {new Intl.ListFormat('id').format(done.check).toLowerCase()}.</span>
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
        <button type="button" className={done ? 'btn small' : 'pill-btn paf-pick'} onClick={() => pickRef.current?.click()}>
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
