// Rekap KPI di halaman Surat Masuk: surat masuk dan surat yang didistribusikan ke unit kerja per bulan.
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ModuleDef } from './modules';
import type { DocRecord } from './backend';
import { monthLabel } from './FilterBar';
import { deltaText, prevMonth } from './stats';
import { pct, suratKpi } from './kpiSurat';

const pad = (n: number) => String(n).padStart(2, '0');
const nowMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
function nextMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
const nf = (n: number) => n.toLocaleString('id-ID');

export function SuratKpi({ mod, rows, loading }: { mod: ModuleDef; rows: DocRecord[]; loading?: boolean }) {
  const current = nowMonth();
  const [month, setMonth] = useState(current);
  const k = useMemo(() => suratKpi(mod, rows, month), [mod, rows, month]);
  const before = useMemo(() => suratKpi(mod, rows, prevMonth(month)), [mod, rows, month]);
  const name = monthLabel(month);
  const prevName = monthLabel(prevMonth(month)).split(' ')[0];
  const timed = k.tepatWaktu + k.terlambat;
  const sk = loading && !rows.length;
  const num = (v: string | number) => (sk ? <span className="sk w30" /> : v);
  const maxUnit = Math.max(1, ...k.units.map((u) => u.masuk));

  return (
    <section className="skpi-kpi" aria-label={`KPI surat masuk ${name}`}>
      <div className="team-head">
        <h2 className="section-title">
          KPI bulanan. <span>Surat masuk dan yang sudah didistribusikan ke unit kerja.</span>
        </h2>
        <div className="skpi-month" role="group" aria-label="Bulan">
          <button type="button" className="icon-btn" onClick={() => setMonth(prevMonth(month))} aria-label="Bulan sebelumnya">
            <ChevronLeft size={18} />
          </button>
          <b aria-live="polite">{name}</b>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMonth(nextMonth(month))}
            disabled={month >= current}
            aria-label="Bulan berikutnya"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <dl className="kpis four">
        <div className="kpi">
          <dt>Surat masuk</dt>
          <dd className="kpi-num">{num(nf(k.masuk))}</dd>
          <dd className="kpi-sub">{deltaText(k.masuk, before.masuk, prevName)}</dd>
        </div>
        <div className={'kpi' + (k.masuk && k.belum === 0 ? ' good' : '')}>
          <dt>Didistribusikan</dt>
          <dd className="kpi-num">{num(nf(k.didistribusikan))}</dd>
          <dd className="kpi-sub">{k.masuk ? `${pct(k.didistribusikan, k.masuk)} dari surat masuk` : 'belum ada surat bulan ini'}</dd>
        </div>
        <div className="kpi">
          <dt>Belum didistribusikan</dt>
          <dd className="kpi-num">{num(nf(k.belum))}</dd>
          <dd className="kpi-sub">
            {k.belum === 0 ? 'semua sudah sampai unit' : k.tungguEvp ? `${nf(k.tungguEvp)} menunggu disposisi EVP` : 'siap didistribusikan'}
          </dd>
        </div>
        <div className={'kpi' + (timed && !k.terlambat ? ' good' : '')}>
          <dt>Tepat waktu</dt>
          <dd className="kpi-num">{num(pct(k.tepatWaktu, timed))}</dd>
          <dd className="kpi-sub">
            {timed ? `${nf(k.terlambat)} melewati tenggat ${mod.dueDays} hari kerja` : 'didistribusikan sebelum tenggat'}
          </dd>
        </div>
      </dl>

      {k.units.length > 0 && (
        <div className="card skpi-units">
          <div className="skpi-units-head">
            <span>Per unit kerja penerima</span>
            <span className="muted">
              {nf(k.langsung)} langsung ke unit · {nf(k.viaEvp)} melalui disposisi EVP
            </span>
          </div>
          <ul>
            {k.units.map((u) => (
              <li key={u.unit}>
                <span className="skpi-unit ellipsis" title={u.unit}>
                  {u.unit}
                </span>
                <span className="skpi-bar" aria-hidden>
                  <i className="all" style={{ width: `${(u.masuk / maxUnit) * 100}%` }} />
                  <i className="done" style={{ width: `${(u.didistribusikan / maxUnit) * 100}%` }} />
                </span>
                <span className="skpi-n">
                  <b>{nf(u.didistribusikan)}</b> dari {nf(u.masuk)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
