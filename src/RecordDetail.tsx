import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  Copy,
  ExternalLink,
  FileText,
  Pencil,
  Printer,
  X,
} from 'lucide-react';
import type { Field, ModuleDef } from './modules';
import { attachmentsOf, type Attachment, type DocRecord } from './backend';
import type { FileApi } from './Attachments';
import { Icon } from './icons';
import { useToast } from './toast';
import { fmtDays, stageClass } from './stats';
import { printDisposition, printReceipt } from './print';
import { trackCode, trackUrl } from './track';
import { missingFor, nextStatus, titleOf } from './records';
import { daysSince, daysUntil, deadlineOf, dueLabel, dueTone, fmtDate, isDone, lastMove, shown } from './util';

interface Props {
  mod: ModuleDef;
  record: DocRecord;
  /** Data sudah dihapus (mis. dari perangkat lain); panel tetap menampilkan isi terakhirnya. */
  gone?: boolean;
  /** Posisi di daftar yang sedang tampil, mis. 3 dari 128. */
  position?: { index: number; total: number };
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  onEdit: () => void;
  onMove: (r: DocRecord, next: string) => void;
  /** Form lain sedang terbuka di atas panel: pintasan keyboard panel dimatikan. */
  suspended: boolean;
  files: FileApi;
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isPhone = () => matchMedia('(max-width: 734px)').matches;

const fmtStamp = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Nilai yang ditampilkan di rincian: tanggal dibaca, angka dipisah titik, pilihan "Lainnya" diganti keterangannya. */
function valueOf(f: Field, v: Record<string, string>) {
  const s = shown(f, v).trim();
  if (!s) return '';
  if (f.type === 'date') return fmtDate(s);
  if (f.type === 'number' && /^\d+$/.test(s)) return (f.key === 'biaya' ? 'Rp ' : '') + Number(s).toLocaleString('id-ID');
  return s;
}

/** Panel rincian satu data (laci kanan di layar lebar, lembar penuh di HP). Hanya baca; ubah lewat tombol Edit. */
export function RecordDetail({ mod, record: r, gone, position, onPrev, onNext, onClose, onEdit, onMove, suspended, files }: Props) {
  const toast = useToast();
  const [leaving, setLeaving] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (reducedMotion()) return onClose();
    // Sesudah lembar digeser lalu batal, animasi CSS dimatikan lewat gaya inline: tutup dengan transisi saja.
    const el = panelRef.current;
    if (el?.style.animationName === 'none') {
      el.style.transition = 'transform 0.22s cubic-bezier(0.4, 0, 1, 1)';
      el.style.transform = isPhone() ? 'translateY(100%)' : 'translateX(100%)';
    }
    setLeaving(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  // Fokus ke panel saat dibuka, kembali ke baris asal saat ditutup.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      if (prev?.isConnected) prev.focus({ preventScroll: true });
    };
  }, []);

  // Data lain dibuka: mulai lagi dari atas.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    setScrolled(false);
  }, [r.id]);

  // Gulir halaman di belakang dikunci hanya di HP (lembar menutupi layar).
  useEffect(() => {
    if (!isPhone()) return;
    document.documentElement.classList.add('ux-lock');
    return () => document.documentElement.classList.remove('ux-lock');
  }, []);

  // Esc tutup, ↑/↓ atau K/J data sebelumnya/berikutnya, E edit.
  useEffect(() => {
    if (suspended) return;
    const on = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable) return;
      if (document.querySelector('.overlay:not(.is-leaving), .palette-overlay:not(.is-leaving)')) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        e.preventDefault();
        close();
      } else if (k === 'arrowdown' || k === 'j') {
        e.preventDefault();
        onNext?.();
      } else if (k === 'arrowup' || k === 'k') {
        e.preventDefault();
        onPrev?.();
      } else if (k === 'e' && !gone) {
        e.preventDefault();
        onEdit();
      } else if (k === 'tab') {
        // Fokus tetap di dalam panel.
        const items = [
          ...(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') ?? []),
        ].filter((el) => el.offsetParent);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [suspended, onNext, onPrev, onEdit, gone, close]);

  // Geser turun untuk menutup lembar di HP.
  const drag = useRef<{ y: number; dy: number; id: number; captured: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' || !isPhone()) return;
    drag.current = { y: e.clientY, dy: 0, id: e.pointerId, captured: false };
  };
  const onDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = panelRef.current;
    if (!d || !el) return;
    d.dy = Math.max(0, e.clientY - d.y);
    if (!d.captured && d.dy > 8) {
      d.captured = true;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(d.id);
      } catch {
        /* tetap bisa digeser tanpa capture */
      }
      el.style.transition = 'none';
      el.style.animation = 'none';
    }
    if (d.captured) el.style.transform = `translateY(${d.dy}px)`;
  };
  const onUp = () => {
    const d = drag.current;
    const el = panelRef.current;
    drag.current = null;
    if (!d?.captured || !el) return;
    el.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
    if (d.dy > 110) {
      el.style.transform = 'translateY(100%)';
      closing.current = true;
      setLeaving(true);
      setTimeout(onClose, 200);
    } else el.style.transform = '';
  };

  const idx = mod.statuses.indexOf(r.status);
  const done = isDone(mod, r);
  const next = nextStatus(mod, r);
  const need = next ? missingFor(mod, r, next) : [];
  const due = deadlineOf(mod, r);
  const dueDays = due ? daysUntil(due) : undefined;
  const age = daysSince(lastMove(r));
  const filled = mod.fields.filter((f) => valueOf(f, r.values));
  const atts = attachmentsOf(r.values);
  const title = titleOf(mod, r);
  const history = r.history.map((h, i) => ({ ...h, until: r.history[i + 1]?.at }));

  return (
    <div className={'ux-detail-root' + (leaving ? ' ux-leaving' : '')} data-mod={mod.id}>
      <div className="ux-scrim" onClick={close} aria-hidden />
      <div
        ref={panelRef}
        className={'ux-detail' + (scrolled ? ' scrolled' : '')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ux-detail-title"
        tabIndex={-1}
      >
        <header className="ux-d-head" onPointerDown={onDown} onPointerMove={onDrag} onPointerUp={onUp} onPointerCancel={onUp}>
          <span className="ux-grabber" aria-hidden />
          <span className="app-icon sm">
            <Icon name={mod.icon} size={14} />
          </span>
          <span className="ux-d-crumb grow">
            <b>{mod.menu}</b>
            {position && (
              <span className="muted">
                {' '}
                · {position.index + 1} dari {position.total.toLocaleString('id-ID')}
              </span>
            )}
          </span>
          <div className="ux-d-nav">
            <button
              type="button"
              className="icon-btn"
              onClick={onPrev}
              disabled={!onPrev}
              aria-label="Data sebelumnya"
              title="Data sebelumnya (↑ atau K)"
            >
              <ChevronUp size={18} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={onNext}
              disabled={!onNext}
              aria-label="Data berikutnya"
              title="Data berikutnya (↓ atau J)"
            >
              <ChevronDown size={18} />
            </button>
          </div>
          <button type="button" className="icon-btn ux-d-close" onClick={close} aria-label="Tutup" title="Tutup (Esc)">
            <X size={18} />
          </button>
        </header>

        <div className="ux-d-body" ref={bodyRef} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}>
          <div className="ux-d-content" key={r.id}>
            {gone && (
              <p className="notice ux-d-gone">
                <CircleAlert size={16} /> Data ini sudah dihapus. Isinya ditampilkan untuk dibaca saja.
              </p>
            )}
            <h2 id="ux-detail-title" className="ux-d-title">
              {title}
            </h2>
            <div className="ux-d-meta">
              <span className={'pill ' + stageClass(mod, r.status)}>{r.status}</span>
              {dueDays !== undefined ? (
                <span className={'due ' + dueTone(dueDays)}>
                  Tenggat {fmtDate(due)} · {dueLabel(dueDays)}
                </span>
              ) : done ? (
                <span className="due muted">Selesai {fmtDate(lastMove(r))}</span>
              ) : (
                <span className={'due ' + (age >= 3 ? 'stale' : 'muted')}>
                  {age === 0 ? 'Masuk tahap ini hari ini' : `${age} hari di tahap ini`}
                </span>
              )}
            </div>

            <ol className="ux-steps" aria-label={`Tahap ${idx + 1} dari ${mod.statuses.length}`}>
              {mod.statuses.map((s, i) => (
                <li
                  key={s}
                  className={(i < idx ? 'past ' : i === idx ? 'on ' : '') + stageClass(mod, s)}
                  aria-current={i === idx ? 'step' : undefined}
                >
                  <span className="ux-step-dot">{i < idx || (i === idx && done) ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
                  <span className="ux-step-label">{s}</span>
                </li>
              ))}
            </ol>

            {done ? (
              <div className="ux-next done">
                <CircleCheck size={20} className="ux-next-icon" />
                <div className="grow">
                  <span className="ux-next-k">Selesai</span>
                  <b className="ux-next-v">Sudah di tahap akhir sejak {fmtDate(lastMove(r))}</b>
                </div>
              </div>
            ) : next ? (
              <div className={'ux-next' + (need.length ? ' warn' : '')}>
                <div className="grow">
                  <span className="ux-next-k">Langkah berikutnya</span>
                  <b className="ux-next-v">{next}</b>
                  {need.length > 0 && (
                    <span className="ux-next-need">
                      Lengkapi {need.map((f) => f.label.toLowerCase()).join(', ')} dulu.
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="pill-btn ux-next-btn"
                  onClick={() => onMove(r, next)}
                  disabled={gone}
                  title={need.length ? `Lengkapi isian lalu pindahkan ke ${next}` : `Pindahkan ke ${next}`}
                >
                  {need.length ? 'Lengkapi' : 'Pindahkan'} <ArrowRight size={14} />
                </button>
              </div>
            ) : null}

            <section className="ux-d-sec">
              <h3 className="ux-d-h">Rincian</h3>
              {filled.length ? (
                <dl className="ux-dl">
                  {filled.map((f) => {
                    const v = valueOf(f, r.values);
                    return (
                      <div key={f.key}>
                        <dt>{f.label}</dt>
                        <dd className={f.type === 'textarea' ? 'pre' : ''}>
                          {f.type === 'url' && /^https?:\/\//i.test(v) ? (
                            <a href={v} target="_blank" rel="noreferrer" className="ux-d-url">
                              {v.replace(/^https?:\/\//i, '')} <ExternalLink size={13} />
                            </a>
                          ) : (
                            v
                          )}
                          {f.key === 'tenggat' && dueDays !== undefined && (
                            <>
                              {' · '}
                              <span className={'due ' + dueTone(dueDays)}>{dueLabel(dueDays)}</span>
                            </>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              ) : (
                <p className="muted small">Belum ada isian.</p>
              )}
            </section>

            {atts.length > 0 && (
              <section className="ux-d-sec">
                <h3 className="ux-d-h">
                  Lampiran <span className="ux-d-n">{atts.length}</span>
                </h3>
                <ul className="ux-atts">
                  {atts.map((a) => (
                    <AttachmentTile key={a.path} a={a} files={files} />
                  ))}
                </ul>
              </section>
            )}

            <section className="ux-d-sec">
              <h3 className="ux-d-h">Riwayat tahap</h3>
              {history.length ? (
                <ol className="ux-tl">
                  {[...history].reverse().map((h, i) => (
                    <li key={i} className={(i === 0 ? 'now ' : '') + stageClass(mod, h.status)}>
                      <span className="ux-tl-dot" aria-hidden />
                      <div className="ux-tl-main">
                        <b>{h.status}</b>
                        <span className="muted">
                          {fmtStamp(h.at)}
                          {h.by && ` · ${h.by}`}
                        </span>
                      </div>
                      {h.until ? (
                        <span className="ux-tl-dur" title="Lama di tahap ini">
                          {fmtDays((new Date(h.until).getTime() - new Date(h.at).getTime()) / 86_400_000)}
                        </span>
                      ) : (
                        !done && (
                          <span className="ux-tl-dur now" title="Lama di tahap ini sampai sekarang">
                            {fmtDays((Date.now() - new Date(h.at).getTime()) / 86_400_000)}
                          </span>
                        )
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted small">Belum ada riwayat.</p>
              )}
              <p className="ux-d-by muted">
                Dicatat {r.createdBy ? `oleh ${r.createdBy} ` : ''}pada {fmtStamp(r.createdAt)}
                {r.updatedAt !== r.createdAt && (
                  <>
                    <br />
                    Terakhir diubah {r.updatedBy ? `oleh ${r.updatedBy} ` : ''}pada {fmtStamp(r.updatedAt)}
                  </>
                )}
              </p>
            </section>

            <TrackBox r={r} onCopied={(ok) => toast(ok ? 'Tautan lacak disalin' : 'Tautan tidak bisa disalin')} />

            <p className="ux-d-keys muted">
              <kbd>↑</kbd> <kbd>↓</kbd> data lain <span aria-hidden>·</span> <kbd>E</kbd> edit <span aria-hidden>·</span> <kbd>Esc</kbd>{' '}
              tutup
            </p>
          </div>
        </div>

        <footer className="ux-d-foot">
          <button type="button" className="btn ux-d-edit" onClick={onEdit} disabled={gone} title="Edit (E)">
            <Pencil size={15} /> Edit
          </button>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={() => printReceipt(mod, r)} title="Cetak tanda terima">
            <Printer size={15} /> <span className="hide-sm">Cetak tanda terima</span>
            <span className="only-mobile-inline">Tanda terima</span>
          </button>
          {mod.id === 'surat' && (
            <button type="button" className="btn ghost" onClick={() => printDisposition(mod, r)} title="Cetak lembar disposisi">
              <Printer size={15} /> <span className="hide-sm">Cetak disposisi</span>
              <span className="only-mobile-inline">Disposisi</span>
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

/** Lampiran sebagai ubin kecil; dibuka di tab baru. */
function AttachmentTile({ a, files }: { a: Attachment; files: FileApi }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    files.url(a.path).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [a.path, files]);
  const isImg = a.type.startsWith('image/');
  return (
    <li>
      <a className="ux-att" href={src ?? undefined} target="_blank" rel="noreferrer" title={a.name} aria-label={`Buka ${a.name}`}>
        <span className="ux-att-thumb">
          {isImg && src ? <img src={src} alt="" loading="lazy" /> : <FileText size={24} />}
        </span>
        <span className="ux-att-name ellipsis">{a.name}</span>
      </a>
    </li>
  );
}

/** Tautan lacak publik beserta QR kecil dan tombol salin. */
function TrackBox({ r, onCopied }: { r: DocRecord; onCopied: (ok: boolean) => void }) {
  const url = trackUrl(r);
  const [img, setImg] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { width: 220, margin: 1, errorCorrectionLevel: 'M' }).then((d) => live && setImg(d));
    return () => {
      live = false;
    };
  }, [url]);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = () =>
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        onCopied(true);
      },
      () => onCopied(false),
    ) ?? onCopied(false);

  return (
    <section className="ux-d-sec">
      <h3 className="ux-d-h">Lacak dokumen</h3>
      <div className="ux-track">
        <span className="ux-track-qr">{img ? <img src={img} alt={`QR lacak ${trackCode(r)}`} /> : null}</span>
        <div className="ux-track-main">
          <span className="ux-track-k">Kode lacak</span>
          <code className="ux-track-code">{trackCode(r)}</code>
          <span className="ux-track-url">{url.replace(/^https?:\/\//, '')}</span>
          <div className="ux-track-actions">
            <button type="button" className={'btn small' + (copied ? ' ux-copied' : '')} onClick={copy}>
              {copied ? <Check size={14} strokeWidth={2.6} /> : <Copy size={14} />} {copied ? 'Disalin' : 'Salin tautan'}
            </button>
            <a className="btn small ghost" href={url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Buka
            </a>
          </div>
        </div>
      </div>
      <p className="muted small ux-track-hint">Bagikan ke unit agar mereka bisa melihat posisi dokumennya tanpa login.</p>
    </section>
  );
}
