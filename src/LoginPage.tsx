import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import bg from './assets/login-bg.jpg';

/** Panel kiri halaman masuk: foto balai dengan nama sistem. Disembunyikan di HP. */
function Aside() {
  return (
    <aside className="login-aside" style={{ backgroundImage: `url(${bg})` }}>
      <div className="login-aside-top">
        <span className="logo light">
          <FileText size={16} strokeWidth={2.2} />
        </span>
        <b>Dokumen BYLT</b>
      </div>
      <div className="login-aside-text">
        <h2>Administrasi dokumen Balai Yasa Lahat</h2>
        <p>
          Pencatatan tanda tangan EVP, surat masuk dan keluar, pengiriman pos, dokumentasi kegiatan, dan arsip dalam
          satu tempat.
        </p>
      </div>
    </aside>
  );
}

export function LoginPage({ onSignIn }: { onSignIn: (email: string, pw: string) => Promise<string | null> }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(await onSignIn(email.trim(), pw));
    setBusy(false);
  };

  return (
    <div className="login">
      <Aside />
      <div className="login-main">
        <form className="login-card" onSubmit={submit}>
          <div className="login-brand only-mobile">
            <span className="logo">
              <FileText size={16} strokeWidth={2.2} />
            </span>
            <b>Dokumen BYLT</b>
          </div>
          <h1>Masuk</h1>
          <p className="muted">Gunakan akun staf Unit Dokumen yang dibuatkan oleh admin.</p>
          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            <span>Kata sandi</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </label>
          {err && <p className="notice error">{err}</p>}
          <button className="btn primary block" disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} /> : 'Masuk'}
          </button>
          <p className="muted small">Lupa kata sandi atau belum punya akun? Hubungi admin Unit Dokumen.</p>
        </form>
        <p className="login-foot">© {new Date().getFullYear()} Unit Dokumen · Balai Yasa Lahat</p>
      </div>
    </div>
  );
}

export function NamePrompt({ email, onSave }: { email: string; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <Aside />
      <div className="login-main">
        <form
          className="login-card"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await onSave(name);
            setBusy(false);
          }}
        >
          <h1>Siapa nama Anda?</h1>
          <p className="muted">
            Nama ini ditampilkan di riwayat aktivitas setiap kali Anda mencatat atau mengubah data. Akun: {email}
          </p>
          <label>
            <span>Nama lengkap</span>
            <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn primary block" disabled={busy || !name.trim()}>
            Simpan
          </button>
        </form>
      </div>
    </div>
  );
}
