import { useCallback, useEffect, useState } from 'react';
import type { ModuleId } from './modules';

export interface HistoryEntry {
  status: string;
  at: string;
}

export interface DocRecord {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  history: HistoryEntry[];
  values: Record<string, string>;
}

export type DataStore = Record<ModuleId, DocRecord[]>;

const KEY = 'dokbylt:data:v1';
const EMPTY: DataStore = { evp: [], surat: [], pos: [], multimedia: [], arsip: [] };

function load(): DataStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return EMPTY;
  }
}

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function useDataStore() {
  const [data, setData] = useState<DataStore>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* penyimpanan penuh atau diblokir */
    }
  }, [data]);

  const upsert = useCallback((mod: ModuleId, rec: DocRecord) => {
    setData((d) => {
      const list = d[mod];
      const exists = list.some((r) => r.id === rec.id);
      return { ...d, [mod]: exists ? list.map((r) => (r.id === rec.id ? rec : r)) : [rec, ...list] };
    });
  }, []);

  const remove = useCallback((mod: ModuleId, id: string) => {
    setData((d) => ({ ...d, [mod]: d[mod].filter((r) => r.id !== id) }));
  }, []);

  const replaceAll = useCallback((next: DataStore) => setData({ ...EMPTY, ...next }), []);

  return { data, upsert, remove, replaceAll };
}
