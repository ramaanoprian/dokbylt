import { useState } from 'react';
import { ChevronRight, GripVertical } from 'lucide-react';
import type { ModuleDef } from './modules';
import type { DocRecord } from './backend';
import { daysSince, fmtDate, lastMove } from './util';

interface Props {
  mod: ModuleDef;
  rows: DocRecord[];
  onOpen: (r: DocRecord) => void;
  onMove: (r: DocRecord, status: string) => void;
}

const titleOf = (v: Record<string, string>) => v.perihal || v.kegiatan || v.uraian || v.tujuan || v.asal || '(tanpa judul)';

export function Board({ mod, rows, onOpen, onMove }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const meta = mod.fields.filter((f) => f.inTable && f.type === 'select').slice(0, 2);
  const last = mod.statuses.length - 1;

  return (
    <div className="board" style={{ gridTemplateColumns: `repeat(${mod.statuses.length}, minmax(240px, 1fr))` }}>
      {mod.statuses.map((s, i) => {
        const all = rows.filter((r) => r.status === s);
        // Kolom "selesai" bisa sangat panjang; tampilkan yang terbaru saja.
        const items = i === last ? [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 15) : all;
        return (
          <div
            key={s}
            className={'col' + (over === s ? ' over' : '')}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setOver(s);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const r = rows.find((x) => x.id === dragId);
              setOver(null);
              setDragId(null);
              if (r && r.status !== s) onMove(r, s);
            }}
          >
            <div className="col-head">
              <span className={'col-dot ' + (i === last ? 'done' : i === 0 ? 'new' : 'mid')} />
              <span className="grow">{s}</span>
              <span className="col-count">{all.length}</span>
            </div>
            <div className="col-body">
              {items.length === 0 && <div className="col-empty">Seret kartu ke sini</div>}
              {all.length > items.length && (
                <p className="muted small col-more">15 terbaru dari {all.length}. Lihat semua di tampilan tabel.</p>
              )}
              {items.map((r) => {
                const age = daysSince(lastMove(r));
                return (
                  <article
                    key={r.id}
                    className={'kcard' + (dragId === r.id ? ' dragging' : '')}
                    draggable
                    onDragStart={(e) => {
                      setDragId(r.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOver(null);
                    }}
                    onClick={() => onOpen(r)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && onOpen(r)}
                  >
                    <div className="kcard-top">
                      <span className="muted small">{fmtDate(r.values[mod.dateField])}</span>
                      <GripVertical size={14} className="grip" />
                    </div>
                    <p className="kcard-title">{titleOf(r.values)}</p>
                    <div className="kcard-tags">
                      {meta.map((f) => r.values[f.key] && <span key={f.key} className="tag">{r.values[f.key]}</span>)}
                      {i < last && age >= 3 && <span className="tag late">{age} hari</span>}
                    </div>
                    {i < last && (
                      <button
                        className="kcard-next"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMove(r, mod.statuses[i + 1]);
                        }}
                      >
                        {mod.statuses[i + 1]} <ChevronRight size={14} />
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
