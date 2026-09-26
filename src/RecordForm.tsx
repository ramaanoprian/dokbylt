import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { OTHER, otherKey, type ModuleDef } from './modules';
import { newId, type DocRecord, type HistoryEntry } from './backend';
import { daysUntil, dueLabel, dueTone, fmtDateTime, today } from './util';

interface Props {
  mod: ModuleDef;
  record?: DocRecord;
  userName: string;
  /** Tahap tujuan bila form dibuka karena ada isian wajib yang belum terisi. */
  targetStatus?: string;
  onSave: (r: DocRecord) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function RecordForm({ mod, record, userName, targetStatus, onSave, onDelete, onClose }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (record) return { ...record.values };
    const init: Record<string, string> = {};
    for (const f of mod.fields) if (f.type === 'date' && f.key !== 'tenggat') init[f.key] = today();
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
  const otherMissing = mod.fields.filter((f) => values[f.key] === OTHER && !values[otherKey(f.key)]?.trim());
  const blocked = missing.length + otherMissing.length > 0;
  const set = (k: string, v: string) => setValues({ ...values, [k]: v });

  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [onClose]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    // Buang keterangan "Lainnya" yang tidak lagi dipakai.
    const clean = { ...values };
    for (const f of mod.fields) if (clean[f.key] !== OTHER) delete clean[otherKey(f.key)];
    const now = new Date().toISOString();
    const history: HistoryEntry[] = record ? [...record.history] : [];
    if (!record || record.status !== status) history.push({ status, at: now, by: userName });
    onSave({
      id: record?.id ?? newId(),
      createdAt: record?.createdAt ?? now,
      updatedAt: now,
      createdBy: record?.createdBy ?? userName,
      updatedBy: userName,
      status,
      history,
      values: clean,
    });
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit} role="dialog" aria-modal="true" aria-label={`${record ? 'Ubah' : 'Tambah'} ${mod.itemName}`}>
        <header className="sheet-head">
          <div>
            <p className="eyebrow">{mod.title}</p>
            <h2>
              {record ? 'Ubah' : 'Tambah'} {mod.itemName}
            </h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            <X size={20} />
          </button>
        </header>

        <div className="sheet-body">
          {otherMissing.length > 0 && (
            <p className="notice">
              Anda memilih “Lainnya” pada {otherMissing.map((f) => f.label.toLowerCase()).join(', ')}. Sebutkan
              keterangannya sebelum menyimpan.
            </p>
          )}
          {targetStatus && missing.length > 0 && (
            <p className="notice">
              Lengkapi {missing.map((f) => f.label.toLowerCase()).join(', ')} untuk memindahkan ke tahap “
              {targetStatus}”.
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
                  <>
                    <select value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
                      <option value="">Pilih…</option>
                      {f.options!.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                    {values[f.key] === OTHER && (
                      <input
                        className="other-input"
                        autoFocus
                        required
                        placeholder={`Sebutkan ${f.label.toLowerCase()} lainnya`}
                        aria-label={`Sebutkan ${f.label.toLowerCase()} lainnya`}
                        value={values[otherKey(f.key)] ?? ''}
                        onChange={(e) => set(otherKey(f.key), e.target.value)}
                      />
                    )}
                  </>
                ) : f.type === 'textarea' ? (
                  <textarea rows={3} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
                ) : (
                  <input
                    autoFocus={!record && f === mod.fields.find((x) => x.type !== 'date')}
                    type={f.type}
                    placeholder={f.placeholder}
                    min={f.type === 'number' ? 0 : undefined}
                    value={values[f.key] ?? ''}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
                {f.key === 'tenggat' && values.tenggat && mod.statuses.indexOf(status) < mod.statuses.length - 1 && (
                  <span className={'due ' + dueTone(daysUntil(values.tenggat))}>{dueLabel(daysUntil(values.tenggat))}</span>
                )}
                {f.hint && <small className="hint">{f.hint}</small>}
              </label>
            ))}
          </div>

          <fieldset className="stepper">
            <legend>Tahap</legend>
            {mod.statuses.map((s, i) => (
              <label key={s} className={status === s ? 'on' : mod.statuses.indexOf(status) > i ? 'past' : ''}>
                <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} />
                <span className="dot">{i + 1}</span>
                <span>{s}</span>
              </label>
            ))}
          </fieldset>

          {record && record.history.length > 0 && (
            <div className="timeline">
              <h3>Riwayat tahap</h3>
              <ol>
                {[...record.history].reverse().map((h, i) => (
                  <li key={i}>
                    <b>{h.status}</b>
                    <span>
                      {fmtDateTime(h.at)}
                      {h.by && ` · ${h.by}`}
                    </span>
                  </li>
                ))}
              </ol>
              {record.createdBy && (
                <p className="muted small">
                  Dicatat oleh {record.createdBy}
                  {record.updatedBy && record.updatedBy !== record.createdBy && `, terakhir diubah oleh ${record.updatedBy}`}
                  .
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="sheet-foot">
          {onDelete && (
            <button
              type="button"
              className="btn ghost danger"
              onClick={onDelete}
            >
              Hapus
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn primary" disabled={blocked}>
            Simpan
          </button>
        </footer>
      </form>
    </div>
  );
}
