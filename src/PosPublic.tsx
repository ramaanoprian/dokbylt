// Halaman publik pengiriman paket lewat Kantor Pos, tanpa login:
//   #kirim-paket              formulir permohonan dari unit (dibuka dari QR), boleh beberapa paket
//   #kirim-paket/<id>.<token>[,<id>.<token>…] halaman kurir untuk satu atau beberapa paket:
//                             konfirmasi pick-up lalu kirim nomor dan foto resi
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, Check, Loader2, Package, Plus, Trash2, X } from 'lucide-react';
import { callFunction } from './backend';
import { shrink } from './Attachments';
import { OTHER, POS_STATUSES, UNITS } from './modules';
import { fmtDate, readPref } from './util';

interface Paket {
  id: string;
  status: string;
  unit: string;
  pengirim: string;
  tujuan: string;
  alamat?: string;
  isi?: string;
  kurir?: string;
  resi?: string;
  biaya?: string;
  history: { status: string; at: string }[];
}

interface Pair {
  id: string;
  token: string;
}

/** #kirim-paket/<id>.<token>,<id>.<token>… : satu tautan kurir untuk beberapa paket. */
const parseRoute = (): Pair[] | null => {
  const m = location.hash.match(/^#kirim-paket\/(.+)$/);
  if (!m) return null;
  const pairs = m[1]
    .split(',')
    .map((x) => x.match(/^([0-9a-f-]+)\.([0-9a-f]+)$/i))
    .filter((x): x is RegExpMatchArray => !!x)
    .map((x) => ({ id: x[1], token: x[2] }));
  return pairs.length ? pairs : null;
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
      {route ? <CourierPage items={route} /> : <RequestForm />}
    </div>
  );
}

interface Item {
  tujuan: string;
  alamat: string;
  isi?: string;
}

const emptyItem = (): Item => ({ tujuan: '', alamat: '' });

