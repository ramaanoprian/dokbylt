import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Role, StaffMember } from './backend';
import { fmtDateTime } from './util';

interface Props {
  meId: string;
  load: () => Promise<StaffMember[]>;
  setRole: (id: string, role: Role) => Promise<string | null>;
  onClose: () => void;
}

/** Admin mengatur siapa yang admin (boleh menghapus data dan mengatur peran) dan siapa staf. */
export function StaffDialog({ meId, load, setRole, onClose }: Props) {
  const [list, setList] = useState<StaffMember[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    load().then(setList);
  }, [load]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onClose]);

  const change = async (s: StaffMember, role: Role) => {
    setErr('');
    setBusy(s.id);
    const e = await setRole(s.id, role);
    setBusy('');
    if (e) setErr(e);
    else setList((l) => l?.map((x) => (x.id === s.id ? { ...x, role } : x)) ?? null);
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet narrow" role="dialog" aria-modal="true" aria-label="Kelola staf">
        <header className="sheet-head">
          <div>
            <p className="eyebrow">Pengaturan</p>
            <h2>Peran staf</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            <X size={20} />
          </button>
        </header>
        <div className="sheet-body">
          <p className="muted small">
            <b>Admin</b> bisa menghapus data dan mengatur peran. <b>Staf</b> bisa menambah dan mengubah data, tapi tidak
            bisa menghapus. Akun baru dibuat di Supabase (Authentication → Users) dan otomatis menjadi staf.
          </p>
          {err && <p className="notice">{err}</p>}
          {!list ? (
            <p className="muted">Memuat…</p>
          ) : (
            <ul className="staff-list">
              {list.map((s) => (
                <li key={s.id}>
                  <span className="grow">
                    <b className="block">
                      {s.name}
                      {s.id === meId && <span className="muted"> (Anda)</span>}
                    </b>
                    <span className="muted small">
                      {s.email}
                      {s.lastSignIn && ` · masuk terakhir ${fmtDateTime(s.lastSignIn)}`}
                    </span>
                  </span>
                  <div className="segmented" role="radiogroup" aria-label={`Peran ${s.name}`}>
                    {(['staf', 'admin'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={s.role === r ? 'on' : ''}
                        disabled={busy === s.id}
                        aria-pressed={s.role === r}
                        onClick={() => s.role !== r && change(s, r)}
                      >
                        {r === 'admin' ? 'Admin' : 'Staf'}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
