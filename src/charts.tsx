import { useEffect, useRef, useState } from 'react';

/** Angka yang naik perlahan saat pertama tampil / berubah. */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 500);
      setShown(Math.round(a + (value - a) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown}</>;
}

export interface DayBar {
  key: string;
  label: string;
  short: string;
  value: number;
}

/** Grafik batang satu seri: jumlah aktivitas per hari. */
export function ActivityBars({ data }: { data: DayBar[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const W = 560;
  const H = 180;
  const padL = 28;
  const padB = 24;
  const padT = 10;
  const plotW = W - padL;
  const plotH = H - padB - padT;
  const step = plotW / data.length;
  const barW = Math.max(6, Math.min(22, step - 2));
  const y = (v: number) => padT + plotH - (v / nice) * plotH;
  const ticks = [0, nice / 2, nice];
  const total = data.reduce((s, d) => s + d.value, 0);
  const every = Math.ceil(data.length / 7);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Aktivitas ${data.length} hari terakhir, total ${total}`}>
        <defs>
          <linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#40a9ff" />
            <stop offset="100%" stopColor="#0071e3" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="grid" />
            <text x={padL - 8} y={y(t) + 4} className="axis" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * step + (step - barW) / 2;
          const h = Math.max(0, y(0) - y(d.value));
          const r = Math.min(4, h / 2, barW / 2);
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * step} y={padT} width={step} height={plotH} fill="transparent" />
              {d.value > 0 && (
                <path
                  className={'bar' + (hover === i ? ' hot' : '')}
                  d={`M${x},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} z`}
                />
              )}
              {((i % every === 0 && data.length - 1 - i >= every) || i === data.length - 1) && (
                <text x={padL + i * step + step / 2} y={H - 6} className="axis" textAnchor="middle">
                  {d.short}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((padL + hover * step + step / 2) / W) * 100}%` }}>
          <b>{data[hover].value}</b> aktivitas
          <span className="muted small block">{data[hover].label}</span>
        </div>
      )}
    </div>
  );
}

/** Batang horizontal satu warna untuk perbandingan jumlah. */
export function HBars({ data, onPick }: { data: { label: string; value: number }[]; onPick?: (label: string) => void }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="hbars">
      {data.map((d) => (
        <li key={d.label} onClick={() => onPick?.(d.label)} className={onPick ? 'clickable' : ''}>
          <span className="hb-label">{d.label}</span>
          <span className="hb-track">
            <span className="hb-fill" style={{ width: `${(d.value / max) * 100}%` }} />
          </span>
          <span className="hb-val">{d.value}</span>
        </li>
      ))}
    </ul>
  );
}