function RequestForm() {
  const [f, setF] = useState<Record<string, string>>({});
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Item[] | null>(null);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const setItem = (i: number, k: keyof Item, v: string) =>
    setItems((l) => l.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    const r = await callFunction('kirim-paket', { action: 'ajukan', form: f, paket: items, website: f.website });
    setSending(false);
    if (r.ok) setDone(items);
    else setError(r.error);
  };

  if (done)
    return (
      <main className="public-card done">
        <span className="done-mark">
          <Check size={28} strokeWidth={2.6} />
        </span>
        <h1>{done.length > 1 ? `${done.length} paket terdaftar.` : 'Permohonan terkirim.'}</h1>
        {done.length > 1 && (
          <ol className="doc-list">
            {done.map((p, i) => (
              <li key={i}>
                <b>{p.tujuan}</b>
                {p.isi && <span className="muted small block">{p.isi}</span>}
              </li>
            ))}
          </ol>
        )}
        <p className="muted">
          Silakan serahkan paketnya ke Unit Dokumen. WA dikirim ke {f.kontak} saat paket kami terima, lalu lagi
          berisi nomor resi setelah paket dikirim.
        </p>
        <button
          className="btn"
          onClick={() => {
            setDone(null);
            setItems([emptyItem()]);
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

        <div className="full berkas">
          <b className="berkas-title">Paket yang dikirim</b>
          {items.map((p, i) => (
            <div key={i} className="berkas-item">
              <span className="berkas-num">{i + 1}</span>
              <div className="berkas-fields">
                <label className="full">
                  <span>
                    Penerima & kota tujuan<em className="req">*</em>
                  </span>
                  <input
                    required
                    placeholder="mis. PT INKA (Persero), Madiun"
                    value={p.tujuan}
                    onChange={(e) => setItem(i, 'tujuan', e.target.value)}
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
                    value={p.alamat}
                    onChange={(e) => setItem(i, 'alamat', e.target.value)}
                  />
                </label>
                <label className="full">
                  <span>Isi paket</span>
                  <input
                    placeholder="mis. Dokumen kontrak asli, 1 map"
                    value={p.isi ?? ''}
                    onChange={(e) => setItem(i, 'isi', e.target.value)}
                  />
                </label>
              </div>
              {items.length > 1 && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Hapus paket ${i + 1}`}
                  title="Hapus paket ini"
                  onClick={() => setItems((l) => l.filter((_, j) => j !== i))}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
          {items.length < 20 && (
            <button type="button" className="btn" onClick={() => setItems((l) => [...l, emptyItem()])}>
              <Plus size={15} /> Tambah paket
            </button>
          )}
        </div>

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
          {sending ? <Loader2 size={18} className="spin" /> : null}
          {items.length > 1 ? `Kirim ${items.length} paket` : 'Kirim permohonan'}
        </button>
      </form>
    </main>
  );
}

async function toBase64(b: Blob) {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

const idx = (s: string) => POS_STATUSES.indexOf(s);
const DONE_AT = idx('Resi diterima');
const READY_AT = idx('Proses pengiriman');

function CourierPage({ items }: { items: Pair[] }) {
  const [list, setList] = useState<Paket[] | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [resi, setResi] = useState<Record<string, { resi: string; biaya: string }>>({});
  const [foto, setFoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    callFunction('kirim-paket', { action: 'lihat', items }).then((r) =>
      r.ok ? setList(r.data.paket as Paket[]) : setError(r.error),
    );
  }, [items]);
  useEffect(() => () => void (foto && URL.revokeObjectURL(foto.url)), [foto]);

  const call = async (body: Record<string, unknown>) => {
    setSending(true);
    setError('');
    const r = await callFunction('kirim-paket', { items, ...body });
    setSending(false);
    if (r.data?.paket) setList(r.data.paket as Paket[]);
    if (!r.ok) setError(r.error);
    return r.ok;
  };

  const pickFoto = async (file?: File) => {
    if (!file) return;
    const blob = await shrink(file);
    setFoto({ blob, url: URL.createObjectURL(blob) });
  };

  if (!list)
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

  const many = list.length > 1;
  const ready = list.filter((p) => p.status === 'Proses pengiriman');
  const picked = list.filter((p) => idx(p.status) > READY_AT && idx(p.status) < DONE_AT);
  const finished = list.filter((p) => idx(p.status) >= DONE_AT);
  const allDone = finished.length === list.length;
  const notYet = list.filter((p) => idx(p.status) < READY_AT);
  // Paket yang resinya bisa diisi: sudah diambil, atau sudah ada resi dan sedang diperbaiki.
  const toFill = list.filter((p) => picked.includes(p) || (editing && finished.includes(p)));
  const field = (p: Paket) => resi[p.id] ?? { resi: editing ? p.resi ?? '' : '', biaya: editing ? p.biaya ?? '' : '' };
  const setField = (p: Paket, k: 'resi' | 'biaya', v: string) => setResi((x) => ({ ...x, [p.id]: { ...field(p), [k]: v } }));

  const sendResi = async (e: FormEvent) => {
    e.preventDefault();
    const pairs = new Map(items.map((i) => [i.id, i.token]));
    const body: Record<string, unknown> = {
      action: 'resi',
      items: toFill.map((p) => ({ id: p.id, token: pairs.get(p.id), ...field(p) })),
    };
    if (foto) body.foto = { data: await toBase64(foto.blob), type: foto.blob.type || 'image/jpeg' };
    if (await call(body)) {
      setFoto(null);
      setEditing(false);
      setResi({});
    }
  };

  const at = (p: Paket, s: string) => [...p.history].reverse().find((h) => h.status === s)?.at;
  const stepOf = (p: Paket) =>
    idx(p.status) >= DONE_AT ? `Resi ${p.resi}` : idx(p.status) > READY_AT ? 'Sudah diambil' : idx(p.status) === READY_AT ? 'Siap di-pick up' : 'Belum siap';

  return (
    <main className="public-card">
      <h1>{many ? `${list.length} paket untuk dikirim.` : `Paket ke ${list[0].tujuan}.`}</h1>
      {!many && (
        <p className="muted lead">
          {list[0].isi ? `${list[0].isi} · ` : ''}dari {list[0].pengirim} ({list[0].unit})
        </p>
      )}

      <ol className="paket-list">
        {list.map((p, i) => (
          <li key={p.id} className={idx(p.status) >= DONE_AT ? 'done' : ''}>
            {many && <span className="berkas-num">{i + 1}</span>}
            <div className="grow">
              {many && <b className="block">{p.tujuan}</b>}
              {many && (
                <span className="muted small block">
                  {p.isi ? `${p.isi} · ` : ''}dari {p.pengirim} ({p.unit})
                </span>
              )}
              {p.alamat && <p className="pre-line small">{p.alamat}</p>}
              <span className={'pill-step ' + (idx(p.status) >= DONE_AT ? 'ok' : idx(p.status) > READY_AT ? 'on' : '')}>
                {idx(p.status) >= DONE_AT ? <Check size={12} strokeWidth={3} /> : null}
                {stepOf(p)}
                {at(p, p.status) && idx(p.status) >= READY_AT ? ` · ${fmtDate(at(p, p.status)!.slice(0, 10))}` : ''}
              </span>
            </div>
          </li>
        ))}
      </ol>

      {notYet.length === list.length && (
        <p className="muted">Paket belum siap di-pick up. Unit Dokumen akan mengirim WA saat paket siap.</p>
      )}
      {error && <p className="notice error">{error}</p>}

      {ready.length > 0 && (
        <>
          <button className="pill-btn big block" disabled={sending} onClick={() => call({ action: 'pickup' })}>
            {sending ? <Loader2 size={18} className="spin" /> : null}
            {ready.length > 1 ? `${ready.length} paket sudah saya ambil` : 'Paket sudah saya ambil'}
          </button>
          <p className="muted small">Setelah paket dikirim di Kantor Pos, buka lagi tautan ini untuk mengisi nomor resi.</p>
        </>
      )}

      {toFill.length > 0 && (
        <form className="form-grid" onSubmit={sendResi}>
          <b className="full">{toFill.length > 1 ? 'Nomor resi tiap paket' : 'Nomor resi'}</b>
          {toFill.map((p) => (
            <div key={p.id} className="full resi-row">
              {many && <span className="small muted block">{p.tujuan}</span>}
              <div className="resi-inputs">
                <input
                  required
                  autoComplete="off"
                  autoCapitalize="characters"
                  aria-label={`Nomor resi ${p.tujuan}`}
                  placeholder="Nomor resi, mis. P2409270123456"
                  value={field(p).resi}
                  onChange={(e) => setField(p, 'resi', e.target.value)}
                />
                <input
                  inputMode="numeric"
                  aria-label={`Biaya kirim ${p.tujuan}`}
                  placeholder="Biaya (Rp)"
                  value={field(p).biaya}
                  onChange={(e) => setField(p, 'biaya', e.target.value)}
                />
              </div>
            </div>
          ))}
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
                <Camera size={16} /> Foto resi{many ? ' (boleh satu untuk semua)' : ''}
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

      {allDone && !editing && (
        <>
          <p className="muted">
            {list.every((p) => p.status === 'Resi dikirim ke user')
              ? 'Nomor resi sudah kami terima dan diteruskan ke pemohon. Terima kasih.'
              : 'Nomor resi sudah kami terima. Terima kasih.'}
          </p>
          <button className="btn" onClick={() => setEditing(true)}>
            Perbaiki nomor resi
          </button>
        </>
      )}
    </main>
  );
}
