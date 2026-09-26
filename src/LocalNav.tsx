import type { ReactNode } from 'react';

/** Bilah judul halaman yang menempel di atas saat digulir, seperti di situs Apple. */
export function LocalNav({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="lnav">
      <div className="lnav-inner">
        <b className="lnav-title">{title}</b>
        <div className="lnav-actions">{children}</div>
      </div>
    </div>
  );
}

/** Judul besar dua nada: kalimat pertama hitam, lanjutan abu-abu. Penjelasan panjang masuk ke `lead`. */
export function Hero({
  title,
  sub,
  lead,
  children,
}: {
  title: string;
  sub?: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="hero">
      <h1>
        {title}
        {sub && <span className="hero-sub"> {sub}</span>}
      </h1>
      {lead && <p className="hero-lead">{lead}</p>}
      {children}
    </header>
  );
}
