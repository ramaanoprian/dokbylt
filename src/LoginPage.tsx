import { useState, type ReactNode } from 'react';
import { ArrowRight, FileText, Loader2 } from 'lucide-react';
import bg from './assets/login-bg.jpg';

/** Kerangka halaman masuk: foto balai di atas, form di tengah. */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="login">
      <div className="login-hero" style={{ backgroundImage: `url(${bg})` }}>
        <div className="login-hero-text">
          <span className="logo light" aria-hidden>
            <FileText size={16} strokeWidth={2.2} />
          </span>
          <h1>Dokumen BYLT.</h1>
          <p>Semua dokumen Unit Dokumen, dari masuk sampai kembali.</p>
        </div>
      </div>
      <div className="login-main">
        {children}
        <p className="login-foot">© {new Date().getFullYear()} Unit Dokumen · Balai Yasa Lahat</p>
      </div>
    </div>
  );
}

/** Kolom isian dengan label yang naik saat diisi. */
function Field({ label, ...input }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field">
      <input {...input} placeholder=" " />
      <span>{label}</span>
    </label>
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
    <Shell>
      <form className="login-card" onSubmit={submit}>
        <h2>Masuk ke Dokumen BYLT</h2>
        <p className="muted">Gunakan akun staf Unit Dokumen.</p>
        <div className="fields">
          <Field
            label="Email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Kata sandi"
            type="password"
            autoComplete="current-password"
            required
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </div>
        {err && <p className="notice error">{err}</p>}
        <button className="pill-btn big block" disabled={busy}>
          {busy ? (
            <Loader2 className="spin" size={18} />
          ) : (
            <>
              Masuk <ArrowRight size={16} />
            </>
          )}
        </button>
        <p className="muted small center">Lupa kata sandi atau belum punya akun? Hubungi admin Unit Dokumen.</p>
      </form>
    </Shell>
  );
}

export function NamePrompt({ email, onSave }: { email: string; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Shell>
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onSave(name);
          setBusy(false);
        }}
      >
        <h2>Siapa nama Anda?</h2>
        <p className="muted">
          Nama ini tampil di riwayat aktivitas setiap kali Anda mencatat atau mengubah data. Akun: {email}
        </p>
        <div className="fields">
          <Field label="Nama lengkap" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="pill-btn big block" disabled={busy || !name.trim()}>
          Simpan
        </button>
      </form>
    </Shell>
  );
}
