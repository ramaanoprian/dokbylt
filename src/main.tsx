import { Component, StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DronePublic, isDroneRoute } from './DronePublic';
import { DocPublic, isDocRoute } from './DocPublic';
import { PosPublic, isPosRoute } from './PosPublic';
import { TrackPublic, isTrackRoute } from './TrackPublic';
import { ToastProvider } from './toast';
import '@fontsource-variable/inter';
import './styles.css';
import { startMotion } from './motion';

startMotion();

/** Halaman yang dibuka sesuai alamat: formulir dan halaman lacak publik dibuka unit (dan kurir) tanpa login. */
const pageOf = () =>
  isTrackRoute() ? 'lacak' : isDroneRoute() ? 'drone' : isDocRoute() ? 'dokumen' : isPosRoute() ? 'paket' : 'app';

function Root() {
  const [page, setPage] = useState(pageOf);
  // Tautan di dalam halaman publik (mis. "Lacak" setelah mendaftar) cukup mengganti alamat #.
  useEffect(() => {
    const on = () => setPage(pageOf());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  if (page === 'lacak') return <TrackPublic />;
  if (page === 'drone') return <DronePublic />;
  if (page === 'dokumen') return <DocPublic />;
  if (page === 'paket') return <PosPublic />;
  return <App />;
}

/** Galat yang tidak tertangkap di mana pun: tampilkan layar muat ulang, bukan halaman kosong. */
class Crash extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h1>Halaman belum bisa ditampilkan.</h1>
        <p>
          Biasanya karena koneksi terputus atau aplikasi baru saja diperbarui. Muat ulang halaman untuk memakai versi terbaru;
          data yang sudah tersimpan tetap aman.
        </p>
        <button type="button" className="pill-btn big" onClick={() => location.reload()} autoFocus>
          Muat ulang halaman
        </button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Crash>
      <ToastProvider>
        <Root />
      </ToastProvider>
    </Crash>
  </StrictMode>,
);
