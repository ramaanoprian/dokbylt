import { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Send, X } from 'lucide-react';
import { callFunction, type DataStore } from './backend';
import { exportAll } from './excel';
import { fmtDate } from './util';

interface Props {
  data: DataStore;
  onClose: () => void;
}

interface BackupFile {
  name: string;
  size: number;
  url: string;
}

const kb = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

/** Rekap WA pagi (fungsi "rekap-harian") dan file cadangan harian di server, plus salinan Excel ke perangkat. */
export function BackupDialog({ data, onClose }: Props) {
  const [files, setFiles] = useState<BackupFile[] | null>(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(
    () =>
      callFunction('rekap-harian', { action: 'cadangan' }).then((r) =>
        r.ok ? setFiles((r.data.files as BackupFile[]) ?? []) : (setErr(r.error), setFiles([])),
      ),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onClose]);

  const sendNow = async () => {
    setSending(true);
    setErr('');
    setNote('');
    const r = await callFunction('rekap-harian', { force: true });
    setSending(false);
    if (r.ok) {
      setNote('Rekap terkirim ke WA Unit Dokumen, dan cadangan hari ini diperbarui.');
      load();
    } else setErr(`Rekap belum terkirim: ${r.error}`);
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet narrow" role="dialog" aria-modal="true" aria-label="Rekap dan cadangan">
        <header className="sheet-head">
          <div>
            <p className="eyebrow">Pengaturan</p>
            <h2>Rekap & cadangan</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            <X size={20} />
          </button>
        </header>
        <div className="sheet-body backup">
          <section>
            <h3>Rekap WA pagi</h3>
            <p className="muted small">
              Senin sampai Jumat pukul 07.30, nomor-nomor Unit Dokumen menerima ringkasan: yang lewat tenggat, yang menunggu
              TTD EVP, paket yang belum ada resinya, dan pengajuan unit yang belum diproses.
            </p>
            <button type="button" className="btn" onClick={sendNow} disabled={sending}>
              {sending ? <Loader2 size={16} className="spin" /> : <Send size={16} />} Kirim rekap sekarang
            </button>
          </section>
          {note && <p className="notice ok">{note}</p>}
          {err && <p className="notice">{err}</p>}

          <section>
            <h3>Cadangan otomatis di server</h3>
            <p className="muted small">
              Seluruh data dan riwayat disalin setiap pagi hari kerja, disimpan 30 hari. Dipakai untuk memulihkan data yang
              terhapus atau salah ubah.
            </p>
            {!files ? (
              <p className="muted small">
                <Loader2 size={14} className="spin" /> Memuat…
              </p>
            ) : files.length === 0 ? (
              <p className="muted small">Belum ada cadangan.</p>
            ) : (
              <ul className="backup-list">
                {files.slice(0, 10).map((f) => {
                  const day = f.name.match(/\d{4}-\d{2}-\d{2}/)?.[0];
                  return (
                    <li key={f.name}>
                      <span className="grow">
                        <b className="block">{day ? fmtDate(day) : f.name}</b>
                        <span className="muted small">{kb(f.size)}</span>
                      </span>
                      <a className="btn" href={f.url} download={f.name}>
                        <Download size={16} /> Unduh
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h3>Salinan di perangkat Anda</h3>
            <p className="muted small">
              Cadangan server ikut hilang bila akun Supabase bermasalah. Unduh Excel semua menu seminggu sekali dan simpan di
              Google Drive atau komputer kantor.
            </p>
            <button type="button" className="pill-btn" onClick={() => exportAll(data)}>
              <FileSpreadsheet size={16} /> Unduh Excel semua menu
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
