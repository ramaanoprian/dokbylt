import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileUp, X } from 'lucide-react';
import type { ModuleDef } from './modules';
import type { DocRecord } from './backend';
import { exportCsv } from './util';
import { downloadTemplate, exportXlsx, readImportFile, type ImportResult } from './excel';

interface Props {
  mod: ModuleDef;
  rows: DocRecord[];
  userName: string;
  onImport: (recs: DocRecord[]) => Promise<string | null>;
}

/** Tombol "Data": unduh Excel/CSV, impor dari Excel, dan unduh contoh file impor. */
export function DataMenu({ mod, rows, userName, onImport }: Props) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    addEventListener('mousedown', on);
    return () => removeEventListener('mousedown', on);
  }, [open]);

  const pick = async (file: File) => {
    setErr('');
    setBusy(true);
    try {
      setResult(await readImportFile(file, mod, userName));
    } catch {
      setErr('File tidak bisa dibaca. Gunakan file .xlsx atau .csv.');
    }
    setBusy(false);
  };

  const confirm = async () => {
    if (!result) return;
    setBusy(true);
    const e = await onImport(result.records);
    setBusy(false);
    if (e) setErr(e);
    else setResult(null);
  };

  const item = (icon: React.ReactNode, text: string, run: () => void) => (
    <button
      type="button"
      onClick={() => {
        setOpen(false);
        run();
      }}
    >
      {icon}
      {text}
    </button>
  );

  return (
    <>
      <div className="menu-wrap" ref={ref}>
        <button className="lnav-link" onClick={() => setOpen(!open)} aria-expanded={open} title="Unduh atau impor data">
          <FileSpreadsheet size={15} className="only-mobile-inline" /> <span className="hide-sm">Ekspor / Impor</span>{' '}
          <ChevronDown size={13} className="hide-sm" />
        </button>
        {open && (
          <div className="menu-pop right" role="menu">
            {item(<FileSpreadsheet size={16} />, 'Unduh Excel (.xlsx)', () => exportXlsx(mod, rows))}
            {item(<Download size={16} />, 'Unduh CSV', () => exportCsv(mod, rows))}
            <hr />
            {item(<FileUp size={16} />, 'Impor dari Excel/CSV…', () => fileRef.current?.click())}
            {item(<Download size={16} />, 'Unduh contoh file impor', () => downloadTemplate(mod))}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pick(f);
            e.target.value = '';
          }}
        />
      </div>

      {(result || err) && (
        <div
          className="overlay"
          onMouseDown={(e) => e.target === e.currentTarget && !busy && (setResult(null), setErr(''))}
        >
          <div className="sheet narrow" role="dialog" aria-modal="true" aria-label="Impor data">
            <header className="sheet-head">
              <div>
                <p className="eyebrow">{mod.title}</p>
                <h2>Impor data</h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => (setResult(null), setErr(''))}
                aria-label="Tutup"
              >
                <X size={20} />
              </button>
            </header>
            <div className="sheet-body">
              {err && <p className="notice">{err}</p>}
              {result && (
                <>
                  <p className="import-count">
                    <b>{result.records.length}</b> {mod.itemName} siap diimpor
                    {result.skipped.length > 0 && `, ${result.skipped.length} baris dilewati`}.
                  </p>
                  {result.missingColumns.length > 0 && (
                    <p className="notice">
                      Kolom wajib tidak ditemukan: {result.missingColumns.join(', ')}. Samakan judul kolom dengan contoh
                      file impor.
                    </p>
                  )}
                  {result.records.length > 0 && (
                    <ul className="import-preview">
                      {result.records.slice(0, 5).map((r) => (
                        <li key={r.id}>
                          <b>{r.values.perihal || r.values.kegiatan || r.values.uraian || r.values.keperluan || r.values.tujuan || '–'}</b>
                          <span className="muted small">{r.status}</span>
                        </li>
                      ))}
                      {result.records.length > 5 && (
                        <li className="muted small">dan {result.records.length - 5} lainnya…</li>
                      )}
                    </ul>
                  )}
                  {result.skipped.length > 0 && (
                    <details className="import-details">
                      <summary>Baris yang dilewati</summary>
                      <ul>
                        {result.skipped.slice(0, 30).map((s) => (
                          <li key={s.row}>
                            Baris {s.row}: {s.reason}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {result.ignored.length > 0 && (
                    <p className="muted small">Kolom yang diabaikan: {result.ignored.join(', ')}.</p>
                  )}
                  <p className="muted small">
                    Pilihan yang tidak ada di daftar (misalnya jenis “KAK”) otomatis masuk sebagai “Lainnya” beserta
                    keterangannya. Kolom “Tahap” boleh dikosongkan; data akan masuk ke tahap pertama.
                  </p>
                </>
              )}
            </div>
            <footer className="sheet-foot">
              <span className="spacer" />
              <button type="button" className="btn" onClick={() => (setResult(null), setErr(''))} disabled={busy}>
                Batal
              </button>
              {result && (
                <button
                  type="button"
                  className="btn primary"
                  onClick={confirm}
                  disabled={busy || !result.records.length}
                >
                  {busy ? 'Mengimpor…' : `Impor ${result.records.length} data`}
                </button>
              )}
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
