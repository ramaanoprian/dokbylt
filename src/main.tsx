import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DronePublic, isDroneRoute } from './DronePublic';
import { DocPublic, isDocRoute } from './DocPublic';
import { ToastProvider } from './toast';
import '@fontsource-variable/inter';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      {/* Formulir pinjam drone dan pendaftaran dokumen dibuka unit tanpa login. */}
      {isDroneRoute() ? <DronePublic /> : isDocRoute() ? <DocPublic /> : <App />}
    </ToastProvider>
  </StrictMode>,
);
