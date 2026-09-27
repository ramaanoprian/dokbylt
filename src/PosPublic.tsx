// Halaman publik pengiriman paket lewat Kantor Pos, tanpa login:
//   #kirim-paket              formulir permohonan dari unit (dibuka dari QR)
//   #kirim-paket/<id>.<token> halaman kurir: konfirmasi pick-up lalu kirim nomor dan foto resi
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, Check, Loader2, Package, X } from 'lucide-react';
import { callFunction } from './backend';
import { shrink } from './Attachments';
import { OTHER, POS_STATUSES, UNITS } from './modules';
import { fmtDate, readPref } from './util';

interface Paket {
  status: string;
  unit: string;
  pengirim: string;
  tujuan: string;
  alamat?: string;
  isi?: string;
  kurir?: string;
  resi?: string;
  history: { status: string; at: string }[];
}

const parseRoute = () => {
  const m = location.hash.match(/^#kirim-paket\/([0-9a-f-]+)\.([0-9a-f]+)$/i);
  return m ? { id: m[1], token: m[2] } : null;
};

export const isPosRoute = () => location.hash.startsWith('#kirim-paket');

export function PosPublic() {
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
    <div className="public" data-mod="pos">
      <header className="public-head">
        <span className="app-icon" aria-hidden>
          <Package size={22} strokeWidth={1.8} />
        </span>
        <span>
          <b>Kirim Paket via Kantor Pos</b>
          <span className="muted small block">Unit Dokumen · Balai Yasa Lahat</span>
        </span>
      </header>
      {route ? <CourierPage {...route} /> : <RequestForm />}
    </div>
  );
}

