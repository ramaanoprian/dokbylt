import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, CheckCircle2, FileChartColumn, FileDown, Minus, X } from 'lucide-react';
import { MODULES } from '../modules';
import type { Activity, DataStore } from '../backend';
import { fmtDays } from '../stats';
import { avg, buildReport, defaultMonth, monthLabel, onTimeRate, recentMonths } from './compute';
import { countDelta, daysDelta, openReport, rateDelta, type Delta } from './template';
import './report.css';

interface Props {
  data: DataStore;
  activity: Activity[];
  userName: string;
  onClose: () => void;
}

const CONTENTS = [
  'Ringkasan eksekutif & sorotan',
  'Grafik masuk per pekan dan per menu',
  'Kinerja tiap menu',
  'TTD EVP per unit dan jenis',
  'Daftar lewat tenggat & terlambat',
  'Kantor Pos dan Multimedia',
  'Arsip dan peminjaman drone',
  'Aktivitas staf',
];

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function DeltaLine({ d }: { d: Delta }) {
  const Icon = d.arrow === '▲' ? ArrowUpRight : d.arrow === '▼' ? ArrowDownRight : Minus;
  return (
    <dd key={d.text} className={'rp-delta rp-fade ' + d.tone}>
      {d.arrow && <Icon size={13} strokeWidth={2.4} aria-hidden />}
      <span>{d.text}</span>
    </dd>
  );
}

