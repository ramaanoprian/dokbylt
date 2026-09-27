import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DronePublic, isDroneRoute } from './DronePublic';
import { DocPublic, isDocRoute } from './DocPublic';
import { PosPublic, isPosRoute } from './PosPublic';
import { ToastProvider } from './toast';
import '@fontsource-variable/inter';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      {/* Formulir pinjam drone, pendaftaran dokumen, dan kirim paket dibuka unit (dan kurir) tanpa login. */}
      {isDroneRoute() ? <DronePublic /> : isDocRoute() ? <DocPublic /> : isPosRoute() ? <PosPublic /> : <App />}
    </ToastProvider>
  </StrictMode>,
);
