import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';

/** Bilah judul halaman yang menempel di atas saat digulir, seperti di situs Apple. */
export function LocalNav({
  title,
  icon,
  mod,
  children,
}: {
  title: string;
  icon?: IconName;
  /** Id menu, untuk warna ikonnya. */
  mod?: string;
  children?: ReactNode;
}) {
  return (
    <div className="lnav" data-mod={mod}>
      <div className="lnav-inner">
        <b className="lnav-title">
          {icon && (
            <span className="app-icon sm">
              <Icon name={icon} size={14} />
            </span>
          )}
          {title}
        </b>
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
        <span className="hero-title">{title}</span>
        {sub && <span className="hero-sub"> {sub}</span>}
      </h1>
      {lead && <p className="hero-lead">{lead}</p>}
      {children}
    </header>
  );
}