/** Pilih bulan, lihat angka utamanya, lalu buka laporan A4 siap simpan sebagai PDF. */
export default function ReportDialog({ data, activity, userName, onClose }: Props) {
  const months = useMemo(() => recentMonths(), []);
  const [month, setMonth] = useState(defaultMonth);
  const [closing, setClosing] = useState(false);
  const [opened, setOpened] = useState('');
  const [err, setErr] = useState('');
  const monthsRef = useRef<HTMLDivElement>(null);

  const rep = useMemo(() => buildReport(data, activity, month), [data, activity, month]);

  // Jumlah data masuk per bulan, sebagai petunjuk di tombol bulan.
  const counts = useMemo(() => {
    const out = new Map<string, number>(months.map((m) => [m, 0]));
    for (const m of MODULES)
      for (const r of data[m.id]) {
        const k = (r.values[m.dateField] ?? '').slice(0, 7);
        if (out.has(k)) out.set(k, out.get(k)! + 1);
      }
    return out;
  }, [data, months]);

  const close = useCallback(() => {
    if (reduced()) return onClose();
    setClosing(true);
    setTimeout(onClose, 180);
  }, [onClose]);

  useEffect(() => {
    const esc = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && close();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [close]);

  // Fokus awal ke bulan terpilih agar bisa langsung dipilih dengan panah. Di HP daftar bulan bisa digeser:
  // tampilkan bulan terpilih di tengah.
  useEffect(() => {
    const box = monthsRef.current;
    const el = box?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    if (!box || !el) return;
    el.focus({ preventScroll: true });
    if (box.scrollWidth > box.clientWidth) box.scrollLeft = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
  }, []);

  const pick = (m: string) => {
    setMonth(m);
    setOpened('');
    setErr('');
  };

  const onArrow = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 4, ArrowLeft: -1, ArrowUp: -4 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = Math.min(months.length - 1, Math.max(0, months.indexOf(month) + step));
    pick(months[i]);
    monthsRef.current?.querySelectorAll<HTMLButtonElement>('button')[i]?.focus();
  };

  const make = () => {
    // Dihitung ulang saat tombol ditekan agar waktu cetak dan posisi data sama persis.
    const ok = openReport(buildReport(data, activity, month), { by: userName, at: new Date() });
    if (ok) {
      setErr('');
      setOpened(month);
    } else setErr('Jendela laporan diblokir browser. Izinkan pop-up untuk situs ini, lalu tekan Buat PDF lagi.');
  };

  const { total, prev, hasPrev, period } = rep;
  const prevName = rep.prevLabel;
  const rate = onTimeRate(total);
  const avgNow = avg(total);
  // Angka KPI langsung tampil (memudar saat bulan diganti), tidak dihitung naik: baris pembanding di bawahnya
  // sudah menyebut angka akhir, jadi keduanya harus sama sejak awal.
  const fixed = (n: number) => (
    <span key={n} className="rp-fade">
      {n.toLocaleString('id-ID')}
    </span>
  );
  const kpis: { label: string; value: ReactNode; d: Delta }[] = [
    { label: 'Masuk', value: fixed(total.masuk), d: countDelta(total.masuk, prev.masuk, prevName, hasPrev) },
    { label: 'Selesai', value: fixed(total.selesai), d: countDelta(total.selesai, prev.selesai, prevName, hasPrev, true) },
    {
      label: 'Masih berjalan',
      value: fixed(total.berjalan),
      d: countDelta(total.berjalan, prev.berjalan, prevName, hasPrev, false),
    },
    {
      label: 'Rata-rata selesai',
      value: (
        <span key={String(avgNow)} className="rp-fade">
          {avgNow === undefined ? '–' : fmtDays(avgNow)}
        </span>
      ),
      d: daysDelta(avgNow, avg(prev), prevName),
    },
    {
      label: 'Tepat waktu',
      value:
        rate === undefined ? (
          '–'
        ) : (
          <>
            {fixed(Math.round(rate))}%
          </>
        ),
      d: rateDelta(rate, onTimeRate(prev), prevName),
    },
    {
      label: 'Lewat tenggat',
      value: fixed(total.overdue),
      d: countDelta(total.overdue, prev.overdue, prevName, hasPrev, false),
    },
  ];
  // Angka akhir untuk pembaca layar; angka yang beranimasi tidak diumumkan satu per satu.
  const num = (n: number) => n.toLocaleString('id-ID');
  const spoken = rep.empty
    ? `${monthLabel(month)}: belum ada data.`
    : `${monthLabel(month)}: masuk ${num(total.masuk)}, selesai ${num(total.selesai)}, masih berjalan ${num(total.berjalan)}, ` +
      `rata-rata selesai ${avgNow === undefined ? 'belum ada' : fmtDays(avgNow)}, ` +
      `tepat waktu ${rate === undefined ? 'belum ada' : `${Math.round(rate)}%`}, lewat tenggat ${num(total.overdue)}.`;

  return (
    <div className={'overlay rp-overlay' + (closing ? ' closing' : '')} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet narrow rp-sheet" role="dialog" aria-modal="true" aria-labelledby="rp-title">
        <header className="sheet-head rp-head">
          <span className="rp-head-icon" aria-hidden>
            <FileChartColumn size={22} strokeWidth={1.9} />
          </span>
          <div className="grow">
            <p className="eyebrow">Laporan</p>
            <h2 id="rp-title">Laporan bulanan</h2>
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Tutup">
            <X size={20} />
          </button>
        </header>

        <div className="sheet-body rp-body">
          <p className="rp-lead">
            Ringkasan kinerja Unit Dokumen selama satu bulan dalam format A4, siap dibagikan ke pimpinan sebagai PDF.
          </p>

          <p className="rp-label" id="rp-month-label">
            Pilih bulan
          </p>
          <div
            className="rp-months"
            role="radiogroup"
            aria-labelledby="rp-month-label"
            ref={monthsRef}
            onKeyDown={onArrow}
          >
            {months.map((m) => {
              const n = counts.get(m) ?? 0;
              const on = m === month;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  className={'rp-month' + (on ? ' on' : '') + (n ? '' : ' zero')}
                  onClick={() => pick(m)}
                >
                  <b>{monthLabel(m, true)}</b>
                  <span>{n ? `${n.toLocaleString('id-ID')} data` : 'Belum ada data'}</span>
                </button>
              );
            })}
          </div>

          <p className="rp-sr" aria-live="polite">
            {spoken}
          </p>
          <section className="rp-preview">
            <div className="rp-preview-head">
              <h3>{monthLabel(month)}</h3>
              <span className="muted small">
                {period.current ? `Sampai hari ini, dibanding ${rep.prevLabel}` : `Dibanding ${monthLabel(rep.prevMonth)}`}
              </span>
            </div>
            {rep.empty && (
              <p className="rp-empty rp-fade" key={month}>
                Belum ada data pada bulan ini. Laporan tetap bisa dibuat dengan angka nol.
              </p>
            )}
            <dl className="rp-kpis">
              {kpis.map((k) => (
                <div key={k.label} className="rp-kpi">
                  <dt>{k.label}</dt>
                  <dd className="rp-num">{k.value}</dd>
                  <DeltaLine d={k.d} />
                </div>
              ))}
            </dl>
          </section>

          <section className="rp-contents">
            <p className="rp-label">Isi laporan</p>
            <ul>
              {CONTENTS.map((c) => (
                <li key={c}>
                  <Check size={14} strokeWidth={2.6} aria-hidden /> {c}
                </li>
              ))}
            </ul>
          </section>

          {err && <p className="notice rp-notice">{err}</p>}
        </div>

        <footer className="sheet-foot rp-foot">
          {opened === month ? (
            <p className="rp-status rp-fade" role="status">
              <CheckCircle2 size={16} aria-hidden /> Laporan {monthLabel(month)} dibuka di tab baru.
            </p>
          ) : (
            <p className="rp-hint">Di jendela cetak, pilih “Simpan sebagai PDF”.</p>
          )}
          <button type="button" className="pill-btn big rp-make" onClick={make}>
            <FileDown size={17} strokeWidth={2.2} /> Buat PDF
          </button>
        </footer>
      </div>
    </div>
  );
}
