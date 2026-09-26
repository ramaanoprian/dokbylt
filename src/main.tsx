import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DronePublic, isDroneRoute } from './DronePublic';
import { ToastProvider } from './toast';
import '@fontsource-variable/inter';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      {/* Formulir pinjam drone dibuka unit tanpa login. */}
      {isDroneRoute() ? <DronePublic /> : <App />}
    </ToastProvider>
  </StrictMode>,
);
