import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, KeyRound, LogOut, Menu as Menu2, Moon, Search, Sun, Upload, Users, X } from 'lucide-react';
import { Menu } from './Menu';
import { MODULES, moduleById, type ModuleId } from './modules';
import { isOnline, useBackend, type DataStore } from './backend';
import { ModulePage } from './ModulePage';
import { Overview } from './Overview';
import { ActivityPage, initials } from './ActivityPage';
import { LoginPage, NamePrompt } from './LoginPage';
import { CommandPalette } from './CommandPalette';
import { ReminderBell } from './ReminderBell';
import { StaffDialog } from './StaffDialog';
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
  const [staffOpen, setStaffOpen] = useState(false);
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

  // Menu layar penuh di HP: halaman di belakangnya tidak ikut bergulir.
  useEffect(() => {
    document.documentElement.classList.toggle('lock', navOpen);
  }, [navOpen]);

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
  const closeStaff = useCallback(() => setStaffOpen(false), []);
  const { uploadFile, fileUrl, removeFile } = be;
  const files = useMemo(() => ({ upload: uploadFile, url: fileUrl, remove: removeFile }), [uploadFile, fileUrl, removeFile]);

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

  const links: [Page, string][] = [
    ['ringkasan', 'Ringkasan'],
    ...MODULES.map((m): [Page, string] => [m.id, m.menu]),
    ['aktivitas', 'Riwayat'],
  ];

  const accountItems = [
    [
      { icon: dark ? <Sun size={16} /> : <Moon size={16} />, label: dark ? 'Tampilan terang' : 'Tampilan gelap', run: toggleTheme },
      { icon: <Download size={16} />, label: 'Unduh cadangan data', run: () => exportJson(data) },
      ...(!isOnline ? [{ icon: <Upload size={16} />, label: 'Pulihkan dari cadangan', run: () => fileRef.current?.click() }] : []),
    ],
    isOnline && be.isAdmin ? [{ icon: <Users size={16} />, label: 'Kelola peran staf', run: () => setStaffOpen(true) }] : [],
    isOnline
      ? [
          { icon: <KeyRound size={16} />, label: 'Ganti kata sandi', run: changePassword },
          { icon: <LogOut size={16} />, label: 'Keluar', run: be.signOut, danger: true },
        ]
      : [],
  ];

  const who = (
    <div className="who">
      <span className="avatar">{initials(userName)}</span>
      <span className="grow">
        <b>{userName}</b>
        <span className="muted small block">
          {be.isAdmin ? 'Admin' : 'Staf'} · {isOnline ? 'Tersinkron' : 'Mode lokal, data hanya di browser ini'}
        </span>
      </span>
    </div>
  );

  return (
    <div className={'app' + (navOpen ? ' nav-open' : '')}>
      <header className="gnav">
        <div className="gnav-inner">
          <button className="gnav-logo" onClick={() => go('ringkasan')} aria-label="Dokumen BYLT, ke Ringkasan">
            <span className="logo" aria-hidden>
              <FileText size={13} strokeWidth={2.4} />
            </span>
            <span>Dokumen BYLT</span>
          </button>
          <nav className="gnav-links" aria-label="Menu utama">
            {links.map(([id, text]) => (
              <button key={id} className={page === id ? 'on' : ''} aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}>
                {text}
              </button>
            ))}
          </nav>
          <div className="gnav-tools">
            <button className="icon-btn" onClick={() => setPaletteOpen(true)} aria-label="Cari (Ctrl K)" title="Cari (Ctrl K)">
              <Search size={17} />
            </button>
            <ReminderBell items={reminders} go={go} />
            <span className="hide-sm">
              <Menu
                triggerClass="avatar-btn"
                title="Akun dan pengaturan"
                trigger={<span className="avatar">{initials(userName)}</span>}
                header={who}
                groups={accountItems}
              />
            </span>
            <button className="icon-btn only-mobile burger" onClick={() => setNavOpen(!navOpen)} aria-label={navOpen ? 'Tutup menu' : 'Buka menu'} aria-expanded={navOpen}>
              {navOpen ? <X size={20} /> : <Menu2 size={20} />}
            </button>
          </div>
        </div>
      </header>

      {navOpen && (
        <div className="gnav-sheet">
          <nav>
            {links.map(([id, text]) => (
              <button key={id} className={page === id ? 'on' : ''} onClick={() => go(id)}>
                {text}
                {id !== 'ringkasan' && id !== 'aktivitas' && !!data[id].filter((r) => !isDone(moduleById(id), r)).length && (
                  <span className="sheet-count">{data[id].filter((r) => !isDone(moduleById(id), r)).length}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="sheet-account">
            {who}
            {accountItems.flat().map((it) => (
              <button
                key={it.label}
                className={'sheet-link' + ('danger' in it && it.danger ? ' danger' : '')}
                onClick={() => {
                  setNavOpen(false);
                  it.run();
                }}
              >
                {it.icon} {it.label}
              </button>
            ))}
          </div>
        </div>
      )}

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
          <Overview data={data} activity={be.activity} loading={be.loading} go={go} />
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
            onImport={(recs) => be.saveMany(page, recs)}
            canDelete={be.isAdmin}
            files={files}
          />
        )}
      </main>
      <footer className="gfoot">
        <div className="gfoot-inner">
          <span>Unit Dokumen · Balai Yasa Lahat</span>
          <span className="muted">
            {isOnline ? 'Data tersinkron otomatis antarperangkat.' : 'Mode lokal: data hanya tersimpan di browser ini.'}
          </span>
        </div>
      </footer>
      {staffOpen && (
        <StaffDialog meId={be.user.id} load={be.listStaff} setRole={be.setStaffRole} onClose={closeStaff} />
      )}
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
