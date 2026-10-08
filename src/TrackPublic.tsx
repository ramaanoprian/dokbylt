// Halaman lacak publik, tanpa login:
//   #lacak                 cari dengan kode lacak dari tanda terima atau pesan WA
//   #lacak/<KODE>          posisi satu dokumen: tahap, riwayat, dan target selesai
//   #lacak/<KODE>,<KODE>…  beberapa dokumen yang didaftarkan atau dikabari bersamaan
// Data diambil dari fungsi server "lacak-dokumen", yang hanya mengirim data yang aman ditampilkan.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  Copy,
  EyeOff,
  Flag,
  Link2,
  PackageCheck,
  RefreshCw,
  ScanSearch,
  SearchX,
  Share2,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { callFunction } from './backend';
import { MODULES, type ModuleId } from './modules';
import { Icon } from './icons';
import { daysUntil, dueLabel, fmtDate, readPref } from './util';
import { MAX_CODES, isTrackCode, parseCodes } from './track';
import './track.css';

/** Satu dokumen seperti dikirim fungsi lacak-dokumen. */
interface Item {
  kode: string;
  module: ModuleId;
  menu: string;
  statuses: string[];
  status: string;
  title: string;
  kind?: string;
  unit?: string;
  created: string;
  history: { status: string; at: string }[];
  deadline?: string;
  done: boolean;
}

type Load =
  | { state: 'loading' }
  | { state: 'ok'; items: Item[]; missing: string[] }
  | { state: 'invalid' }
  | { state: 'not_found' }
  | { state: 'error'; message: string };

interface Back {
  href: string;
  label: string;
}

export const isTrackRoute = () => /^#lacak(\/|$)/i.test(location.hash);

