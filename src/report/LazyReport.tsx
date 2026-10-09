import { Component, Suspense, lazy, useCallback, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type Dialog from './ReportDialog';

type Props = ComponentProps<typeof Dialog>;

// Laporan bulanan dimuat saat dibuka saja agar aplikasi tetap ringan.
const load = () => lazy(() => import('./ReportDialog'));
let ReportDialog = load();

/** Menangkap kegagalan memuat atau menampilkan dialog agar seluruh aplikasi tidak ikut kosong. */
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

/** Pemuat dialog laporan. Bila berkas dialog gagal diunduh (koneksi putus atau situs baru diperbarui), tampil pesan. */
export function ReportLoader(props: Props) {
  const [failed, setFailed] = useState(false);

  const onError = useCallback(() => {
    // Lazy menyimpan hasil gagal: buat ulang agar dibuka berikutnya mencoba mengunduh lagi.
    ReportDialog = load();
    setFailed(true);
  }, []);

  // Chrome mengingat impor yang gagal sampai halaman dimuat ulang, jadi tawarkan muat ulang, bukan coba lagi.
  if (failed) return <LoadFailed onClose={props.onClose} />;
  return (
    <Guard onError={onError}>
      <Suspense fallback={null}>
        <ReportDialog {...props} />
      </Suspense>
    </Guard>
  );
}

function LoadFailed({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="sheet narrow"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="rp-fail-title"
        aria-describedby="rp-fail-desc"
      >
        <header className="sheet-head">
          <div>
            <p className="eyebrow">Laporan</p>
            <h2 id="rp-fail-title">Laporan belum bisa dibuka</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            <X size={20} />
          </button>
        </header>
        <div className="sheet-body">
          <p id="rp-fail-desc" className="muted">
            Bagian laporan gagal dimuat, biasanya karena koneksi terputus atau aplikasi baru saja diperbarui. Muat ulang
            halaman untuk memakai versi terbaru. Data Anda tetap aman.
          </p>
        </div>
        <footer className="sheet-foot">
          <button type="button" className="btn" onClick={onClose}>
            Tutup
          </button>
          <span className="grow" />
          <button type="button" className="pill-btn" onClick={() => location.reload()} autoFocus>
            <RefreshCw size={15} /> Muat ulang halaman
          </button>
        </footer>
      </div>
    </div>
  );
}
