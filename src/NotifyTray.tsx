import { useEffect, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { NOTIFY_WAIT_MS, cancelNotify, flush, onNotifyResult, useNotifyQueue } from './notifyQueue';
import { useToast } from './toast';
import { moduleById } from './modules';
import { RECEIVED_STAGE, notifyUrl } from './util';
import { trackCode } from './track';

/** Keterangan singkat tahap di antrean, mis. "3 kiriman siap di-pick up". */
const STAGE_WORD: Record<string, string> = {
  [RECEIVED_STAGE]: 'diterima',
  'Ditandatangani EVP': 'selesai TTD',
  'Proses pengiriman': 'siap di-pick up',
  'Resi dikirim ke user': 'dengan resi',
};

/** WA ke PIC, pemohon, atau kurir yang masih menunggu digabung, dengan hitung mundur dan tombol kirim sekarang. */
export function NotifyTray() {
  const batches = useNotifyQueue();
  const toast = useToast();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!batches.length) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [batches.length]);

  useEffect(
    () =>
      onNotifyResult((b, r) => {
        const item = moduleById(b.mod).itemName;
        const what = b.docs.length > 1 ? `${b.docs.length} ${item}` : item;
        if (r.sent) toast(`WA ke ${b.pic} terkirim (${what})`);
        // Pesan paket berisi tautan pribadi kurir yang dibuat server, jadi tidak ada cadangan wa.me.
        else if (b.mod !== 'evp') toast(`WA ke ${b.pic} belum terkirim (${r.reason})`);
        else
          toast(`WA ke ${b.pic} belum terkirim (${r.reason})`, {
            label: 'Kirim via WA',
            run: () =>
              window.open(
                notifyUrl(
                  b.docs.map((d) => d.values),
                  b.stage,
                  b.docs.map((d) => trackCode(d)),
                ),
                '_blank',
              ),
          });
      }),
    [toast],
  );

  if (!batches.length) return null;
  return (
    <div className="notify-tray" aria-live="polite">
      {batches.map((b) => {
        const left = Math.min(NOTIFY_WAIT_MS / 1000, Math.max(0, Math.ceil((b.sendAt - now) / 1000)));
        return (
          <div key={b.key} className="notify-item">
            <span className="notify-icon">
              <MessageCircle size={16} />
            </span>
            <span className="grow">
              <b className="ellipsis block">WA ke {b.pic}</b>
              <span
                className="muted small ellipsis block"
                title={`${moduleById(b.mod).itemName} lain untuk ${b.pic} dalam waktu ini ikut digabung`}
              >
                {b.docs.length} {moduleById(b.mod).itemName} {STAGE_WORD[b.stage] ?? b.stage.toLowerCase()} · {left} dtk lagi
              </span>
            </span>
            <button className="btn small primary" onClick={() => void flush(b.key)}>
              <Send size={13} /> Kirim
            </button>
            <button
              className="icon-btn"
              aria-label={`Batalkan WA ke ${b.pic}`}
              title="Batalkan WA"
              onClick={() => b.docs.forEach((d) => cancelNotify(d.id))}
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
