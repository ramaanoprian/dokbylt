// Halaman publik #daftar-dokumen, tanpa login: unit mendaftarkan dokumen yang butuh tanda
// tangan EVP sebelum mengantarnya ke Unit Dokumen. Satu pengantar bisa mendaftarkan beberapa
// berkas sekaligus. PIC dikabari lewat WA saat dokumen diterima dan saat sudah ditandatangani.
// Setelah terdaftar, setiap berkas mendapat kode lacak untuk memantau statusnya di #lacak/<kode>.
import { useEffect, useState, type FormEvent } from 'react';
import { Check, ChevronRight, Copy, Loader2, PenLine, Plus, ScanSearch, Trash2 } from 'lucide-react';
import { callFunction } from './backend';
import { OTHER, UNITS, moduleById } from './modules';
import { readPref } from './util';
import { trackCode } from './track';
import './track.css';

export const isDocRoute = () => location.hash.startsWith('#daftar-dokumen');

const JENIS = moduleById('evp').fields.find((f) => f.key === 'jenis')!.options!;

interface Berkas {
  jenis: string;
  jenisLainnya?: string;
  perihal: string;
  nomor?: string;
}

const empty = (): Berkas => ({ jenis: '', perihal: '' });

/** Kode lacak satu berkas dengan tombol salin. */
function CodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      className="lk-code"
      title="Salin kode lacak"
      onClick={() => navigator.clipboard?.writeText(code).then(() => setCopied(true), () => undefined)}
    >
      <span>Kode lacak</span>
      <b>{code}</b>
      {copied ? <Check size={14} strokeWidth={2.6} className="ok" /> : <Copy size={14} />}
    </button>
  );
}

