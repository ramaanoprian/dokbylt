import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { Copy, Printer, QrCode, X } from 'lucide-react';
import { useToast } from './toast';

/** QR formulir publik (pinjam drone, daftar dokumen TTD EVP) yang bisa dicetak dan ditempel. */
export interface QrForm {
  hash: string;
  /** Judul di kertas cetak, mis. "Pinjam drone". */
  title: string;
  /** Petunjuk di jendela, mis. tempat menempel QR. */
  hint: string;
}

export const QR_FORMS: Partial<Record<string, QrForm>> = {
  drone: {
    hash: 'pinjam-drone',
    title: 'Pinjam drone',
    hint: 'Cetak dan tempel di unit atau di kotak drone. Unit cukup scan lalu isi formulir, tanpa login.',
  },
  evp: {
    hash: 'daftar-dokumen',
    title: 'Daftar dokumen TTD EVP',
    hint: 'Cetak dan tempel di meja Unit Dokumen atau di unit. Pengantar scan lalu mendaftarkan berkasnya sebelum menyerahkan dokumen.',
  },
};

export function FormQrButton({ form }: { form: QrForm }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="lnav-link" onClick={() => setOpen(true)}>
        <QrCode size={15} /> <span className="hide-sm">QR formulir</span>
      </button>
      {/* Di luar bilah menu: bilah itu memakai blur, yang membuat jendela ikut terpotong. */}
      {open && createPortal(<QrDialog form={form} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function QrDialog({ form, onClose }: { form: QrForm; onClose: () => void }) {
  const [img, setImg] = useState('');
  const toast = useToast();
  const url = `${location.origin}${location.pathname}#${form.hash}`;

  useEffect(() => {
    QRCode.toDataURL(url, { width: 640, margin: 1, errorCorrectionLevel: 'M' }).then(setImg);
  }, [url]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [onClose]);

  const print = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>QR ${form.title}</title>
<style>body{font-family:Inter,system-ui,sans-serif;text-align:center;padding:48px;color:#1d1d1f}
h1{font-size:34px;margin:0 0 6px;letter-spacing:-.02em}p{margin:0;color:#6e6e73;font-size:18px}
img{width:360px;height:360px;margin:32px 0 20px}small{font-size:14px;color:#6e6e73}</style>
<h1>${form.title}</h1><p>Scan untuk mengisi formulir</p>
<img src="${img}" alt=""><br><small>${url}</small><br><br><small>Unit Dokumen · Balai Yasa Lahat</small>
<script>onload=()=>{print()}</script>`);
    w.document.close();
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet narrow qr-sheet" role="dialog" aria-modal="true" aria-label={`QR formulir ${form.title.toLowerCase()}`}>
        <header className="sheet-head">
          <div>
            <h2>QR formulir.</h2>
            <p className="muted">{form.hint}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup">
            <X size={20} />
          </button>
        </header>
        <div className="sheet-body qr-body">
          {img ? <img src={img} alt={`QR formulir ${form.title.toLowerCase()}`} /> : <div className="qr-ph" />}
          <code>{url}</code>
        </div>
        <footer className="sheet-foot">
          <button
            className="btn"
            onClick={() =>
              navigator.clipboard.writeText(url).then(
                () => toast('Tautan formulir disalin'),
                () => toast('Tautan tidak bisa disalin'),
              )
            }
          >
            <Copy size={15} /> Salin tautan
          </button>
          <span className="grow" />
          <button className="pill-btn" onClick={print} disabled={!img}>
            <Printer size={14} /> Cetak QR
          </button>
        </footer>
      </div>
    </div>
  );
}
