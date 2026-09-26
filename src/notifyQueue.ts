// Antrean WA ke PIC unit. Dokumen yang sampai di tahap "Ditandatangani EVP" tidak langsung
// dikabari: ditunggu sebentar supaya dokumen lain milik PIC yang sama (nomor WA sama) ikut
// dalam satu pesan. Setiap dokumen baru memulai hitungan ulang.
import { useSyncExternalStore } from 'react';
import { sendNotify, type DocRecord, type NotifyResult } from './backend';
import { waNumber } from './util';

export const NOTIFY_WAIT_MS = 60_000;

export interface Batch {
  target: string;
  pic: string;
  docs: { id: string; values: Record<string, string> }[];
  sendAt: number;
}

type Listener = () => void;
type ResultListener = (b: Batch, r: NotifyResult) => void;

let batches: Batch[] = [];
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<Listener>();
const resultListeners = new Set<ResultListener>();

const emit = () => listeners.forEach((l) => l());

function schedule(target: string) {
  clearTimeout(timers.get(target));
  timers.set(
    target,
    setTimeout(() => void flush(target), NOTIFY_WAIT_MS),
  );
}

/** Masukkan dokumen ke antrean PIC-nya (atau perbarui isinya bila sudah ada). */
export function queueNotify(rec: DocRecord) {
  const target = waNumber(rec.values.kontakPic);
  if (!target) return;
  cancelNotify(rec.id, false);
  const doc = { id: rec.id, values: rec.values };
  const found = batches.find((b) => b.target === target);
  const sendAt = Date.now() + NOTIFY_WAIT_MS;
  batches = found
    ? batches.map((b) =>
        b === found
          ? {
              ...b,
              pic: rec.values.pic || b.pic,
              docs: [...b.docs, doc],
              sendAt,
            }
          : b,
      )
    : [...batches, { target, pic: rec.values.pic || 'PIC unit', docs: [doc], sendAt }];
  schedule(target);
  emit();
}

/** Keluarkan dokumen dari antrean, mis. karena tahapnya diurungkan. */
export function cancelNotify(id: string, notify = true) {
  const before = batches;
  batches = batches
    .map((b) => (b.docs.some((d) => d.id === id) ? { ...b, docs: b.docs.filter((d) => d.id !== id) } : b))
    .filter((b) => {
      if (b.docs.length) return true;
      clearTimeout(timers.get(b.target));
      timers.delete(b.target);
      return false;
    });
  if (notify && before !== batches) emit();
}

/** Kirim antrean satu PIC sekarang juga. */
export async function flush(target: string, keepalive = false) {
  const b = batches.find((x) => x.target === target);
  clearTimeout(timers.get(target));
  timers.delete(target);
  if (!b) return;
  batches = batches.filter((x) => x !== b);
  emit();
  const r = await sendNotify(
    b.docs.map((d) => d.id),
    keepalive,
  );
  resultListeners.forEach((l) => l(b, r));
}

// Saat halaman ditutup atau aplikasi di HP dipindah ke latar belakang, kirim semua antrean.
if (typeof window !== 'undefined') {
  const flushAll = () => batches.map((b) => b.target).forEach((t) => void flush(t, true));
  addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });
}

export function onNotifyResult(l: ResultListener) {
  resultListeners.add(l);
  return () => void resultListeners.delete(l);
}

export function useNotifyQueue() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => batches,
  );
}
