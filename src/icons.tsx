import {
  Archive,
  Camera,
  History,
  LayoutDashboard,
  Mail,
  Package,
  PenLine,
  type LucideIcon,
} from 'lucide-react';

export const ICONS = {
  ringkasan: LayoutDashboard,
  evp: PenLine,
  surat: Mail,
  pos: Package,
  multimedia: Camera,
  arsip: Archive,
  aktivitas: History,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const C = ICONS[name];
  return <C size={size} strokeWidth={1.8} aria-hidden />;
}