export function DocPublic() {
  const [f, setF] = useState<Record<string, string>>({});
  const [items, setItems] = useState<Berkas[]>([empty()]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Berkas[] | null>(null);
  // Id data hasil pendaftaran (urutannya sama dengan berkas), untuk kode lacak.
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    const dark = readPref('theme', '');
    document.documentElement.dataset.theme =
      dark === 'dark' || (!dark && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }, []);

  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const setItem = (i: number, k: keyof Berkas, v: string) =>
    setItems((l) => l.map((b, j) => (j === i ? { ...b, [k]: v } : b)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    const r = await callFunction('daftar-dokumen', { action: 'daftar', form: f, berkas: items, website: f.website });
    setSending(false);
    if (r.ok) {
      setIds(Array.isArray(r.data.ids) ? r.data.ids.map(String) : []);
      setDone(items);
    } else setError(r.error);
  };

  const codes = ids.length === done?.length ? ids.map((id) => trackCode({ id })) : [];

  return (
    <div className="public" data-mod="evp">
      <header className="public-head">
        <span className="app-icon" aria-hidden>
          <PenLine size={22} strokeWidth={1.8} />
        </span>
        <span>
          <b>Tanda Tangan EVP</b>
          <span className="muted small block">Unit Dokumen · Balai Yasa Lahat</span>
        </span>
      </header>

      {done ? (
        <main className="public-card done">
          <span className="done-mark">
            <Check size={28} strokeWidth={2.6} />
          </span>
          <h1>{done.length > 1 ? `${done.length} dokumen terdaftar.` : 'Dokumen terdaftar.'}</h1>
          <ol className={'doc-list' + (codes.length ? ' lk-doc-list' : '')}>
            {done.map((b, i) => (
              <li key={i}>
                <b>{b.perihal}</b>
                <span className="muted small block">
                  {b.jenis === OTHER ? b.jenisLainnya : b.jenis}
                  {b.nomor ? ` · ${b.nomor}` : ''}
                </span>
                {codes[i] && (
                  <span className="lk-doc-code">
                    <CodeChip code={codes[i]} />
                    <a className="link" href={`#lacak/${codes[i]}`}>
                      Lacak <ChevronRight size={15} />
                    </a>
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="muted">
            Silakan antar dokumen fisiknya ke Unit Dokumen. WA dikirim ke {f.kontakPic} saat dokumen kami terima, lalu
            lagi saat sudah ditandatangani EVP.
          </p>
          {codes.length > 0 && (
            <div className="lk-doc-track">
              <ScanSearch size={20} strokeWidth={1.8} aria-hidden />
              <span className="grow">
                <b>Pantau statusnya kapan saja.</b>
                <span className="muted small block">
                  Simpan {codes.length > 1 ? 'kode-kode' : 'kode'} lacak di atas, atau buka halaman lacak sekarang.
                </span>
              </span>
              <a className="pill-btn" href={`#lacak/${codes.join(',')}`}>
                {codes.length > 1 ? 'Lacak semua' : 'Lacak dokumen'}
              </a>
            </div>
          )}
          <button
            className="btn"
            onClick={() => {
              setDone(null);
              setIds([]);
              setItems([empty()]);
            }}
          >
            Daftarkan dokumen lain
          </button>
        </main>
      ) : (
        <main className="public-card">
          <h1>Daftarkan dokumen.</h1>
          <p className="muted lead">
            Isi sebelum mengantar dokumen untuk ditandatangani EVP. Anda akan dikabari lewat WhatsApp saat dokumen
            diterima dan saat sudah ditandatangani.
          </p>
          <form className="form-grid" onSubmit={submit}>
            <label>
              <span>
                Unit pengusul<em className="req">*</em>
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
                Nama PIC pengusul<em className="req">*</em>
              </span>
              <input required autoComplete="name" value={f.pic ?? ''} onChange={(e) => set('pic', e.target.value)} />
            </label>
            <label className="full">
              <span>
                No. WhatsApp PIC<em className="req">*</em>
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

            <div className="full berkas">
              <b className="berkas-title">Berkas yang diantar</b>
              {items.map((b, i) => (
                <div key={i} className="berkas-item">
                  <span className="berkas-num">{i + 1}</span>
                  <div className="berkas-fields">
                    <label>
                      <span>
                        Jenis dokumen<em className="req">*</em>
                      </span>
                      <select required value={b.jenis} onChange={(e) => setItem(i, 'jenis', e.target.value)}>
                        <option value="">Pilih…</option>
                        {JENIS.map((j) => (
                          <option key={j}>{j}</option>
                        ))}
                      </select>
                      {b.jenis === OTHER && (
                        <input
                          className="other-input"
                          required
                          placeholder="Sebutkan jenisnya"
                          aria-label="Sebutkan jenis dokumen"
                          value={b.jenisLainnya ?? ''}
                          onChange={(e) => setItem(i, 'jenisLainnya', e.target.value)}
                        />
                      )}
                    </label>
                    <label>
                      <span>Nomor dokumen</span>
                      <input value={b.nomor ?? ''} onChange={(e) => setItem(i, 'nomor', e.target.value)} />
                    </label>
                    <label className="full">
                      <span>
                        Nama berkas / perihal<em className="req">*</em>
                      </span>
                      <input
                        required
                        placeholder="mis. Pengadaan suku cadang bogie"
                        value={b.perihal}
                        onChange={(e) => setItem(i, 'perihal', e.target.value)}
                      />
                    </label>
                  </div>
                  {items.length > 1 && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Hapus berkas ${i + 1}`}
                      title="Hapus berkas ini"
                      onClick={() => setItems((l) => l.filter((_, j) => j !== i))}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              {items.length < 20 && (
                <button type="button" className="btn" onClick={() => setItems((l) => [...l, empty()])}>
                  <Plus size={15} /> Tambah berkas
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
              {items.length > 1 ? `Daftarkan ${items.length} dokumen` : 'Daftarkan dokumen'}
            </button>
          </form>
        </main>
      )}
    </div>
  );
}
