import { useEffect, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { NOTIFY_WAIT_MS, cancelNotify, flush, onNotifyResult, useNotifyQueue } from './notifyQueue';
import { useToast } from './toast';
import { RECEIVED_STAGE, notifyUrl } from './util';

/** WA ke PIC yang masih menunggu digabung, dengan hitung mundur dan tombol kirim sekarang. */
export function NotifyTray({ userName }: { userName: string }) {
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
        const what = b.docs.length > 1 ? `${b.docs.length} dokumen` : 'dokumen';
        if (r.sent) toast(`WA ke ${b.pic} terkirim (${what})`);
        else
          toast(`WA ke ${b.pic} belum terkirim (${r.reason})`, {
            label: 'Kirim via WA',
            run: () =>
              window.open(
                notifyUrl(
                  b.docs.map((d) => d.values),
                  userName,
                  b.stage,
                ),
                '_blank',
              ),
          });
      }),
    [toast, userName],
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
                title={`Dokumen lain untuk ${b.pic} dalam waktu ini ikut digabung`}
              >
                {b.docs.length} dokumen {b.stage === RECEIVED_STAGE ? 'diterima' : 'selesai TTD'} · {left} dtk lagi
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
