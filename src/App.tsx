import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CloudOff, Download, KeyRound, LogOut, Menu, Moon, Search, Sun, Upload, X } from 'lucide-react';
import { MODULES, moduleById, type ModuleId } from './modules';
import { isOnline, useBackend, type DataStore } from './backend';
import { Icon } from './icons';
import { ModulePage } from './ModulePage';
import { Overview } from './Overview';
import { ActivityPage, initials } from './ActivityPage';
import { LoginPage, NamePrompt } from './LoginPage';
import { CommandPalette } from './CommandPalette';
import { ReminderBell } from './ReminderBell';
import { collectReminders } from './reminders';
import { useToast } from './toast';
import { exportJson, isDone, readPref, writePref } from './util';

type Page = 'ringkasan' | 'aktivitas' | ModuleId;

const readHash = (): Page => {
  const h = location.hash.replace('#', '');
  return h === 'aktivitas' || MODULES.some((m) => m.id === h) ? (h as Page) : 'ringkasan';
};

export default function App() {
  const be = useBackend();
  const [page, setPage] = useState<Page>(readHash);
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [openId, setOpenId] = useState<string | undefined>();
  const [dark, setDark] = useState(() => {
    const p = readPref('theme', '');
    return p ? p === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const reminders = useMemo(() => collectReminders(be.data), [be.data]);
  const remindedRef = useRef(false);

  useEffect(() => {
    const on = () => setPage(readHash());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#f5f5f7');
  }, [dark]);

  const toggleTheme = useCallback(() => {
    setDark((d) => {
      writePref('theme', d ? 'light' : 'dark');
      return !d;
    });
  }, []);

  // Ctrl/Cmd+K atau "/" membuka pencarian cepat.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = /INPUT|TEXTAREA|SELECT/.test(t.tagName);
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, []);

  const go = useCallback((p: Page, id?: string) => {
    location.hash = p === 'ringkasan' ? '' : p;
    setPage(p);
    setOpenId(id);
    setNavOpen(false);
    scrollTo(0, 0);
  }, []);
  const clearOpen = useCallback(() => setOpenId(undefined), []);

  // Sekali per sesi browser: beri tahu bila ada data yang mendekati tenggat.
  useEffect(() => {
    if (remindedRef.current || be.loading || !be.user || !reminders.length) return;
    remindedRef.current = true;
    try {
      if (sessionStorage.getItem('dokbylt:reminded')) return;
      sessionStorage.setItem('dokbylt:reminded', '1');
    } catch {
      /* abaikan */
    }
    const over = reminders.filter((r) => r.days < 0).length;
    toast(
      over
        ? `${over} data sudah lewat tenggat, ${reminders.length - over} lainnya segera jatuh tempo`
        : `${reminders.length} data jatuh tempo dalam 3 hari`,
      { label: 'Lihat', run: () => go('ringkasan') },
    );
  }, [reminders, be.loading, be.user, toast, go]);

  if (!be.authReady) return <div className="splash" />;
  if (!be.user) return <LoginPage onSignIn={be.signIn} />;
  if (isOnline && !be.user.name) return <NamePrompt email={be.user.email} onSave={be.setName} />;

  const userName = be.user.name;
  const { data } = be;

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
          <span className="hide-sm push">
            <ReminderBell items={reminders} go={go} />
          </span>
          <button className="icon-btn only-mobile" onClick={() => setNavOpen(false)} aria-label="Tutup menu">
            <X size={20} />
          </button>
        </div>

        <button className="search-trigger" onClick={() => setPaletteOpen(true)}>
          <Search size={16} />
          <span className="grow">Cari apa saja…</span>
          <kbd>Ctrl K</kbd>
        </button>

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
          {isOnline && (
            <div className="live" title="Perubahan dari perangkat lain muncul otomatis">
              <span className="live-dot" /> Tersinkron langsung
            </div>
          )}
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
            <button className="btn ghost small" onClick={toggleTheme} title="Ganti tema">
              {dark ? <Sun size={15} /> : <Moon size={15} />} {dark ? 'Terang' : 'Gelap'}
            </button>
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
          <span className="push" />
          <ReminderBell items={reminders} go={go} />
          <button className="icon-btn" onClick={() => setPaletteOpen(true)} aria-label="Cari">
            <Search size={20} />
          </button>
          <button className="icon-btn" onClick={toggleTheme} aria-label="Ganti tema">
            {dark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
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
            <Overview data={data} activity={be.activity} userName={userName} loading={be.loading} go={go} />
          ) : page === 'aktivitas' ? (
            <ActivityPage activity={be.activity} go={go} />
          ) : (
            <ModulePage
              key={page}
              mod={moduleById(page)}
              rows={data[page]}
              userName={userName}
              loading={be.loading}
              openId={openId}
              onOpened={clearOpen}
              onSave={(r, prev) => be.save(page, r, prev)}
              onDelete={(r) => be.remove(page, r)}
              onRestore={(r) => be.save(page, r)}
            />
          )}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Navigasi">
        {(['ringkasan', 'evp', 'surat', 'pos'] as const).map((p) => {
          const icon = p === 'ringkasan' ? 'ringkasan' : moduleById(p).icon;
          const text = p === 'ringkasan' ? 'Ringkasan' : p === 'surat' ? 'Surat' : moduleById(p).menu;
          return (
            <button key={p} className={page === p ? 'active' : ''} onClick={() => go(p)}>
              <Icon name={icon} size={20} />
              <span>{text}</span>
            </button>
          );
        })}
        <button onClick={() => setNavOpen(true)}>
          <Menu size={20} />
          <span>Lainnya</span>
        </button>
      </nav>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      {paletteOpen && (
        <CommandPalette
          data={data}
          dark={dark}
          onClose={() => setPaletteOpen(false)}
          go={go}
          toggleTheme={toggleTheme}
        />
      )}
    </div>
  );
}
