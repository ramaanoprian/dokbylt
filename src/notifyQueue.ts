// Antrean WA ke PIC unit, pemohon paket, atau kurir. Data yang sampai di tahap yang dikabari
// (mis. "Diterima dari unit", "Ditandatangani EVP", "Proses pengiriman") tidak langsung dikirim:
// ditunggu sebentar supaya data lain untuk nomor yang sama (menu sama, tahap sama) ikut dalam satu pesan. Setiap dokumen baru
// memulai hitungan ulang.
import { useSyncExternalStore } from 'react';
import { sendNotify, type DocRecord, type NotifyResult } from './backend';
import { CONTACT_NAME, notifyKey, type ModuleDef, type ModuleId } from './modules';
import { waNumber } from './util';

export const NOTIFY_WAIT_MS = 60_000;

export interface Batch {
  /** Menu, nomor WA, dan tahap, mis. "evp|6281234567890|Ditandatangani EVP". */
  key: string;
  mod: ModuleId;
  target: string;
  stage: string;
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

function schedule(key: string) {
  clearTimeout(timers.get(key));
  timers.set(
    key,
    setTimeout(() => void flush(key), NOTIFY_WAIT_MS),
  );
}

/** Masukkan dokumen ke antrean PIC-nya untuk tahap itu (atau perbarui isinya bila sudah ada). */
export function queueNotify(mod: ModuleDef, rec: DocRecord, stage: string) {
  const field = notifyKey(mod, stage);
  const target = waNumber(rec.values[field]);
  if (!target) return;
  const key = `${mod.id}|${target}|${stage}`;
  cancelNotify(rec.id, (s) => s === stage, false);
  const doc = { id: rec.id, values: rec.values };
  const found = batches.find((b) => b.key === key);
  const sendAt = Date.now() + NOTIFY_WAIT_MS;
  const name = rec.values[CONTACT_NAME[field]];
  batches = found
    ? batches.map((b) => (b === found ? { ...b, pic: name || b.pic, docs: [...b.docs, doc], sendAt } : b))
    : [...batches, { key, mod: mod.id, target, stage, pic: name || (field === 'kontakKurir' ? 'kurir' : 'PIC unit'), docs: [doc], sendAt }];
  schedule(key);
  emit();
}

/**
 * Keluarkan dokumen dari antrean, mis. karena tahapnya diurungkan. `which` memilih tahap
 * antrean mana yang dibuang; tanpa `which` dokumen dibuang dari semua antrean.
 */
export function cancelNotify(id: string, which: (stage: string) => boolean = () => true, notify = true) {
  if (!batches.some((b) => which(b.stage) && b.docs.some((d) => d.id === id))) return;
  batches = batches
    .map((b) =>
      which(b.stage) && b.docs.some((d) => d.id === id) ? { ...b, docs: b.docs.filter((d) => d.id !== id) } : b,
    )
    .filter((b) => {
      if (b.docs.length) return true;
      clearTimeout(timers.get(b.key));
      timers.delete(b.key);
      return false;
    });
  if (notify) emit();
}

/** Kirim satu antrean sekarang juga. */
export async function flush(key: string, keepalive = false) {
  const b = batches.find((x) => x.key === key);
  clearTimeout(timers.get(key));
  timers.delete(key);
  if (!b) return;
  batches = batches.filter((x) => x !== b);
  emit();
  const r = await sendNotify(
    b.mod,
    b.docs.map((d) => d.id),
    b.stage,
    keepalive,
  );
  resultListeners.forEach((l) => l(b, r));
}

// Saat halaman ditutup atau aplikasi di HP dipindah ke latar belakang, kirim semua antrean.
if (typeof window !== 'undefined') {
  const flushAll = () => batches.map((b) => b.key).forEach((k) => void flush(k, true));
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
