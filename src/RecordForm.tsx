import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, MessageCircle, Printer, X } from 'lucide-react';
import { OTHER, firstStatus, otherKey, stageNeeds, type ModuleDef } from './modules';
import { attachmentsOf, newId, type DocRecord, type HistoryEntry } from './backend';
import { trackCode } from './track';
import { daysUntil, defaultDue, notifyUrl, dueLabel, dueTone, emailOf, fmtDateTime, quoteList, resiMessage, today, waNumber } from './util';
import { Icon } from './icons';
import { stageClass } from './stats';
import { Attachments, uploadAttachment, type FileApi } from './Attachments';
import { printDisposition, printReceipt } from './print';
import { PdfAutofill, canAutofill, type ScanUpload } from './pdfAutofill';

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

/** Pasangan field nama → field nomor WA yang diisi otomatis dari data sebelumnya. */
const CONTACT_PAIRS: Record<string, string> = { pic: 'kontakPic', kurir: 'kontakKurir', pengirim: 'kontak' };

export function RecordForm({ mod, rows = [], record, userName, targetStatus, onSave, onDelete, onClose, files }: Props) {
  // Id dibuat di awal agar lampiran bisa diunggah sebelum data disimpan.
  const [id] = useState(() => record?.id ?? newId());
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (record) return { ...record.values };
    const init: Record<string, string> = {};
    for (const f of mod.fields) if (f.type === 'date' && f.key !== 'tenggat' && !f.blank) init[f.key] = today();
    const due = defaultDue(mod, init);
    if (due) init.tenggat = due;
    return init;
  });
  // Tenggat mengikuti tanggal utama sampai diubah sendiri oleh pengguna.
  const [dueAuto, setDueAuto] = useState(() => !record || (!record.values.tenggat && !!mod.dueDays));
  const [status, setStatus] = useState(targetStatus ?? record?.status ?? firstStatus(mod));

  const needed = new Set([...mod.fields.filter((f) => f.required).map((f) => f.key), ...stageNeeds(mod, status, record)]);
  const missing = mod.fields.filter((f) => needed.has(f.key) && !values[f.key]?.trim());
  const otherMissing = mod.fields.filter((f) => values[f.key] === OTHER && !values[otherKey(f.key)]?.trim());
  const blocked = missing.length + otherMissing.length > 0;
  // Fokus awal hanya dengan mouse/trackpad: di HP keyboard akan menutupi kartu "Isi dari PDF / foto surat".
  const [fine] = useState(() => matchMedia('(pointer: fine)').matches);
  // Dibuka untuk pindah tahap tetapi ada isian wajib yang kosong: gulir ke isian pertama itu dan fokuskan.
  const formRef = useRef<HTMLFormElement>(null);
  const [firstMissing] = useState(() => (targetStatus ? missing[0]?.key : undefined));
  useEffect(() => {
    // Tanpa fokus awal (HP), fokus tetap dipindah ke dalam dialog tanpa memunculkan keyboard.
    if (!firstMissing) {
      if (!fine) formRef.current?.focus({ preventScroll: true });
      return;
    }
    const el = formRef.current?.querySelector<HTMLElement>(`[data-key="${firstMissing}"] :is(input, select, textarea)`);
    el?.scrollIntoView({ block: 'center' });
    el?.focus({ preventScroll: true });
  }, [firstMissing, fine]);
  // Buku kontak dari data sebelumnya (PIC, kurir, pemohon): nama → nomor WA terakhir yang dipakai.
  const pairs = useMemo(
    () => Object.entries(CONTACT_PAIRS).filter(([n, p]) => mod.fields.some((f) => f.key === n) && mod.fields.some((f) => f.key === p)),
    [mod],
  );
  const contacts = useMemo(() => {
    const out = new Map<string, Map<string, { name: string; phone: string; unit: string }>>();
    const sorted = [...rows].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    for (const [nameKey, phoneKey] of pairs) {
      const map = new Map<string, { name: string; phone: string; unit: string }>();
      for (const r of sorted) {
        const name = r.values[nameKey]?.trim();
        const phone = r.values[phoneKey]?.trim();
        if (name && phone) map.set(name.toLowerCase(), { name, phone, unit: r.values.unit ?? '' });
      }
      out.set(nameKey, map);
    }
    return out;
  }, [rows, pairs]);
  // Nomor mana saja yang terisi otomatis (dan boleh ditimpa lagi bila namanya diganti).
  const [phoneAuto, setPhoneAuto] = useState<Record<string, boolean>>({});

  const set = (k: string, v: string) => {
    const next = { ...values, [k]: v };
    const pair = pairs.find(([, p]) => p === k);
    if (pair) setPhoneAuto((a) => ({ ...a, [k]: false }));
    // Nama yang sudah dikenal: isi nomornya (dan unit bila kosong) otomatis.
    const own = pairs.find(([n]) => n === k);
    if (own) {
      const [, phoneKey] = own;
      const c = contacts.get(k)?.get(v.trim().toLowerCase());
      if (c && (!values[phoneKey]?.trim() || phoneAuto[phoneKey])) {
        next[phoneKey] = c.phone;
        if (k !== 'kurir' && !next.unit && c.unit) next.unit = c.unit;
        setPhoneAuto((a) => ({ ...a, [phoneKey]: true }));
      } else if (!c && phoneAuto[phoneKey]) {
        next[phoneKey] = '';
        setPhoneAuto((a) => ({ ...a, [phoneKey]: false }));
      }
    }
    if (k === 'tenggat') setDueAuto(false);
    else if (k === mod.dateField && dueAuto && mod.fields.some((f) => f.key === 'tenggat')) {
      const due = defaultDue(mod, next);
      if (due) next.tenggat = due;
    }
    setValues(next);
  };

  // Isian dari PDF/foto surat: hanya field yang dicentang di langkah tinjau, lalu berpendar sebentar.
  // Nilai bawaan form baru (mis. tanggal hari ini) dianggap belum diisi pengguna.
  const [defaults] = useState(() => (record ? {} : values));
  const [filled, setFilled] = useState<string[]>([]);
  const applyScan = (patch: Record<string, string>) => {
    setValues((v) => {
      const next = { ...v, ...patch };
      if (mod.dateField in patch && dueAuto && mod.fields.some((f) => f.key === 'tenggat')) {
        const due = defaultDue(mod, next);
        if (due) next.tenggat = due;
      }
      return next;
    });
    setFilled(Object.keys(patch));
  };
  useEffect(() => {
    if (!filled.length) return;
    const t = setTimeout(() => setFilled([]), 1800);
    return () => clearTimeout(t);
  }, [filled]);

  // Unggahan lampiran yang belum selesai menahan Simpan, agar berkasnya tidak tertinggal.
  const [scanBusy, setScanBusy] = useState(0);
  const [attBusy, setAttBusy] = useState(false);
  const waiting = scanBusy > 0 || attBusy;
  // Isian terbaru, untuk dibaca setelah unggahan selesai.
  const latest = useRef(values);
  latest.current = values;
  const folder = `${mod.id}/${id}`;
  // Berkas surat diunggah sambil dibaca, tetapi baru masuk lampiran setelah isiannya diterapkan.
  const uploadScan = (file: File): ScanUpload =>
    uploadAttachment(file, folder, userName, files).then(
      (a) => a ?? 'Berkas gagal diunggah.',
      () => 'Berkas gagal diunggah.',
    );
  const keepScan = async (job: ScanUpload) => {
    setScanBusy((n) => n + 1);
    try {
      const a = await job;
      if (typeof a === 'string') return a;
      // Berkas yang sama (nama dan ukuran) tidak dilampirkan dua kali; unggahan kembarnya dibuang.
      const twin = attachmentsOf(latest.current).find((x) => x.path === a.path || (x.name === a.name && x.size === a.size));
      if (twin) {
        if (twin.path !== a.path) files.remove(a.path);
        return null;
      }
      setValues((v) => {
        const cur = attachmentsOf(v);
        return cur.some((x) => x.path === a.path) ? v : { ...v, lampiran: JSON.stringify([...cur, a]) };
      });
      return null;
    } finally {
      setScanBusy((n) => n - 1);
    }
  };
  // Pembacaan dibatalkan: unggahannya dihapus lagi dari penyimpanan.
  const discardScan = (job: ScanUpload) => {
    job.then((a) => {
      if (typeof a !== 'string') files.remove(a.path);
    });
  };

  // Esc yang sudah ditangani bagian lain (mis. langkah tinjau isi dari surat) tidak menutup form.
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && onClose();
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [onClose]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked || waiting) return;
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
  const lastStatus = mod.statuses[mod.statuses.length - 1];
  const atLast = status === lastStatus;
  // Dengan nomor WA, resi terkirim otomatis dari server saat tahap terakhir; tombol ini untuk kirim ulang.
  const canSendResi = mod.id === 'pos' && !!values.resi?.trim() && (wa ? atLast : !!mail);
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
        ref={formRef}
        tabIndex={-1}
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
          {canAutofill(mod) && (
            <PdfAutofill
              mod={mod}
              values={values}
              defaults={defaults}
              onApply={applyScan}
              upload={uploadScan}
              keep={keepScan}
              discard={discardScan}
            />
          )}
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
              Anda memilih “Lainnya” pada {quoteList(otherMissing.map((f) => f.label))}. Sebutkan keterangannya sebelum
              menyimpan.
            </p>
          )}
          {targetStatus && missing.length > 0 && (
            <p className="notice">
              Isi {quoteList(missing.map((f) => f.label))} untuk memindahkan ke tahap “{targetStatus}”.
            </p>
          )}

          <div className="form-grid">
            {mod.fields.map((f) => (
              <label
                key={f.key}
                data-key={f.key}
                className={(f.type === 'textarea' ? 'full' : '') + (filled.includes(f.key) ? ' autofilled' : '')}
              >
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
                    autoFocus={fine && !record && !firstMissing && f === mod.fields.find((x) => x.type !== 'date')}
                    type={f.type}
                    placeholder={f.placeholder}
                    min={f.type === 'number' ? 0 : undefined}
                    list={contacts.get(f.key)?.size ? `${f.key}-contacts` : undefined}
                    autoComplete={contacts.has(f.key) ? 'off' : undefined}
                    value={values[f.key] ?? ''}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
                {f.key === 'tenggat' && values.tenggat && mod.statuses.indexOf(status) < mod.statuses.length - 1 && (
                  <span className={'due ' + dueTone(daysUntil(values.tenggat))}>{dueLabel(daysUntil(values.tenggat))}</span>
                )}
                {!!contacts.get(f.key)?.size && (
                  <datalist id={`${f.key}-contacts`}>
                    {[...contacts.get(f.key)!.values()].map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.unit && f.key !== 'kurir' ? `${c.unit} · ` : ''}
                        {c.phone}
                      </option>
                    ))}
                  </datalist>
                )}
                {phoneAuto[f.key] ? (
                  <small className="hint ok">
                    Terisi otomatis dari data {values[pairs.find(([, p]) => p === f.key)?.[0] ?? '']} sebelumnya.
                  </small>
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
                <b>Kirim resi ke pemohon</b>
                <span className="muted small block">
                  {!values.resi?.trim()
                    ? 'Nomor resi dan fotonya diisi kurir lewat tautan WA-nya lalu otomatis diteruskan ke pemohon, atau isi sendiri di atas.'
                    : wa
                      ? atLast
                        ? `Resi sudah dikirim otomatis ke ${values.pengirim || '+' + wa}. Kirim ulang lewat WhatsApp Anda bila perlu.`
                        : `Resi terkirim otomatis lewat WA ke ${values.pengirim || '+' + wa} saat tahap jadi “${lastStatus}”.`
                      : mail
                        ? `Lewat email ke ${mail}. Tahap otomatis jadi “${lastStatus}”; simpan setelahnya.`
                        : 'Isi nomor WA pemohon untuk mengirim resi.'}
                </span>
              </div>
              <button type="button" className="btn wa" onClick={sendResi} disabled={!canSendResi}>
                <MessageCircle size={16} /> {mail && !wa ? 'Kirim email' : atLast ? 'Kirim ulang' : 'Kirim via WA'}
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
                onClick={() => window.open(notifyUrl([values], '', record ? [trackCode({ id })] : []), '_blank')}
              >
                <MessageCircle size={16} /> Kirim via WA
              </button>
            </div>
          )}

          <Attachments
            folder={folder}
            items={attachmentsOf(values)}
            userName={userName}
            files={files}
            onChange={(update) => setValues((v) => ({ ...v, lampiran: JSON.stringify(update(attachmentsOf(v))) }))}
            onBusy={setAttBusy}
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
          <button type="submit" className="pill-btn big" disabled={blocked || waiting}>
            {waiting ? 'Menunggu lampiran…' : 'Simpan'}
          </button>
        </footer>
      </form>
    </div>
  );
}