function RequestForm() {
  const [f, setF] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    const r = await callFunction('kirim-paket', { action: 'ajukan', form: f, website: f.website });
    setSending(false);
    if (r.ok) setDone(true);
    else setError(r.error);
  };

  if (done)
    return (
      <main className="public-card done">
        <span className="done-mark">
          <Check size={28} strokeWidth={2.6} />
        </span>
        <h1>Permohonan terkirim.</h1>
        <p className="muted">
          Silakan serahkan paketnya ke Unit Dokumen. WA dikirim ke {f.kontak} saat paket kami terima, lalu lagi
          berisi nomor resi setelah paket dikirim.
        </p>
        <button
          className="btn"
          onClick={() => {
            setDone(false);
            setF((x) => ({ unit: x.unit ?? '', unitLainnya: x.unitLainnya ?? '', pengirim: x.pengirim ?? '', kontak: x.kontak ?? '' }));
          }}
        >
          Kirim paket lain
        </button>
      </main>
    );

  return (
    <main className="public-card">
      <h1>Kirim paket.</h1>
      <p className="muted lead">
        Isi sebelum menyerahkan paket ke Unit Dokumen. Anda akan dikabari lewat WhatsApp saat paket diterima dan saat
        nomor resinya sudah ada.
      </p>
      <form className="form-grid" onSubmit={submit}>
        <label>
          <span>
            Unit pemohon<em className="req">*</em>
          </span>
          <select required value={f.unit ?? ''} onChange={(e) => set('unit', e.target.value)}>
            <option value="">Pilih…</option>
            {UNITS.map((u) => (
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
            Nama pemohon<em className="req">*</em>
          </span>
          <input required autoComplete="name" value={f.pengirim ?? ''} onChange={(e) => set('pengirim', e.target.value)} />
        </label>
        <label className="full">
          <span>
            No. WhatsApp pemohon<em className="req">*</em>
          </span>
          <input
            required
            type="tel"
            inputMode="tel"
            placeholder="08…"
            autoComplete="tel"
            value={f.kontak ?? ''}
            onChange={(e) => set('kontak', e.target.value)}
          />
        </label>
        <label className="full">
          <span>
            Penerima & kota tujuan<em className="req">*</em>
          </span>
          <input
            required
            placeholder="mis. PT INKA (Persero), Madiun"
            value={f.tujuan ?? ''}
            onChange={(e) => set('tujuan', e.target.value)}
          />
        </label>
        <label className="full">
          <span>
            Alamat lengkap tujuan<em className="req">*</em>
          </span>
          <textarea
            required
            rows={3}
            placeholder="Jalan, nomor, kelurahan, kecamatan, kode pos, dan nomor telepon penerima bila ada"
            value={f.alamat ?? ''}
            onChange={(e) => set('alamat', e.target.value)}
          />
        </label>
        <label className="full">
          <span>Isi paket</span>
          <input
            placeholder="mis. Dokumen kontrak asli, 1 map"
            value={f.isi ?? ''}
            onChange={(e) => set('isi', e.target.value)}
          />
        </label>
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
          {sending ? <Loader2 size={18} className="spin" /> : null} Kirim permohonan
        </button>
      </form>
    </main>
  );
}

// Tahap yang terlihat kurir: dari saat paket siap di-pick up.
const COURIER_STEPS = POS_STATUSES.slice(POS_STATUSES.indexOf('Proses pengiriman'), POS_STATUSES.indexOf('Resi diterima') + 1);
const STEP_LABEL: Record<string, string> = {
  'Proses pengiriman': 'Siap di-pick up',
  'Di-pick up kurir': 'Sudah diambil',
  'Resi diterima': 'Resi terkirim',
};

async function toBase64(b: Blob) {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

function CourierPage({ id, token }: { id: string; token: string }) {
  const [p, setP] = useState<Paket | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [resi, setResi] = useState('');
  const [biaya, setBiaya] = useState('');
  const [foto, setFoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    callFunction('kirim-paket', { action: 'lihat', id, token }).then((r) =>
      r.ok ? setP(r.data.paket as Paket) : setError(r.error),
    );
  }, [id, token]);
  useEffect(() => () => void (foto && URL.revokeObjectURL(foto.url)), [foto]);

  const call = async (body: Record<string, unknown>) => {
    setSending(true);
    setError('');
    const r = await callFunction('kirim-paket', { id, token, ...body });
    setSending(false);
    if (r.data?.paket) setP(r.data.paket as Paket);
    if (!r.ok) setError(r.error);
    return r.ok;
  };

  const pickFoto = async (file?: File) => {
    if (!file) return;
    const blob = await shrink(file);
    setFoto({ blob, url: URL.createObjectURL(blob) });
  };

  const sendResi = async (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = { action: 'resi', resi, biaya };
    if (foto) body.foto = { data: await toBase64(foto.blob), type: foto.blob.type || 'image/jpeg' };
    if (await call(body)) {
      setFoto(null);
      setEditing(false);
    }
  };

  if (!p)
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

  const idx = POS_STATUSES.indexOf(p.status);
  const cur = COURIER_STEPS.indexOf(p.status);
  const finished = idx >= POS_STATUSES.indexOf('Resi diterima');
  const canResi = idx >= POS_STATUSES.indexOf('Proses pengiriman') && (!finished || editing);
  const at = (s: string) => [...p.history].reverse().find((h) => h.status === s)?.at;

  return (
    <main className="public-card">
      <h1>Paket ke {p.tujuan}.</h1>
      <p className="muted lead">
        {p.isi ? `${p.isi} · ` : ''}dari {p.pengirim} ({p.unit})
      </p>
      {p.alamat && (
        <div className="busy">
          <b>Alamat tujuan</b>
          <p className="pre-line">{p.alamat}</p>
        </div>
      )}

      {cur < 0 && !finished ? (
        <p className="muted">Paket belum siap di-pick up. Unit Dokumen akan mengirim WA saat paket siap.</p>
      ) : (
        <ol className="track">
          {COURIER_STEPS.map((s, i) => {
            const past = finished || i < cur;
            return (
              <li key={s} className={past ? 'past' : i === cur ? 'on' : ''}>
                <span className="dot">{past ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
                <span className="grow">
                  <b>{STEP_LABEL[s]}</b>
                  {at(s) && (past || i === cur) && <span className="muted small block">{fmtDate(at(s)!.slice(0, 10))}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {error && <p className="notice error">{error}</p>}

      {p.status === 'Proses pengiriman' && (
        <button className="pill-btn big block" disabled={sending} onClick={() => call({ action: 'pickup' })}>
          {sending ? <Loader2 size={18} className="spin" /> : null} Paket sudah saya ambil
        </button>
      )}

      {finished && !editing && (
        <>
          <p className="muted">
            Nomor resi <b className="text">{p.resi}</b> sudah kami terima. Terima kasih.
          </p>
          {p.status === 'Resi diterima' && (
            <button className="btn" onClick={() => (setResi(p.resi ?? ''), setEditing(true))}>
              Perbaiki nomor resi
            </button>
          )}
        </>
      )}

      {canResi && p.status !== 'Proses pengiriman' && (
        <form className="form-grid" onSubmit={sendResi}>
          <label className="full">
            <span>
              Nomor resi<em className="req">*</em>
            </span>
            <input
              required
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="mis. P2409270123456"
              value={resi}
              onChange={(e) => setResi(e.target.value)}
            />
          </label>
          <label className="full">
            <span>Biaya kirim (Rp)</span>
            <input inputMode="numeric" placeholder="mis. 25000" value={biaya} onChange={(e) => setBiaya(e.target.value)} />
          </label>
          <div className="full foto-resi">
            {foto ? (
              <div className="foto-prev">
                <img src={foto.url} alt="Foto resi" />
                <button type="button" className="icon-btn" aria-label="Hapus foto" onClick={() => setFoto(null)}>
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button type="button" className="btn" onClick={() => camRef.current?.click()}>
                <Camera size={16} /> Foto resi
              </button>
            )}
            <input
              ref={camRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => (pickFoto(e.target.files?.[0]), (e.target.value = ''))}
            />
          </div>
          <button className="pill-btn big block full" disabled={sending}>
            {sending ? <Loader2 size={18} className="spin" /> : null} Kirim resi
          </button>
        </form>
      )}
      {p.status === 'Proses pengiriman' && (
        <p className="muted small">Setelah paket dikirim di Kantor Pos, buka lagi tautan ini untuk mengisi nomor resi.</p>
      )}
    </main>
  );
}
