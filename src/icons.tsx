import {
  Archive,
  Camera,
  Drone,
  History,
  LayoutDashboard,
  Mail,
  Package,
  PenLine,
  Send,
  type LucideIcon,
} from 'lucide-react';

export const ICONS = {
  ringkasan: LayoutDashboard,
  evp: PenLine,
  surat: Mail,
  keluar: Send,
  pos: Package,
  multimedia: Camera,
  arsip: Archive,
  drone: Drone,
  aktivitas: History,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const C = ICONS[name];
  return <C size={size} strokeWidth={1.8} aria-hidden />;
}
