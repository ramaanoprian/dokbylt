import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import bg from './assets/login-bg.jpg';

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
      <div className="login-bg" style={{ backgroundImage: `url(${bg})` }} aria-hidden />
      <form className="login-card" onSubmit={submit}>
        <span className="logo">
          <FileText size={22} />
        </span>
        <h1>Dokumen BYLT</h1>
        <p className="muted">Dashboard internal unit dokumen Balai Yasa Lahat. Masuk dengan akun staf.</p>
        <label>
          <span>Email</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
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
        <p className="muted small center">Belum punya akun? Minta admin unit dokumen untuk membuatkan.</p>
      </form>
      <p className="login-foot">Unit Dokumen · Balai Yasa Lahat</p>
    </div>
  );
}

export function NamePrompt({ email, onSave }: { email: string; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <div className="login-bg" style={{ backgroundImage: `url(${bg})` }} aria-hidden />
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
  );
}