function routeRaw() {
  const m = location.hash.match(/^#lacak\/?(.*)$/i);
  try {
    return decodeURIComponent(m?.[1] ?? '').trim();
  } catch {
    return m?.[1] ?? '';
  }
}

// ---------- Keterangan untuk unit ----------

/** Penjelasan singkat tiap tahap dengan bahasa unit, bukan istilah internal. */
const STAGE_NOTE: Partial<Record<ModuleId, Record<string, string>>> = {
  evp: {
    'Didaftarkan unit': 'Dokumen sudah terdaftar. Silakan antar dokumen fisiknya ke Unit Dokumen.',
    'Diterima dari unit': 'Dokumen sudah kami terima dan segera diteruskan ke EVP untuk ditandatangani.',
    'Diserahkan ke EVP': 'Dokumen sedang berada di EVP untuk ditandatangani.',
    'Ditandatangani EVP': 'Dokumen sudah ditandatangani EVP. Silakan ambil di Unit Dokumen, atau kami antarkan ke unit.',
    'Didistribusikan ke unit': 'Dokumen sudah diserahkan kembali ke unit.',
  },
  surat: {
    Didata: 'Surat sudah dicatat Unit Dokumen dan menunggu disposisi EVP.',
    'Didisposisi EVP': 'EVP sudah memberi disposisi. Surat segera diteruskan ke unit yang dituju.',
    Didistribusikan: 'Surat sudah diserahkan ke unit yang dituju.',
  },
  keluar: {
    Didata: 'Surat sudah dicatat dan menunggu tanda tangan.',
    Ditandatangani: 'Surat sudah ditandatangani dan segera dikirim.',
    Dikirim: 'Surat sudah dikirim ke tujuan.',
  },
  pos: {
    'Didaftarkan unit': 'Kiriman sudah terdaftar. Silakan serahkan paketnya ke Unit Dokumen.',
    'Diterima dari unit': 'Paket sudah kami terima dan segera diserahkan ke kurir Kantor Pos.',
    'Proses pengiriman': 'Paket sedang menunggu diambil kurir Kantor Pos.',
    'Di-pick up kurir': 'Paket sudah diambil kurir Kantor Pos. Nomor resi menyusul.',
    'Resi diterima': 'Nomor resi sudah ada dan segera dikirim ke pemohon.',
    'Resi dikirim ke user': 'Nomor resi sudah dikirim ke pemohon lewat WhatsApp.',
  },
  multimedia: {
    Terjadwal: 'Kegiatan sudah dijadwalkan untuk didokumentasikan.',
    'Sudah diliput': 'Kegiatan sudah diliput. Hasil dokumentasi sedang diolah.',
    'Selesai & diarsipkan': 'Hasil dokumentasi sudah selesai dan diarsipkan.',
  },
  arsip: {
    'Diajukan unit': 'Pengajuan penyerahan arsip sudah tercatat.',
    'Diterima & diverifikasi': 'Arsip sudah diterima dan diverifikasi, segera disimpan di depo.',
    'Disimpan di depo': 'Arsip sudah tersimpan di depo arsip.',
  },
  drone: {
    Diajukan: 'Pengajuan sedang ditinjau Unit Dokumen.',
    Disetujui: 'Peminjaman disetujui. Drone disiapkan sesuai jadwal.',
    Dipinjam: 'Drone sedang dipinjam.',
    Dikembalikan: 'Drone sudah dikembalikan. Terima kasih.',
  },
};

/** Tahap yang berarti dokumen sudah bisa diambil unit walau alurnya belum selesai. */
const READY: Partial<Record<ModuleId, string>> = { evp: 'Ditandatangani EVP' };

const UNIT_LABEL: Partial<Record<ModuleId, string>> = {
  evp: 'Unit asal',
  surat: 'Unit tujuan',
  keluar: 'Unit pembuat',
  pos: 'Unit pengirim',
  arsip: 'Unit asal',
  drone: 'Unit peminjam',
};

/** Tahap yang dicatat oleh unit sendiri lewat formulir; selebihnya oleh Unit Dokumen. */
const BY_UNIT = new Set(['Didaftarkan unit', 'Diajukan unit', 'Diajukan']);

// ---------- Bantuan ----------

const defOf = (it: Item) => MODULES.find((m) => m.id === it.module);

/** Kelas warna tahap, sama dengan stageClass di src/stats.ts tetapi dari daftar tahap kiriman server. */
function stageOf(it: Item, status: string) {
  const pre = defOf(it)?.preStatus;
  if (pre && status === pre) return 'pre';
  const i = it.statuses.indexOf(status);
  if (i === it.statuses.length - 1) return 'done';
  return `s${Math.min(2, Math.max(0, i - (pre ? 1 : 0)))}`;
}

/** Bagian alur yang sudah dilalui, 0 sampai 1. */
const progressOf = (it: Item) => Math.max(0, it.statuses.indexOf(it.status)) / Math.max(1, it.statuses.length - 1);

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
/** "7 Okt"; tahun ditulis bila bukan tahun ini. */
function fmtDayShort(v: string) {
  const d = new Date(v.length === 10 ? v + 'T00:00:00' : v);
  const year = d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year });
}
/** "7 Okt, 14.05". */
const fmtShort = (iso: string) => `${fmtDayShort(iso)}, ${fmtClock(iso)}`;

/** "baru saja", "25 menit lalu", "3 jam lalu", "2 hari lalu". */
function ago(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 2) return 'baru saja';
  if (min < 60) return `${min} menit lalu`;
  if (min < 24 * 60) return `${Math.round(min / 60)} jam lalu`;
  return `${Math.round(min / (24 * 60))} hari lalu`;
}

/** Lama proses dari dicatat sampai selesai, mis. "5 jam" atau "3 hari". */
function span(from: string, to: string) {
  const h = (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000;
  if (!(h > 0)) return '';
  return h < 24 ? `${Math.max(1, Math.round(h))} jam` : `${Math.round(h / 24)} hari`;
}

/** Waktu masuk ke tahap sekarang (catatan riwayat terakhir untuk tahap itu). */
const sinceOf = (it: Item) => [...it.history].reverse().find((h) => h.status === it.status)?.at ?? it.created;

const shareUrl = (codes: string[]) => `${location.origin}${location.pathname}#lacak/${codes.join(',')}`;

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Cadangan untuk browser tanpa izin papan klip.
    const t = document.createElement('textarea');
    t.value = text;
    t.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  }
}

