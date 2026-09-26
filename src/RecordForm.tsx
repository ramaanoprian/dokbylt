import { useEffect, useMemo, useState } from 'react';
import { Check, MessageCircle, Printer, X } from 'lucide-react';
import { OTHER, firstStatus, otherKey, type ModuleDef } from './modules';
import { attachmentsOf, newId, type DocRecord, type HistoryEntry } from './backend';
import { daysUntil, defaultDue, notifyUrl, dueLabel, dueTone, emailOf, fmtDateTime, resiMessage, today, waNumber } from './util';
import { Icon } from './icons';
import { stageClass } from './stats';
import { Attachments, type FileApi } from './Attachments';
import { printDisposition, printReceipt } from './print';

interface Props {
  mod: ModuleDef;
  /** Semua data menu ini, untuk mengingat nomor WA tiap PIC. */
  rows?: DocRecord[];
  record?: DocRecord;
  userName: string;
  /** Tahap tujuan bila form dibuka karena ada isian wajib yang belum terisi. */
  targetStatus?: string;
  onSave: (r: DocRecord) => void;
  onDelete?: () => void;
  onClose: () => void;
  files: FileApi;
}

export function RecordForm({ mod, rows = [], record, userName, targetStatus, onSave, onDelete, onClose, files }: Props) {
  // Id dibuat di awal agar lampiran bisa diunggah sebelum data disimpan.
  const [id] = useState(() => record?.id ?? newId());
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (record) return { ...record.values };
    const init: Record<string, string> = {};
    for (const f of mod.fields) if (f.type === 'date' && f.key !== 'tenggat') init[f.key] = today();
    const due = defaultDue(mod, init);
    if (due) init.tenggat = due;
    return init;
  });
  // Tenggat mengikuti tanggal utama sampai diubah sendiri oleh pengguna.
  const [dueAuto, setDueAuto] = useState(() => !record || (!record.values.tenggat && !!mod.dueDays));
  const [status, setStatus] = useState(targetStatus ?? record?.status ?? firstStatus(mod));

  const needed = new Set([
    ...mod.fields.filter((f) => f.required).map((f) => f.key),
    ...mod.statuses
      .slice(0, mod.statuses.indexOf(status) + 1)
      .flatMap((s) => mod.requiredForStatus?.[s] ?? []),
  ]);
  const missing = mod.fields.filter((f) => needed.has(f.key) && !values[f.key]?.trim());
  const otherMissing = mod.fields.filter((f) => values[f.key] === OTHER && !values[otherKey(f.key)]?.trim());
  const blocked = missing.length + otherMissing.length > 0;
  // Buku kontak PIC dari data sebelumnya: nama → nomor WA terakhir yang dipakai.
  const contacts = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; unit: string }>();
    const sorted = [...rows].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    for (const r of sorted) {
      const name = r.values.pic?.trim();
      const phone = r.values.kontakPic?.trim();
      if (name && phone) map.set(name.toLowerCase(), { name, phone, unit: r.values.unit ?? '' });
    }
    return map;
  }, [rows]);
  const [phoneAuto, setPhoneAuto] = useState(false);

  const set = (k: string, v: string) => {
    const next = { ...values, [k]: v };
    if (k === 'kontakPic') setPhoneAuto(false);
    // Nama PIC yang sudah dikenal: isi nomornya (dan unit bila kosong) otomatis.
    if (k === 'pic' && mod.fields.some((f) => f.key === 'kontakPic')) {
      const c = contacts.get(v.trim().toLowerCase());
      if (c && (!values.kontakPic?.trim() || phoneAuto)) {
        next.kontakPic = c.phone;
        if (!next.unit && c.unit) next.unit = c.unit;
        setPhoneAuto(true);
      } else if (!c && phoneAuto) {
        next.kontakPic = '';
        setPhoneAuto(false);
      }
    }
    if (k === 'tenggat') setDueAuto(false);
    else if (k === mod.dateField && dueAuto && mod.fields.some((f) => f.key === 'tenggat')) {
      const due = defaultDue(mod, next);
      if (due) next.tenggat = due;
    }
    setValues(next);
  };

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
    if (!clean.lampiran || clean.lampiran === '[]') delete clean.lampiran;
    // Hapus dari penyimpanan berkas yang dibuang dari daftar lampiran.
    const kept = new Set(attachmentsOf(clean).map((a) => a.path));
    for (const a of attachmentsOf(record?.values ?? {})) if (!kept.has(a.path)) files.remove(a.path);
    const now = new Date().toISOString();
    const history: HistoryEntry[] = record ? [...record.history] : [];
    if (!record || record.status !== status) history.push({ status, at: now, by: userName });
    onSave({
      id,
      createdAt: record?.createdAt ?? now,
      updatedAt: now,
      createdBy: record?.createdBy ?? userName,
      updatedBy: userName,
      status,
      history,
      values: clean,
    });
  };

  const wa = waNumber(values.kontak);
  const mail = emailOf(values.kontak);
  const canSendResi = mod.id === 'pos' && !!values.resi?.trim() && !!(wa || mail);
  const sendResi = () => {
    const text = resiMessage(values);
    if (wa) window.open(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`, '_blank');
    else location.href = `mailto:${mail}?subject=${encodeURIComponent('Nomor resi kiriman')}&body=${encodeURIComponent(text)}`;
    // Resi sudah dikirim ke user: majukan tahap bila belum.
    const last = mod.statuses[mod.statuses.length - 1];
    if (mod.statuses.indexOf(status) < mod.statuses.indexOf(last)) setStatus(last);
  };
  const current = (): DocRecord => ({ ...(record as DocRecord), id, status, values });

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="sheet record-form"
        data-mod={mod.id}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={`${record ? 'Ubah' : 'Tambah'} ${mod.itemName}`}
      >
        <header className="sheet-head">
          <span className="app-icon">
            <Icon name={mod.icon} size={18} />
          </span>
          <div className="grow">
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
          <fieldset className="stepper">
            <legend>Tahap</legend>
            {mod.statuses.map((s, i) => {
              const cur = mod.statuses.indexOf(status);
              return (
                <label key={s} className={(status === s ? 'on ' : cur > i ? 'past ' : '') + stageClass(mod, s)}>
                  <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} />
                  <span className="dot">{cur > i ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
                  <span className="step-label">{s}</span>
                </label>
              );
            })}
          </fieldset>
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
                    list={f.key === 'pic' && contacts.size ? 'pic-contacts' : undefined}
                    autoComplete={f.key === 'pic' ? 'off' : undefined}
                    value={values[f.key] ?? ''}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
                {f.key === 'tenggat' && values.tenggat && mod.statuses.indexOf(status) < mod.statuses.length - 1 && (
                  <span className={'due ' + dueTone(daysUntil(values.tenggat))}>{dueLabel(daysUntil(values.tenggat))}</span>
                )}
                {f.key === 'pic' && contacts.size > 0 && (
                  <datalist id="pic-contacts">
                    {[...contacts.values()].map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.unit ? `${c.unit} · ` : ''}
                        {c.phone}
                      </option>
                    ))}
                  </datalist>
                )}
                {f.key === 'kontakPic' && phoneAuto ? (
                  <small className="hint ok">Terisi otomatis dari data {values.pic} sebelumnya.</small>
                ) : f.key === 'tenggat' && dueAuto && values.tenggat && mod.dueDays ? (
                  <small className="hint">
                    Otomatis {mod.dueDays} hari kerja setelah {mod.fields.find((x) => x.key === mod.dateField)?.label.toLowerCase()}
                    , bisa diubah.
                  </small>
                ) : (
                  f.hint && <small className="hint">{f.hint}</small>
                )}
              </label>
            ))}
          </div>

          {mod.id === 'pos' && (
            <div className="resi-box">
              <div className="grow">
                <b>Kirim resi ke pengirim</b>
                <span className="muted small block">
                  {canSendResi
                    ? `Lewat ${wa ? 'WhatsApp' : 'email'} ke ${values.pengirim || (wa ? '+' + wa : mail)}. Tahap otomatis jadi “${mod.statuses[mod.statuses.length - 1]}”; simpan setelahnya.`
                    : 'Isi nomor resi dan kontak pengirim (nomor WA atau email) untuk mengirim resi.'}
                </span>
              </div>
              <button type="button" className="btn wa" onClick={sendResi} disabled={!canSendResi}>
                <MessageCircle size={16} /> {mail && !wa ? 'Kirim email' : 'Kirim via WA'}
              </button>
            </div>
          )}

          {mod.notifyStatus && (
            <div className="resi-box">
              <div className="grow">
                <b>Kabari PIC unit</b>
                <span className="muted small block">
                  {!waNumber(values.kontakPic)
                    ? 'Isi No. WA PIC unit agar PIC dikabari otomatis saat dokumen diterima dan saat sudah ditandatangani EVP.'
                    : mod.statuses.indexOf(status) < mod.statuses.indexOf(mod.notifyStatus)
                      ? `WA terkirim otomatis ke ${values.pic || 'PIC'} saat tahap jadi “${mod.notifyStatus}”.`
                      : `Kirim ulang kabar ke ${values.pic || 'PIC'} lewat WhatsApp Anda bila perlu.`}
                </span>
              </div>
              <button
                type="button"
                className="btn wa"
                disabled={!waNumber(values.kontakPic) || mod.statuses.indexOf(status) < mod.statuses.indexOf(mod.notifyStatus)}
                onClick={() => window.open(notifyUrl([values]), '_blank')}
              >
                <MessageCircle size={16} /> Kirim via WA
              </button>
            </div>
          )}

          <Attachments
            folder={`${mod.id}/${id}`}
            items={attachmentsOf(values)}
            userName={userName}
            files={files}
            onChange={(list) => set('lampiran', JSON.stringify(list))}
          />


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
          {record && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => (mod.id === 'surat' ? printDisposition(mod, current()) : printReceipt(mod, current()))}
              title={mod.id === 'surat' ? 'Cetak lembar disposisi' : 'Cetak tanda terima'}
            >
              <Printer size={16} /> <span className="hide-sm">{mod.id === 'surat' ? 'Disposisi' : 'Tanda terima'}</span>
            </button>
          )}
          {record && mod.id === 'surat' && (
            <button type="button" className="btn ghost" onClick={() => printReceipt(mod, current())} title="Cetak tanda terima">
              <Printer size={16} /> <span className="hide-sm">Tanda terima</span>
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="pill-btn big" disabled={blocked}>
            Simpan
          </button>
        </footer>
      </form>
    </div>
  );
}
