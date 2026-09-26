import { useEffect, useRef, useState } from 'react';
import { CloudOff, Download, KeyRound, LogOut, Menu, Upload, X } from 'lucide-react';
import { MODULES, moduleById, type ModuleId } from './modules';
import { isOnline, useBackend, type DataStore } from './backend';
import { Icon } from './icons';
import { ModulePage } from './ModulePage';
import { Overview } from './Overview';
import { ActivityPage, initials } from './ActivityPage';
import { LoginPage, NamePrompt } from './LoginPage';
import { exportJson, isDone } from './util';

type Page = 'ringkasan' | 'aktivitas' | ModuleId;

const readHash = (): Page => {
  const h = location.hash.replace('#', '');
  return h === 'aktivitas' || MODULES.some((m) => m.id === h) ? (h as Page) : 'ringkasan';
};

export default function App() {
  const be = useBackend();
  const [page, setPage] = useState<Page>(readHash);
  const [navOpen, setNavOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const on = () => setPage(readHash());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);

  if (!be.authReady) return <div className="splash" />;
  if (!be.user) return <LoginPage onSignIn={be.signIn} />;
  if (isOnline && !be.user.name) return <NamePrompt email={be.user.email} onSave={be.setName} />;

  const userName = be.user.name;
  const { data } = be;

  const go = (p: Page) => {
    location.hash = p === 'ringkasan' ? '' : p;
    setPage(p);
    setNavOpen(false);
    scrollTo(0, 0);
  };

  const importBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as DataStore;
      if (typeof parsed !== 'object' || !MODULES.every((m) => Array.isArray(parsed[m.id] ?? []))) throw 0;
      if (confirm('Ganti semua data di browser ini dengan isi file cadangan?')) be.replaceAll(parsed);
    } catch {
      alert('File cadangan tidak valid.');
    }
  };

  const changePassword = async () => {
    const pw = prompt('Kata sandi baru (minimal 6 karakter):');
    if (!pw) return;
    const err = await be.changePassword(pw);
    alert(err ? 'Gagal mengganti kata sandi: ' + err : 'Kata sandi berhasil diganti.');
  };

  const navItem = (id: Page, icon: Parameters<typeof Icon>[0]['name'], text: string, count?: number) => (
    <button key={id} className={page === id ? 'active' : ''} onClick={() => go(id)}>
      <Icon name={icon} />
      <span className="grow">{text}</span>
      {!!count && <span className="count">{count}</span>}
    </button>
  );

  return (
    <div className={'layout' + (navOpen ? ' nav-open' : '')}>
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">DB</span>
          <div>
            <strong>Dokumen BYLT</strong>
            <span className="muted small block">Balai Yasa Lahat</span>
          </div>
          <button className="icon-btn only-mobile" onClick={() => setNavOpen(false)} aria-label="Tutup menu">
            <X size={20} />
          </button>
        </div>

        <nav>
          {navItem('ringkasan', 'ringkasan', 'Ringkasan')}
          <p className="nav-label">Alur kerja</p>
          {MODULES.map((m) =>
            navItem(m.id, m.icon, m.menu, data[m.id].filter((r) => !isDone(m, r)).length),
          )}
          <p className="nav-label">Lainnya</p>
          {navItem('aktivitas', 'aktivitas', 'Riwayat Aktivitas')}
        </nav>

        <div className="sidebar-foot">
          {!isOnline && (
            <div className="offline-note">
              <CloudOff size={16} />
              <span>Mode lokal: data hanya tersimpan di browser ini.</span>
            </div>
          )}
          <div className="account">
            <span className="avatar">{initials(userName)}</span>
            <span className="grow">
              <b>{userName}</b>
              {be.user.email && <span className="muted small block">{be.user.email}</span>}
            </span>
          </div>
          <div className="account-actions">
            <button className="btn ghost small" onClick={() => exportJson(data)} title="Unduh semua data (JSON)">
              <Download size={15} /> Unduh data
            </button>
            {!isOnline && (
              <button className="btn ghost small" onClick={() => fileRef.current?.click()}>
                <Upload size={15} /> Pulihkan
              </button>
            )}
            {isOnline && (
              <>
                <button className="btn ghost small" onClick={changePassword}>
                  <KeyRound size={15} /> Sandi
                </button>
                <button className="btn ghost small" onClick={be.signOut}>
                  <LogOut size={15} /> Keluar
                </button>
              </>
            )}
          </div>
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
          <button className="icon-btn" onClick={() => setNavOpen(true)} aria-label="Menu">
            <Menu size={22} />
          </button>
          <strong>Dokumen BYLT</strong>
          <span className="avatar sm">{initials(userName)}</span>
        </div>
        {be.error && (
          <div className="toast" role="alert">
            {be.error}
            <button className="icon-btn" onClick={be.clearError} aria-label="Tutup">
              <X size={16} />
            </button>
          </div>
        )}
        <main>
          {be.loading && <div className="loading-bar" />}
          {page === 'ringkasan' ? (
            <Overview data={data} activity={be.activity} userName={userName} go={go} />
          ) : page === 'aktivitas' ? (
            <ActivityPage activity={be.activity} />
          ) : (
            <ModulePage
              key={page}
              mod={moduleById(page)}
              rows={data[page]}
              userName={userName}
              onSave={(r, prev) => be.save(page, r, prev)}
              onDelete={(r) => be.remove(page, r)}
            />
          )}
        </main>
      </div>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
    </div>
  );
}