/** Salin teks dengan tanda centang sesaat setelah berhasil. */
function useCopied() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback(async (text: string) => {
    if (!(await copyText(text))) return;
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }, []);
  return [copied, copy] as const;
}

// Kode yang pernah dilacak di browser ini, agar unit tidak perlu mengetik ulang.
const RECENT_KEY = 'dokbylt:lacak:recent';
interface Recent {
  kode: string;
  title: string;
  menu: string;
}

function readRecent(): Recent[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter((r) => r && isTrackCode(String(r.kode))).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function remember(items: Item[]) {
  try {
    const now = items.map((i) => ({ kode: i.kode, title: i.title, menu: i.menu }));
    const rest = readRecent().filter((r) => !now.some((n) => n.kode === r.kode));
    localStorage.setItem(RECENT_KEY, JSON.stringify([...now, ...rest].slice(0, 5)));
  } catch {
    /* penyimpanan browser diblokir: abaikan */
  }
}

async function lookup(codes: string[]): Promise<Load> {
  const r = await callFunction('lacak-dokumen', { kode: codes.join(',') });
  if (r.ok) {
    const items = Array.isArray(r.data.items) ? (r.data.items as Item[]) : [];
    const missing = Array.isArray(r.data.missing) ? (r.data.missing as string[]) : [];
    return items.length ? { state: 'ok', items, missing } : { state: 'not_found' };
  }
  if (r.data?.code === 'not_found') return { state: 'not_found' };
  if (r.data?.code === 'invalid') return { state: 'invalid' };
  if (r.error === 'mode lokal') return { state: 'error', message: 'Pelacakan membutuhkan koneksi ke server Unit Dokumen.' };
  return { state: 'error', message: r.error === 'tidak ada koneksi' ? 'Periksa koneksi internet Anda.' : r.error };
}

// ---------- Halaman ----------

export function TrackPublic() {
  const [raw, setRaw] = useState(routeRaw);
  // Daftar beberapa kode terakhir, untuk tombol kembali dari rincian satu dokumen.
  const [list, setList] = useState('');

  useEffect(() => {
    const dark = readPref('theme', '');
    document.documentElement.dataset.theme =
      dark === 'dark' || (!dark && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    const title = document.title;
    document.title = 'Lacak Dokumen · Unit Dokumen BYLT';
    return () => {
      document.title = title;
    };
  }, []);

  useEffect(() => {
    const on = () => {
      setRaw(routeRaw());
      window.scrollTo({ top: 0 });
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);

  const codes = useMemo(() => parseCodes(raw), [raw]);
  useEffect(() => {
    if (codes.length > 1) setList(codes.join(','));
  }, [codes]);
  const back: Back =
    codes.length === 1 && list.split(',').includes(codes[0])
      ? { href: `#lacak/${list}`, label: 'Semua dokumen' }
      : { href: '#lacak', label: 'Lacak kode lain' };

  return (
    <div className="public lk" data-mod="evp">
      <header className="public-head">
        <span className="app-icon" aria-hidden>
          <ScanSearch size={22} strokeWidth={1.8} />
        </span>
        <span>
          <b>Lacak Dokumen</b>
          <span className="muted small block">Unit Dokumen · Balai Yasa Lahat</span>
        </span>
      </header>
      {raw ? <Results key={raw} codes={codes} back={back} /> : <SearchCard />}
      <p className="lk-foot">Unit Dokumen · Balai Yasa Lahat · PT Kereta Api Indonesia (Persero)</p>
    </div>
  );
}

// ---------- Pencarian ----------

function CodeForm({ initial = '', autoFocus = false }: { initial?: string; autoFocus?: boolean }) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState('');
  const codes = parseCodes(text);
  const one = codes.length <= 1 ? (codes[0] ?? '') : '';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!codes.length) return setError('Masukkan kode lacak terlebih dahulu.');
    const bad = codes.find((c) => !isTrackCode(c));
    if (bad)
      return setError(
        bad.length !== 10
          ? `Kode lacak terdiri dari 10 karakter, yang Anda masukkan ${bad.length} karakter.`
          : 'Kode lacak hanya berisi angka 0–9 dan huruf A–F.',
      );
    if (codes.length > MAX_CODES) return setError(`Lacak paling banyak ${MAX_CODES} kode sekaligus.`);
    location.hash = `lacak/${codes.join(',')}`;
  };

  return (
    <>
      <form className="lk-form" onSubmit={submit} noValidate>
        <label className="lk-field">
          <span className="lk-sr">Kode lacak</span>
          <input
            className="lk-input"
            value={text}
            autoFocus={autoFocus}
            placeholder="mis. 3E657AAE08"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-invalid={!!error}
            aria-describedby="lk-help"
            onChange={(e) => {
              setText(e.target.value);
              setError('');
            }}
          />
          <span className={'lk-count' + (isTrackCode(one) ? ' full' : '')} aria-hidden>
            {codes.length > 1 ? `${codes.length} kode` : isTrackCode(one) ? <Check size={16} strokeWidth={2.6} /> : `${one.length}/10`}
          </span>
        </label>
        <button className="pill-btn big lk-go">
          Lacak <ArrowRight size={17} />
        </button>
      </form>
      <p id="lk-help" className={'lk-help' + (error ? ' error' : '')} role={error ? 'alert' : undefined}>
        {error || 'Kode berisi 10 karakter, tertera di bawah kode QR pada tanda terima.'}
      </p>
    </>
  );
}

function SearchCard() {
  const [recent, setRecent] = useState(readRecent);
  return (
    <main className="lk-card lk-search">
      <span className="lk-mark" aria-hidden>
        <ScanSearch size={28} strokeWidth={1.7} />
      </span>
      <h1>Lacak dokumen.</h1>
      <p className="lk-lead">
        Masukkan kode lacak dari tanda terima atau pesan WhatsApp Unit Dokumen untuk melihat posisi dokumen Anda saat
        ini.
      </p>
      <CodeForm autoFocus={!matchMedia('(pointer: coarse)').matches} />

      {recent.length > 0 && (
        <section className="lk-recent" aria-label="Terakhir dilacak">
          <div className="lk-recent-head">
            <span>Terakhir dilacak</span>
            <button
              type="button"
              className="link"
              onClick={() => {
                try {
                  localStorage.removeItem(RECENT_KEY);
                } catch {
                  /* abaikan */
                }
                setRecent([]);
              }}
            >
              Hapus
            </button>
          </div>
          <ul>
            {recent.map((r) => (
              <li key={r.kode}>
                <a href={`#lacak/${r.kode}`} className="lk-recent-row">
                  <span className="grow">
                    <b className="ellipsis block">{r.title}</b>
                    <span className="lk-recent-meta">
                      {r.menu} · <span className="lk-mono">{r.kode}</span>
                    </span>
                  </span>
                  <ChevronRight size={16} />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="lk-points">
        <li>
          <ShieldCheck size={15} /> Tanpa login
        </li>
        <li>
          <RefreshCw size={14} /> Status terkini
        </li>
        <li>
          <EyeOff size={15} /> Tanpa data pribadi
        </li>
      </ul>
    </main>
  );
}

// ---------- Hasil ----------

function Results({ codes, back }: { codes: string[]; back: Back }) {
  const invalid = !codes.length || codes.length > MAX_CODES || codes.some((c) => !isTrackCode(c));
  const [load, setLoad] = useState<Load>(invalid ? { state: 'invalid' } : { state: 'loading' });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const [at, setAt] = useState(0);
  // Sudah pernah tampil: gangguan sementara saat memperbarui tidak menghapus status yang sudah ada.
  const shown = useRef(false);
  const key = codes.join(',');

  const refresh = useCallback(async () => {
    if (invalid) return;
    setBusy(true);
    const next = await lookup(key.split(','));
    setBusy(false);
    setAt(Date.now());
    if (next.state === 'error' && shown.current) return setFailed(next.message);
    setFailed('');
    setLoad(next);
    if (next.state === 'ok') {
      shown.current = true;
      remember(next.items);
    }
  }, [invalid, key]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Kembali ke tab ini setelah beberapa saat: muat ulang diam-diam.
  useEffect(() => {
    const on = () => {
      if (document.visibilityState === 'visible' && at && Date.now() - at > 30_000) void refresh();
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [at, refresh]);

  if (load.state === 'loading') return <Skeleton />;
  if (load.state !== 'ok')
    return (
      <Problem load={load} codes={codes} onRetry={refresh} busy={busy}>
        {load.state === 'error' && <BackBar back={{ href: '#lacak', label: 'Lacak kode lain' }} />}
      </Problem>
    );

  const actions = <Actions codes={codes} busy={busy} at={at} failed={failed} onRefresh={refresh} />;
  return codes.length === 1 && load.items.length === 1 ? (
    <Detail item={load.items[0]} back={back} actions={actions} />
  ) : (
    <List items={load.items} missing={load.missing} actions={actions} />
  );
}

function BackBar({ back, code }: { back: Back; code?: string }) {
  const [copied, copy] = useCopied();
  return (
    <nav className="lk-bar">
      <a href={back.href} className="lk-back">
        <ArrowLeft size={17} /> {back.label}
      </a>
      {code && (
        <button type="button" className="lk-code" onClick={() => copy(code)} title="Salin kode lacak">
          <span>Kode</span>
          <b>{code}</b>
          {copied ? <Check size={14} strokeWidth={2.6} className="ok" /> : <Copy size={14} />}
          <span className="lk-sr" aria-live="polite">
            {copied ? 'Kode disalin' : ''}
          </span>
        </button>
      )}
    </nav>
  );
}

function Detail({ item, back, actions }: { item: Item; back: Back; actions: ReactNode }) {
  const def = defOf(item);
  const unitLabel = UNIT_LABEL[item.module];
  return (
    <div className="lk-stack">
      <BackBar back={back} code={item.kode} />
      <section className="lk-card lk-hero" data-mod={item.module}>
        <div className="lk-eyebrow">
          <span className="app-icon sm" aria-hidden>
            {def ? <Icon name={def.icon} size={14} /> : null}
          </span>
          <span>
            {item.menu}
            {item.kind && <span className="lk-kind"> · {item.kind}</span>}
          </span>
        </div>
        <h1 className="lk-title">{item.title}</h1>
        <p className="lk-meta">
          {item.unit && unitLabel && (
            <span>
              {unitLabel} <b>{item.unit}</b>
            </span>
          )}
          <span>
            Dicatat <b>{fmtDate(item.created)}</b>
          </span>
        </p>
        <StatusPanel item={item} />
        <Stepper item={item} />
      </section>
      <History item={item} />
      {actions}
    </div>
  );
}

function StatusPanel({ item }: { item: Item }) {
  const ready = !item.done && READY[item.module] === item.status;
  const cls = ready ? 'done' : stageOf(item, item.status);
  const note = STAGE_NOTE[item.module]?.[item.status];
  const since = sinceOf(item);
  const due = item.deadline && !item.done ? daysUntil(item.deadline) : undefined;
  const took = item.done && item.history.length > 1 ? span(item.created, since) : '';
  return (
    <div className={`lk-status ${cls}`} role="status">
      <span className={'lk-status-icon' + (item.done || ready ? '' : ' live')} aria-hidden>
        {item.done ? (
          <CircleCheck size={22} strokeWidth={2} />
        ) : ready ? (
          <PackageCheck size={21} strokeWidth={2} />
        ) : (
          <Clock3 size={20} strokeWidth={2} />
        )}
      </span>
      <div className="grow">
        <span className="lk-status-label">{item.done ? 'Selesai' : ready ? 'Sudah dapat diambil' : 'Posisi saat ini'}</span>
        <h2>{item.status}</h2>
        {note && <p>{note}</p>}
        <div className="lk-facts">
          <span className="lk-fact" title={`${fmtDay(since)}, pukul ${fmtClock(since)}`}>
            <Clock3 size={13} />
            <span>
              {item.done ? 'Selesai' : 'Sejak'} {fmtShort(since)}
              <span className="muted"> · {ago(since)}</span>
            </span>
          </span>
          {took && (
            <span className="lk-fact">
              <Flag size={13} /> Total proses {took}
            </span>
          )}
          {due !== undefined && (
            <span className={'lk-fact' + (due < 0 ? ' over' : due <= 1 ? ' soon' : '')}>
              <Flag size={13} />
              <span title={`Target selesai ${fmtDate(item.deadline)}`}>
                Target {fmtDayShort(item.deadline!)} · {dueLabel(due).toLowerCase()}
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ item }: { item: Item }) {
  const cur = item.statuses.indexOf(item.status);
  const style = { '--n': item.statuses.length, '--p': progressOf(item) } as CSSProperties;
  return (
    <ol className="lk-steps" style={style} aria-label={`Tahap ${cur + 1} dari ${item.statuses.length}`}>
      {item.statuses.map((s, i) => (
        <li
          key={s}
          className={(i < cur ? 'past ' : i === cur ? 'on ' : '') + stageOf(item, s)}
          aria-current={i === cur ? 'step' : undefined}
        >
          <span className="lk-dot">{i < cur || (i === cur && item.done) ? <Check size={15} strokeWidth={3} /> : i + 1}</span>
          <span className="lk-step-label">
            {s}
            {i === cur && !item.done && <span className="lk-now">Saat ini</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function History({ item }: { item: Item }) {
  const list = [...item.history].reverse();
  return (
    <section className="lk-card lk-history" data-mod={item.module}>
      <div className="lk-history-head">
        <h2>Riwayat tahap</h2>
        <span className="muted small">{list.length} catatan</span>
      </div>
      {list.length ? (
        <ol className="lk-timeline">
          {list.map((h, i) => (
            <li key={`${h.at}-${i}`} className={(i === 0 ? 'now ' : '') + stageOf(item, h.status)}>
              <span className="lk-tl-dot" aria-hidden />
              <div className="lk-tl-main">
                <b>{h.status}</b>
                <span>{BY_UNIT.has(h.status) ? 'Oleh unit pengusul' : 'Unit Dokumen'}</span>
              </div>
              <time dateTime={h.at}>
                {fmtDay(h.at)}
                <span>pukul {fmtClock(h.at)}</span>
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">Belum ada catatan perpindahan tahap.</p>
      )}
    </section>
  );
}

function List({ items, missing, actions }: { items: Item[]; missing: string[]; actions: ReactNode }) {
  const done = items.filter((i) => i.done).length;
  return (
    <div className="lk-stack">
      <BackBar back={{ href: '#lacak', label: 'Lacak kode lain' }} />
      <section className="lk-card">
        <h1 className="lk-title lk-list-title">{items.length} dokumen dilacak.</h1>
        <p className="lk-meta">
          <span>
            <b>{done}</b> selesai
          </span>
          <span>
            <b>{items.length - done}</b> dalam proses
          </span>
        </p>
        <ul className="lk-list">
          {items.map((it) => {
            const def = defOf(it);
            const ready = !it.done && READY[it.module] === it.status;
            const cls = ready ? 'done' : stageOf(it, it.status);
            return (
              <li key={it.kode} data-mod={it.module}>
                <a href={`#lacak/${it.kode}`} className={`lk-row ${cls}`}>
                  <span className="app-icon sm" aria-hidden>
                    {def ? <Icon name={def.icon} size={14} /> : null}
                  </span>
                  <span className="lk-row-main">
                    <b className="ellipsis block">{it.title}</b>
                    <span className="lk-row-meta">
                      {it.menu}
                      {it.kind ? ` · ${it.kind}` : ''} · <span className="lk-mono">{it.kode}</span>
                    </span>
                    <span className="lk-mini" style={{ '--p': progressOf(it) } as CSSProperties}>
                      <i />
                    </span>
                  </span>
                  <span className={'pill ' + cls}>{ready ? 'Siap diambil' : it.status}</span>
                  <ChevronRight size={16} className="lk-chev" />
                </a>
              </li>
            );
          })}
        </ul>
        {missing.length > 0 && (
          <p className="notice lk-missing">
            {missing.length > 1 ? 'Kode berikut tidak ditemukan: ' : 'Kode ini tidak ditemukan: '}
            <span className="lk-mono">{missing.join(', ')}</span>
          </p>
        )}
      </section>
      {actions}
    </div>
  );
}

function Actions({
  codes,
  busy,
  at,
  failed,
  onRefresh,
}: {
  codes: string[];
  busy: boolean;
  at: number;
  failed: string;
  onRefresh: () => void;
}) {
  const [copied, copy] = useCopied();
  const url = shareUrl(codes);
  const canShare = typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches;
  return (
    <>
      <div className="lk-actions">
        <button type="button" className="btn" onClick={onRefresh} disabled={busy}>
          <RefreshCw size={15} className={busy ? 'spin' : ''} /> {busy ? 'Memperbarui…' : 'Perbarui'}
        </button>
        <span className={'lk-updated' + (failed ? ' error' : '')} aria-live="polite">
          {failed ? `Gagal memperbarui. ${failed}` : at ? `Diperbarui pukul ${fmtClock(new Date(at).toISOString())}` : ''}
        </span>
        <span className="grow" />
        <button
          type="button"
          className="btn"
          onClick={() =>
            canShare ? navigator.share({ title: 'Lacak dokumen', url }).catch(() => undefined) : copy(url)
          }
        >
          {copied ? <Check size={15} strokeWidth={2.6} /> : canShare ? <Share2 size={15} /> : <Link2 size={15} />}
          {copied ? 'Tautan disalin' : canShare ? 'Bagikan' : 'Salin tautan'}
        </button>
      </div>
      <p className="lk-privacy">
        <ShieldCheck size={15} />
        <span>
          Halaman ini hanya menampilkan tahap dokumen. Nomor WhatsApp, catatan, dan lampiran tidak ditampilkan.
        </span>
      </p>
    </>
  );
}

function Problem({
  load,
  codes,
  onRetry,
  busy,
  children,
}: {
  load: Load;
  codes: string[];
  onRetry: () => void;
  busy: boolean;
  children: ReactNode;
}) {
  const shown = codes.join(', ');
  const [icon, title, text] =
    load.state === 'invalid'
      ? [
          <SearchX size={28} strokeWidth={1.7} />,
          'Kode lacak tidak valid.',
          codes.length > MAX_CODES
            ? `Satu tautan berisi paling banyak ${MAX_CODES} kode.`
            : `“${shown || '–'}” bukan kode lacak. Kode berisi 10 karakter angka 0–9 dan huruf A–F, mis. 3E657AAE08.`,
        ]
      : load.state === 'not_found'
        ? [
            <SearchX size={28} strokeWidth={1.7} />,
            'Kode tidak ditemukan.',
            'Periksa kembali kode pada tanda terima atau pesan WhatsApp. Bila kode sudah benar, hubungi Unit Dokumen.',
          ]
        : [
            <WifiOff size={28} strokeWidth={1.7} />,
            'Status belum bisa dimuat.',
            load.state === 'error' ? load.message : '',
          ];
  return (
    <div className="lk-stack">
      {children}
      <main className="lk-card lk-search lk-problem">
        <span className="lk-mark" aria-hidden>
          {icon}
        </span>
        <h1>{title}</h1>
        <p className="lk-lead">{text}</p>
        {load.state === 'error' ? (
          <button type="button" className="pill-btn big" onClick={onRetry} disabled={busy}>
            <RefreshCw size={16} className={busy ? 'spin' : ''} /> Coba lagi
          </button>
        ) : (
          <CodeForm initial={shown} />
        )}
      </main>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="lk-stack" aria-busy="true" aria-label="Memuat status dokumen">
      <div className="lk-bar">
        <i className="lk-skel-line" style={{ width: 140 }} />
      </div>
      <div className="lk-card lk-skel">
        <i style={{ width: '28%' }} />
        <i className="h" style={{ width: '78%' }} />
        <i style={{ width: '46%' }} />
        <i className="box" />
        <i className="steps" />
      </div>
      <div className="lk-card lk-skel">
        <i style={{ width: '30%' }} />
        <i style={{ width: '64%' }} />
        <i style={{ width: '52%' }} />
      </div>
    </div>
  );
}
