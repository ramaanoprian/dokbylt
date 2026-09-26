// Halaman publik peminjaman drone, tanpa login:
//   #pinjam-drone              formulir pengajuan (dibuka dari QR)
//   #pinjam-drone/<id>.<token> status peminjaman + tombol "sudah diambil" / "sudah dikembalikan"
import { useEffect, useState, type FormEvent } from 'react';
import { Check, Drone, Loader2 } from 'lucide-react';
import { callFunction } from './backend';
import { DRONE_STATUSES, DRONE_UNITS, OTHER } from './modules';
import { fmtDate, readPref, today } from './util';

interface Loan {
  status: string;
  unit: string;
  pic: string;
  keperluan: string;
  lokasi?: string;
  tanggalPakai: string;
  tanggalKembali?: string;
  serah?: string;
  history: { status: string; at: string }[];
}

interface Busy {
  mulai: string;
  selesai: string;
  unit: string;
}

const parseRoute = () => {
  const m = location.hash.match(/^#pinjam-drone\/([0-9a-f-]+)\.([0-9a-f]+)$/i);
  return m ? { id: m[1], token: m[2] } : null;
};

export const isDroneRoute = () => location.hash.startsWith('#pinjam-drone');

export function DronePublic() {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const dark = readPref('theme', '');
    document.documentElement.dataset.theme =
      dark === 'dark' || (!dark && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }, []);
  useEffect(() => {
    const on = () => setRoute(parseRoute());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);

  return (
    <div className="public" data-mod="drone">
      <header className="public-head">
        <span className="app-icon" aria-hidden>
          <Drone size={22} strokeWidth={1.8} />
        </span>
        <span>
          <b>Peminjaman Drone</b>
          <span className="muted small block">Unit Dokumen · Balai Yasa Lahat</span>
        </span>
      </header>
      {route ? <LoanStatus {...route} /> : <RequestForm />}
    </div>
  );
}

const range = (a: string, b?: string) => (b && b !== a ? `${fmtDate(a)} – ${fmtDate(b)}` : fmtDate(a));

function RequestForm() {
  const [f, setF] = useState<Record<string, string>>({ tanggalPakai: today(), tanggalKembali: today() });
  const [busy, setBusy] = useState<Busy[] | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ id: string; token: string } | null>(null);
  const set = (k: string, v: string) =>
    setF((x) => ({
      ...x,
      [k]: v,
      // Tanggal kembali ikut maju bila tanggal pakai digeser melewatinya.
      ...(k === 'tanggalPakai' && (!x.tanggalKembali || x.tanggalKembali < v) ? { tanggalKembali: v } : {}),
    }));

  useEffect(() => {
    callFunction('pinjam-drone', { action: 'jadwal' }).then((r) =>
      setBusy(r.ok ? ((r.data.busy as Busy[]) ?? []) : []),
    );
  }, []);

  const clash = busy?.filter((b) => f.tanggalPakai <= b.selesai && (f.tanggalKembali || f.tanggalPakai) >= b.mulai);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    const r = await callFunction('pinjam-drone', { action: 'ajukan', form: f, website: f.website });
    setSending(false);
    if (r.ok) setDone({ id: String(r.data.id), token: String(r.data.token) });
    else setError(r.error);
  };

  if (done)
    return (
      <main className="public-card done">
        <span className="done-mark">
          <Check size={28} strokeWidth={2.6} />
        </span>
        <h1>Pengajuan terkirim.</h1>
        <p className="muted">
          Unit Dokumen akan mengonfirmasi lewat WA ke {f.kontakPic}. Pesan itu juga berisi tautan untuk menandai saat
          drone sudah diambil dan dikembalikan.
        </p>
        <a className="pill-btn big" href={`#pinjam-drone/${done.id}.${done.token}`}>
          Lihat status pengajuan
        </a>
      </main>
    );

  return (
    <main className="public-card">
      <h1>Pinjam drone.</h1>
      <p className="muted lead">Isi formulir ini. Unit Dokumen akan mengabari lewat WhatsApp setelah dikonfirmasi.</p>

      {busy && busy.length > 0 && (
        <div className="busy">
          <b>Jadwal drone yang sudah terisi</b>
          <ul>
            {busy.map((b, i) => (
              <li key={i}>
                <span>{range(b.mulai, b.selesai)}</span>
                <span className="muted">{b.unit}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="form-grid" onSubmit={submit}>
        <label className="full">
          <span>
            Nama peminjam<em className="req">*</em>
          </span>
          <input required autoComplete="name" value={f.pic ?? ''} onChange={(e) => set('pic', e.target.value)} />
        </label>
        <label>
          <span>
            Unit<em className="req">*</em>
          </span>
          <select required value={f.unit ?? ''} onChange={(e) => set('unit', e.target.value)}>
            <option value="">Pilih…</option>
            {DRONE_UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          {f.unit === OTHER && (
            <input
              className="other-input"
              required
              placeholder="Sebutkan unitnya"
              aria-label="Sebutkan unitnya"
              value={f.unitLainnya ?? ''}
              onChange={(e) => set('unitLainnya', e.target.value)}
            />
          )}
        </label>
        <label>
          <span>
            No. WhatsApp<em className="req">*</em>
          </span>
          <input
            required
            type="tel"
            inputMode="tel"
            placeholder="08…"
            autoComplete="tel"
            value={f.kontakPic ?? ''}
            onChange={(e) => set('kontakPic', e.target.value)}
          />
        </label>
        <label>
          <span>
            Tanggal pakai<em className="req">*</em>
          </span>
          <input
            required
            type="date"
            min={today()}
            value={f.tanggalPakai ?? ''}
            onChange={(e) => set('tanggalPakai', e.target.value)}
          />
        </label>
        <label>
          <span>Rencana kembali</span>
          <input
            type="date"
            min={f.tanggalPakai || today()}
            value={f.tanggalKembali ?? ''}
            onChange={(e) => set('tanggalKembali', e.target.value)}
          />
        </label>
        {clash && clash.length > 0 && (
          <p className="notice full">
            Drone sudah dipakai {clash.map((c) => c.unit).join(', ')} pada tanggal itu. Anda tetap bisa mengajukan,
            Unit Dokumen akan mengonfirmasi jadwalnya.
          </p>
        )}
        <label className="full">
          <span>
            Keperluan<em className="req">*</em>
          </span>
          <input
            required
            placeholder="mis. Dokumentasi udara pekerjaan atap depo"
            value={f.keperluan ?? ''}
            onChange={(e) => set('keperluan', e.target.value)}
          />
        </label>
        <label className="full">
          <span>Lokasi terbang</span>
          <input value={f.lokasi ?? ''} onChange={(e) => set('lokasi', e.target.value)} />
        </label>
        <fieldset className="full choice">
          <legend>Penyerahan drone</legend>
          {['Diantar ke unit', 'Diambil di Unit Dokumen'].map((o) => (
            <label key={o} className={f.serah === o ? 'on' : ''}>
              <input type="radio" name="serah" value={o} checked={f.serah === o} onChange={() => set('serah', o)} />
              {o}
            </label>
          ))}
        </fieldset>
        <label className="full">
          <span>Catatan</span>
          <textarea rows={2} value={f.catatan ?? ''} onChange={(e) => set('catatan', e.target.value)} />
        </label>
        {/* Jebakan bot: tidak terlihat oleh manusia. */}
        <input
          className="trap"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          value={f.website ?? ''}
          onChange={(e) => set('website', e.target.value)}
        />
        {error && <p className="notice error full">{error}</p>}
        <button className="pill-btn big block full" disabled={sending}>
          {sending ? <Loader2 size={18} className="spin" /> : null} Ajukan peminjaman
        </button>
      </form>
    </main>
  );
}

const STEP_HELP: Record<string, string> = {
  Diajukan: 'Pengajuan sedang menunggu konfirmasi Unit Dokumen.',
  Disetujui: 'Pengajuan sudah disetujui. Tekan tombol di bawah setelah drone Anda terima.',
  Dipinjam: 'Drone sedang Anda pinjam. Setelah selesai, kembalikan ke Unit Dokumen lalu tekan tombol di bawah.',
  Dikembalikan: 'Drone sudah dikembalikan. Terima kasih.',
};

function LoanStatus({ id, token }: { id: string; token: string }) {
  const [loan, setLoan] = useState<Loan | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    callFunction('pinjam-drone', { action: 'lihat', id, token }).then((r) =>
      r.ok ? setLoan(r.data.loan as Loan) : setError(r.error),
    );
  }, [id, token]);

  const confirm = async (step: 'ambil' | 'kembali') => {
    setSending(true);
    setError('');
    const r = await callFunction('pinjam-drone', { action: 'konfirmasi', id, token, step });
    setSending(false);
    if (r.data?.loan) setLoan(r.data.loan as Loan);
    if (!r.ok) setError(r.error);
  };

  if (!loan)
    return (
      <main className="public-card">
        {error ? (
          <>
            <h1>Tautan tidak bisa dibuka.</h1>
            <p className="muted">{error}. Periksa kembali tautan dari WA, atau hubungi Unit Dokumen.</p>
          </>
        ) : (
          <p className="muted">
            <Loader2 size={18} className="spin" /> Memuat…
          </p>
        )}
      </main>
    );

  const cur = DRONE_STATUSES.indexOf(loan.status);
  const at = (s: string) => [...loan.history].reverse().find((h) => h.status === s)?.at;
  return (
    <main className="public-card">
      <h1>{loan.keperluan}.</h1>
      <p className="muted lead">
        {loan.pic} · {loan.unit} · {range(loan.tanggalPakai, loan.tanggalKembali)}
        {loan.serah ? ` · ${loan.serah}` : ''}
      </p>

      <ol className="track">
        {DRONE_STATUSES.map((s, i) => (
          <li key={s} className={i < cur ? 'past' : i === cur ? 'on' : ''}>
            <span className="dot">{i < cur || (i === cur && i === DRONE_STATUSES.length - 1) ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
            <span className="grow">
              <b>{s}</b>
              {at(s) && i <= cur && <span className="muted small block">{fmtDate(at(s)!.slice(0, 10))}</span>}
            </span>
          </li>
        ))}
      </ol>
      <p className="muted">{STEP_HELP[loan.status]}</p>
      {error && <p className="notice error">{error}</p>}
      {loan.status === 'Disetujui' && (
        <button className="pill-btn big block" disabled={sending} onClick={() => confirm('ambil')}>
          Drone sudah saya terima
        </button>
      )}
      {loan.status === 'Dipinjam' && (
        <button className="pill-btn big block" disabled={sending} onClick={() => confirm('kembali')}>
          Drone sudah saya kembalikan
        </button>
      )}
    </main>
  );
}
