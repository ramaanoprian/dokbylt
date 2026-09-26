import { useState } from 'react';
import type { ModuleDef } from './modules';
import type { DocRecord } from './store';
import { newId, type HistoryEntry } from './store';
import { fmtDateTime, today } from './util';

interface Props {
  mod: ModuleDef;
  record?: DocRecord;
  /** Tahap tujuan bila form dibuka karena ada field wajib yang belum terisi. */
  targetStatus?: string;
  onSave: (r: DocRecord) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function RecordForm({ mod, record, targetStatus, onSave, onDelete, onClose }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (record) return { ...record.values };
    const init: Record<string, string> = {};
    for (const f of mod.fields) if (f.type === 'date') init[f.key] = today();
    return init;
  });
  const [status, setStatus] = useState(targetStatus ?? record?.status ?? mod.statuses[0]);

  const needed = new Set([
    ...mod.fields.filter((f) => f.required).map((f) => f.key),
    ...mod.statuses
      .slice(0, mod.statuses.indexOf(status) + 1)
      .flatMap((s) => mod.requiredForStatus?.[s] ?? []),
  ]);
  const missing = mod.fields.filter((f) => needed.has(f.key) && !values[f.key]?.trim());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (missing.length) return;
    const now = new Date().toISOString();
    const history: HistoryEntry[] = record ? [...record.history] : [];
    if (!record || record.status !== status) history.push({ status, at: now });
    onSave({
      id: record?.id ?? newId(),
      createdAt: record?.createdAt ?? now,
      updatedAt: now,
      status,
      history,
      values,
    });
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit}>
        <header className="modal-head">
          <h2>
            {record ? 'Ubah' : 'Tambah'} {mod.itemName}
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            ✕
          </button>
        </header>
        {targetStatus && missing.length > 0 && (
          <p className="notice">
            Lengkapi {missing.map((f) => f.label.toLowerCase()).join(', ')} untuk memindahkan ke tahap “{targetStatus}”.
          </p>
        )}
        <div className="form-grid">
          {mod.fields.map((f) => (
            <label key={f.key} className={f.type === 'textarea' ? 'full' : ''}>
              <span>
                {f.label}
                {needed.has(f.key) && <em className="req">*</em>}
              </span>
              {f.type === 'select' ? (
                <select value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                  <option value="">— pilih —</option>
                  {f.options!.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea
                  rows={3}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
              ) : (
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  min={f.type === 'number' ? 0 : undefined}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
              )}
            </label>
          ))}
          <label className="full">
            <span>Tahap</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {mod.statuses.map((s, i) => (
                <option key={s} value={s}>
                  {i + 1}. {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        {record && record.history.length > 0 && (
          <div className="history">
            <h3>Riwayat</h3>
            <ol>
              {record.history.map((h, i) => (
                <li key={i}>
                  <b>{h.status}</b> · {fmtDateTime(h.at)}
                </li>
              ))}
            </ol>
          </div>
        )}
        <footer className="modal-foot">
          {onDelete && (
            <button
              type="button"
              className="btn danger"
              onClick={() => confirm(`Hapus ${mod.itemName} ini?`) && onDelete()}
            >
              Hapus
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn primary" disabled={missing.length > 0}>
            Simpan
          </button>
        </footer>
      </form>
    </div>
  );
}
