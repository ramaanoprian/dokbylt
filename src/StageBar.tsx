import type { ModuleDef } from './modules';
import type { StageStat } from './stats';
import { stageClass } from './stats';

/** Batang bertumpuk: berapa pekerjaan berjalan di tiap tahap, dengan keterangan di bawahnya. */
export function StageBar({ mod, stages, legend = true }: { mod: ModuleDef; stages: StageStat[]; legend?: boolean }) {
  const open = stages.slice(0, -1);
  const total = open.reduce((n, s) => n + s.count, 0);
  return (
    <div className="stagebar">
      <div className="stagebar-track" role="img" aria-label={open.map((s) => `${s.status}: ${s.count}`).join(', ')}>
        {total === 0 ? (
          <span className="stagebar-empty" />
        ) : (
          open
            .filter((s) => s.count > 0)
            .map((s) => (
              <span
                key={s.status}
                className={'seg ' + stageClass(mod, s.status)}
                style={{ flexGrow: s.count }}
                title={`${s.status}: ${s.count}`}
              />
            ))
        )}
      </div>
      {legend && (
        <ul className="stagebar-legend">
          {open.map((s) => (
            <li key={s.status} className={s.count ? '' : 'zero'}>
              <i className={'dot ' + stageClass(mod, s.status)} />
              <span className="grow ellipsis">{s.status}</span>
              <b>{s.count}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
