import { useEffect, useRef, useState } from 'react';
import { MODULES, moduleById, type ModuleId } from './modules';
import { useDataStore, type DataStore } from './store';
import { ModulePage } from './ModulePage';
import { Overview } from './Overview';
import { exportJson, isDone } from './util';

type Page = 'ringkasan' | ModuleId;

const readHash = (): Page => {
  const h = location.hash.replace('#', '');
  return MODULES.some((m) => m.id === h) ? (h as ModuleId) : 'ringkasan';
};

export default function App() {
  const { data, upsert, remove, replaceAll } = useDataStore();
  const [page, setPage] = useState<Page>(readHash);
  const [navOpen, setNavOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const on = () => setPage(readHash());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);

  const go = (p: Page) => {
    location.hash = p === 'ringkasan' ? '' : p;
    setPage(p);
    setNavOpen(false);
  };

  const importBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as DataStore;
      if (typeof parsed !== 'object' || !MODULES.every((m) => Array.isArray(parsed[m.id] ?? []))) throw 0;
      if (confirm('Ganti semua data di browser ini dengan isi file cadangan?')) replaceAll(parsed);
    } catch {
      alert('File cadangan tidak valid.');
    }
  };

  return (
    <div className={'layout' + (navOpen ? ' nav-open' : '')}>
      <aside className="sidebar">
        <div className="brand">
          <strong>Dokumen BYLT</strong>
          <span className="muted small">Balai Yasa Lahat</span>
        </div>
        <nav>
          <button className={page === 'ringkasan' ? 'active' : ''} onClick={() => go('ringkasan')}>
            <span aria-hidden>🏠</span> Ringkasan
          </button>
          {MODULES.map((m) => {
            const n = data[m.id].filter((r) => !isDone(m, r)).length;
            return (
              <button key={m.id} className={page === m.id ? 'active' : ''} onClick={() => go(m.id)}>
                <span aria-hidden>{m.icon}</span> {m.menu}
                {n > 0 && <span className="count">{n}</span>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <p className="muted small">Data tersimpan di browser ini. Buat cadangan secara berkala.</p>
          <button className="btn small" onClick={() => exportJson(data)}>
            Unduh cadangan
          </button>
          <button className="btn small" onClick={() => fileRef.current?.click()}>
            Pulihkan cadangan
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importBackup(f);
              e.target.value = '';
            }}
          />
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <button className="icon-btn" onClick={() => setNavOpen(!navOpen)} aria-label="Menu">
            ☰
          </button>
          <strong>Dokumen BYLT</strong>
        </div>
        <main>
          {page === 'ringkasan' ? (
            <Overview data={data} go={go} />
          ) : (
            <ModulePage
              key={page}
              mod={moduleById(page)}
              rows={data[page]}
              onSave={(r) => upsert(page, r)}
              onDelete={(id) => remove(page, id)}
            />
          )}
        </main>
      </div>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
    </div>
  );
}
