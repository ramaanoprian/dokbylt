import { MODULES, type ModuleDef } from './modules';
import type { DataStore, DocRecord } from './backend';
import { REMIND_DAYS, daysUntil, deadlineOf } from './util';

export interface Reminder {
  m: ModuleDef;
  r: DocRecord;
  date: string;
  days: number;
}

/** Data yang tenggatnya sudah lewat atau tinggal ≤ REMIND_DAYS hari, paling mendesak dulu. */
export function collectReminders(data: DataStore): Reminder[] {
  return MODULES.flatMap((m) =>
    data[m.id].flatMap((r) => {
      const date = deadlineOf(m, r);
      if (!date) return [];
      const days = daysUntil(date);
      return days <= REMIND_DAYS ? [{ m, r, date, days }] : [];
    }),
  ).sort((a, b) => a.days - b.days);
}
