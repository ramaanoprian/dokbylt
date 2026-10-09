// Gerak halus di seluruh aplikasi tanpa mengubah alur komponen:
// 1. Animasi keluar: dialog, menu, dan lembar yang dilepas React ditahan sebentar sebagai "bayangan"
//    yang tidak bisa disentuh (inert), memudar, lalu dibuang.
// 2. Masuk halaman: elemen .page yang baru dipasang diberi data-entering sebentar, agar baris tabel
//    dan kartu hanya bergerak masuk pada tampilan pertama, bukan setiap kali disaring. Halaman yang
//    dibuka lewat menu diberi data-quick: cukup silang-pudar singkat, tanpa gerak masuk bergiliran.
// 3. View Transitions untuk ganti tema dan pindah halaman, dengan cadangan tanpa animasi.
import { flushSync } from 'react-dom';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Elemen yang diberi animasi keluar, beserta lamanya (ms) sebelum dibuang. */
const LEAVE: [string, number][] = [
  ['.overlay', 220],
  ['.palette-overlay', 180],
  ['.gnav-sheet', 220],
  ['.menu-pop', 140],
  ['.bell-pop', 140],
  ['.ux-pop', 140],
  ['.ux-stage-menu', 140],
];

function leaveTime(el: Element) {
  // Dialog laporan sudah punya animasi tutup sendiri.
  if (el.classList.contains('closing') || el.classList.contains('is-leaving')) return 0;
  for (const [sel, ms] of LEAVE) if (el.matches(sel)) return ms;
  return 0;
}

function ghost(node: HTMLElement, parent: Node, before: Node | null, ms: number) {
  node.classList.add('is-leaving');
  node.setAttribute('inert', '');
  node.setAttribute('aria-hidden', 'true');
  try {
    parent.insertBefore(node, before && before.parentNode === parent ? before : null);
  } catch {
    return;
  }
  setTimeout(() => node.remove(), ms);
}

const ENTER_MS = 900;

// Judul tabel hanya bisa menempel ke layar bila pembungkusnya tidak menggulir ke samping.
// Pembungkus diberi data-fits selama tabelnya muat; bila tidak, ia tetap bisa digeser.
const fits = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => {
  const wraps = new Set<HTMLElement>();
  for (const e of entries) {
    const w = (e.target as HTMLElement).closest<HTMLElement>('.table-wrap');
    if (w) wraps.add(w);
  }
  for (const w of wraps) {
    const t = w.querySelector('table');
    if (!t || !w.isConnected) continue;
    w.toggleAttribute('data-fits', t.offsetWidth <= w.clientWidth + 1);
  }
});

const watched = new Set<HTMLElement>();

function watchTable(wrap: HTMLElement) {
  const t = wrap.querySelector('table');
  if (!fits || !t || watched.has(wrap) || !wrap.closest('.ux-list-card')) return;
  watched.add(wrap);
  fits.observe(wrap);
  fits.observe(t);
}

function unwatchGone() {
  for (const w of watched) {
    if (w.isConnected) continue;
    watched.delete(w);
    fits?.unobserve(w);
    const t = w.querySelector('table');
    if (t) fits?.unobserve(t);
  }
}

function markEntering(el: HTMLElement) {
  if (document.documentElement.dataset.vt === 'nav') {
    el.setAttribute('data-quick', '');
    return;
  }
  el.setAttribute('data-entering', '');
  setTimeout(() => el.removeAttribute('data-entering'), ENTER_MS);
}

let started = false;

/** Dipanggil sekali dari main.tsx. */
export function startMotion() {
  if (started || typeof MutationObserver === 'undefined') return;
  started = true;
  new MutationObserver((records) => {
    // Selama View Transition tidak ada bayangan keluar: bayangan ikut terekam dan menumpuk di atas tampilan baru.
    const calm = reduced() || !!document.documentElement.dataset.vt;
    if (watched.size && records.some((r) => r.removedNodes.length)) unwatchGone();
    for (const rec of records) {
      if (!calm && rec.target.isConnected) {
        rec.removedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement) || n.isConnected) return;
          const ms = leaveTime(n);
          if (ms) ghost(n, rec.target, rec.nextSibling, ms);
        });
      }
      rec.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        if (n.classList.contains('page')) markEntering(n);
        else if (n.firstElementChild) n.querySelectorAll<HTMLElement>('.page').forEach(markEntering);
        if (n.classList.contains('table-wrap')) watchTable(n);
        else if (n.firstElementChild) n.querySelectorAll<HTMLElement>('.table-wrap').forEach(watchTable);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
}

type DocVT = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };

/**
 * Menjalankan perubahan state di dalam View Transition bila browser mendukung.
 * `kind` dipakai CSS (html[data-vt]) untuk memilih gerakannya.
 */
export function withTransition(kind: 'theme' | 'nav', update: () => void) {
  const d = document as DocVT;
  if (!d.startViewTransition || reduced() || document.visibilityState !== 'visible') {
    update();
    return;
  }
  const root = document.documentElement;
  root.dataset.vt = kind;
  // Menu atau dialog yang masih memudar keluar dibuang sekarang agar tidak terekam setengah jadi.
  document.querySelectorAll('.is-leaving').forEach((n) => n.remove());
  try {
    const vt = d.startViewTransition(() => flushSync(update));
    vt.finished.finally(() => {
      if (root.dataset.vt === kind) delete root.dataset.vt;
    });
  } catch {
    delete root.dataset.vt;
    update();
  }
}
