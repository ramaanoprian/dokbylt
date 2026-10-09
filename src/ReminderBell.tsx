import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Bell } from "lucide-react";
import type { ModuleId } from "./modules";
import type { Reminder } from "./reminders";
import { Icon } from "./icons";
import { dueLabel, dueTone, fmtDate } from "./util";

const label = (v: Record<string, string>) =>
  v.perihal || v.kegiatan || v.uraian || v.keperluan || v.tujuan || v.asal || "";

export function ReminderBell({
  items,
  go,
}: {
  items: Reminder[];
  go: (m: ModuleId, id?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({});

  // Popover dirender ke <body> dengan posisi tetap agar tidak terpotong sidebar.
  const toggle = () => {
    const b = ref.current?.getBoundingClientRect();
    if (b) {
      const width = Math.min(340, innerWidth - 24);
      const left = Math.max(12, Math.min(b.left, innerWidth - width - 12));
      setPos({ top: b.bottom + 8, left, width });
    }
    setOpen(!open);
  };

  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !popRef.current?.contains(t))
        setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("mousedown", on);
    addEventListener("keydown", esc);
    return () => {
      removeEventListener("mousedown", on);
      removeEventListener("keydown", esc);
    };
  }, [open]);

  const urgent = items.filter((i) => i.days <= 1).length;

  return (
    <div className="bell" ref={ref}>
      <button
        className={"icon-btn bell-btn" + (items.length ? " has" : "")}
        onClick={toggle}
        aria-label={`Pengingat tenggat (${items.length})`}
        aria-expanded={open}
      >
        <Bell size={20} />
        {items.length > 0 && (
          <span className={"bell-count" + (urgent ? " urgent" : "")}>
            {items.length}
          </span>
        )}
      </button>
      {open &&
        createPortal(
          <div
            className="bell-pop"
            ref={popRef}
            style={pos}
            role="dialog"
            aria-label="Pengingat tenggat"
          >
            <div className="bell-head">
              <b>Pengingat tenggat</b>
              <span className="muted small">Lewat tenggat &amp; 3 hari ke depan</span>
            </div>
            {items.length === 0 ? (
              <p className="muted small bell-empty">
                Tidak ada yang lewat tenggat atau jatuh tempo dalam 3 hari ke depan.
              </p>
            ) : (
              <ul>
                {items.map(({ m, r, date, days }) => (
                  <li
                    key={r.id}
                    onClick={() => {
                      setOpen(false);
                      go(m.id, r.id);
                    }}
                  >
                    <span className={`chip-icon sm c-${m.id}`}>
                      <Icon name={m.icon} size={14} />
                    </span>
                    <span className="grow">
                      <span className="ellipsis block">
                        {label(r.values) || m.itemName}
                      </span>
                      <span className="muted small">
                        {m.menu} · {fmtDate(date)}
                      </span>
                    </span>
                    <span className={"due " + dueTone(days)}>
                      {dueLabel(days)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
