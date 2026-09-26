import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { MODULES, moduleById, type ModuleId } from './modules';
import { waNumber } from './util';

export interface HistoryEntry {
  status: string;
  at: string;
  by?: string;
}

export interface DocRecord {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  history: HistoryEntry[];
  values: Record<string, string>;
}

export type DataStore = Record<ModuleId, DocRecord[]>;

export interface Activity {
  id: string;
  at: string;
  userName: string;
  module: ModuleId;
  recordId?: string;
  action: string;
  label?: string;
  detail?: string;
}

export type Role = 'admin' | 'staf';

export interface AppUser {
  id: string;
  email: string;
  name: string;
}

export interface StaffMember {
  id: string;
  email: string;
  name: string;
  role: Role;
  lastSignIn?: string;
}

/** Berkas lampiran (foto/scan) yang disimpan di values.lampiran sebagai JSON. */
export interface Attachment {
  path: string;
  name: string;
  type: string;
  size: number;
  at: string;
  by?: string;
}

const BUCKET = 'lampiran';

export function attachmentsOf(values: Record<string, string>): Attachment[] {
  try {
    const list = JSON.parse(values.lampiran || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const EMPTY: DataStore = { evp: [], surat: [], keluar: [], pos: [], multimedia: [], arsip: [] };
const ACTIVITY_LIMIT = 500;

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

export type NotifyResult = { sent: true; target: string } | { sent: false; reason: string };

/** Perlu kirim WA ke PIC: baru masuk ke tahap pemicu dan nomor PIC terisi. */
function shouldNotify(mod: ModuleId, rec: DocRecord, prev?: DocRecord) {
  const at = moduleById(mod)?.notifyStatus;
  return !!at && rec.status === at && prev?.status !== at && !!waNumber(rec.values.kontakPic);
}

/** Minta server mengirim WA ke PIC unit lewat fungsi "kabari-pic". */
async function invokeNotify(id: string): Promise<NotifyResult> {
  if (!supabase) return { sent: false, reason: 'mode lokal' };
  const { data, error } = await supabase.functions.invoke('kabari-pic', { body: { id } });
  if (error) {
    let reason = error.message;
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) reason = body.error;
    } catch {
      /* pakai pesan bawaan */
    }
    return { sent: false, reason };
  }
  return { sent: true, target: data?.target ?? '' };
}

/** true bila aplikasi terhubung ke server; false berarti mode lokal (data di browser). */
export const isOnline = supabase !== null;

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));

// ---------- Baris database ↔ objek aplikasi ----------

interface RecordRow {
  id: string;
  module: ModuleId;
  status: string;
  values: Record<string, string>;
  history: HistoryEntry[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

interface ActivityRow {
  id: number;
  at: string;
  user_name: string | null;
  module: ModuleId;
  record_id: string | null;
  action: string;
  label: string | null;
  detail: string | null;
}

const fromRow = (r: RecordRow): DocRecord => ({
  id: r.id,
  status: r.status,
  values: r.values ?? {},
  history: r.history ?? [],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  createdBy: r.created_by ?? undefined,
  updatedBy: r.updated_by ?? undefined,
});

const fromActivityRow = (a: ActivityRow): Activity => ({
  id: String(a.id),
  at: a.at,
  userName: a.user_name ?? '–',
  module: a.module,
  recordId: a.record_id ?? undefined,
  action: a.action,
  label: a.label ?? undefined,
  detail: a.detail ?? undefined,
});

const toUser = (s: Session | null): AppUser | null =>
  s
    ? {
        id: s.user.id,
        email: s.user.email ?? '',
        name: (s.user.user_metadata?.full_name as string | undefined)?.trim() || '',
      }
    : null;

function groupRows(rows: RecordRow[]): DataStore {
  const out: DataStore = { evp: [], surat: [], keluar: [], pos: [], multimedia: [], arsip: [] };
  for (const r of rows) if (out[r.module]) out[r.module].push(fromRow(r));
  return out;
}

function withRecord(d: DataStore, mod: ModuleId, rec: DocRecord): DataStore {
  const list = d[mod];
  const exists = list.some((r) => r.id === rec.id);
  return { ...d, [mod]: exists ? list.map((r) => (r.id === rec.id ? rec : r)) : [rec, ...list] };
}

function withoutRecord(d: DataStore, id: string): DataStore {
  const out = { ...d };
  for (const m of MODULES) out[m.id] = d[m.id].filter((r) => r.id !== id);
  return out;
}

const labelOf = (v: Record<string, string>) => v.perihal || v.kegiatan || v.uraian || v.tujuan || v.asal || '';

// ---------- Mode lokal (tanpa server) ----------

const LOCAL_KEY = 'dokbylt:data:v1';
const LOCAL_ACTIVITY_KEY = 'dokbylt:activity:v1';
const LOCAL_USER: AppUser = { id: 'lokal', email: '', name: 'Pengguna lokal' };

function readLocal<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* penyimpanan penuh atau diblokir */
  }
}

// ---------- Hook utama ----------

export function useBackend() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [data, setData] = useState<DataStore>(() => (supabase ? EMPTY : readLocal(LOCAL_KEY, EMPTY)));
  const [activity, setActivity] = useState<Activity[]>(() =>
    supabase ? [] : (readLocal<{ items: Activity[] }>(LOCAL_ACTIVITY_KEY, { items: [] }).items ?? []),
  );
  const [loading, setLoading] = useState(!!supabase);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<Role>(supabase ? 'staf' : 'admin');

  const user = useMemo(() => (supabase ? toUser(session) : LOCAL_USER), [session]);

  // Sesi login
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadAll = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const rows: RecordRow[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data: page, error: e } = await supabase
        .from('records')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (e) {
        setError('Gagal memuat data: ' + e.message);
        setLoading(false);
        return;
      }
      rows.push(...(page as RecordRow[]));
      if (page.length < PAGE) break;
    }
    const { data: acts, error: e2 } = await supabase
      .from('activity')
      .select('*')
      .order('at', { ascending: false })
      .limit(ACTIVITY_LIMIT);
    if (e2) setError('Gagal memuat riwayat: ' + e2.message);
    setData(groupRows(rows));
    setActivity(((acts ?? []) as ActivityRow[]).map(fromActivityRow));
    setLoading(false);
  }, []);

  // Muat data + berlangganan perubahan dari perangkat lain
  const userId = user?.id;
  useEffect(() => {
    if (!supabase || !userId) return;
    // Peran dibaca dari server; aturan hapus di database tetap memeriksanya sendiri.
    supabase.rpc('is_admin').then(({ data: admin }) => setRole(admin ? 'admin' : 'staf'));
    loadAll();
    const channel = supabase
      .channel('dokbylt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, (p) => {
        if (p.eventType === 'DELETE') {
          const id = (p.old as { id?: string }).id;
          if (id) setData((d) => withoutRecord(d, id));
        } else {
          const row = p.new as RecordRow;
          setData((d) => withRecord(withoutRecord(d, row.id), row.module, fromRow(row)));
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity' }, (p) => {
        const a = fromActivityRow(p.new as ActivityRow);
        setActivity((list) => (list.some((x) => x.id === a.id) ? list : [a, ...list].slice(0, ACTIVITY_LIMIT)));
      })
      .subscribe();
    // Ambil ulang saat tab kembali aktif, untuk jaga-jaga koneksi realtime sempat putus.
    const onVisible = () => document.visibilityState === 'visible' && loadAll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, loadAll]);

  // Simpan mode lokal
  useEffect(() => {
    if (supabase) return;
    writeLocal(LOCAL_KEY, data);
    writeLocal(LOCAL_ACTIVITY_KEY, { items: activity.slice(0, ACTIVITY_LIMIT) });
  }, [data, activity]);

  const logLocal = (mod: ModuleId, action: string, rec: DocRecord, detail?: string) =>
    setActivity((l) =>
      [
        {
          id: newId(),
          at: new Date().toISOString(),
          userName: LOCAL_USER.name,
          module: mod,
          recordId: rec.id,
          action,
          label: labelOf(rec.values),
          detail,
        },
        ...l,
      ].slice(0, ACTIVITY_LIMIT),
    );

  const save = useCallback(
    async (mod: ModuleId, rec: DocRecord, prev?: DocRecord): Promise<NotifyResult | undefined> => {
      setData((d) => withRecord(d, mod, rec));
      const notify = shouldNotify(mod, rec, prev);
      if (!supabase) {
        if (!prev) logLocal(mod, 'tambah', rec, rec.status);
        else {
          if (prev.status !== rec.status) logLocal(mod, 'pindah tahap', rec, `${prev.status} → ${rec.status}`);
          const changed = Object.keys({ ...prev.values, ...rec.values }).filter(
            (k) => (prev.values[k] ?? '') !== (rec.values[k] ?? ''),
          );
          if (changed.length) logLocal(mod, 'ubah data', rec, changed.join(', '));
        }
        return notify ? { sent: false, reason: 'mode lokal' } : undefined;
      }
      // Insert dan update dipisah (bukan upsert): trigger BEFORE INSERT ikut jalan pada upsert
      // dan akan mencatat "tambah" palsu di riwayat.
      const row = { status: rec.status, values: rec.values, history: rec.history };
      const { error: e } = prev
        ? await supabase.from('records').update(row).eq('id', rec.id)
        : await supabase.from('records').insert({ id: rec.id, module: mod, ...row });
      if (e) {
        setError('Gagal menyimpan: ' + e.message);
        loadAll();
        return undefined;
      }
      return notify ? invokeNotify(rec.id) : undefined;
    },
    [loadAll],
  );

  const remove = useCallback(
    async (mod: ModuleId, rec: DocRecord) => {
      setData((d) => withoutRecord(d, rec.id));
      if (!supabase) {
        logLocal(mod, 'hapus', rec, rec.status);
        return;
      }
      const { error: e } = await supabase.from('records').delete().eq('id', rec.id);
      if (e) {
        setError('Gagal menghapus: ' + e.message);
        loadAll();
      }
    },
    [loadAll],
  );

  /** Menyimpan banyak data baru sekaligus (impor Excel). */
  const saveMany = useCallback(
    async (mod: ModuleId, recs: DocRecord[]) => {
      setData((d) => ({ ...d, [mod]: [...recs, ...d[mod]] }));
      if (!supabase) {
        for (const r of recs) logLocal(mod, 'tambah', r, 'impor Excel');
        return null;
      }
      for (let i = 0; i < recs.length; i += 200) {
        const chunk = recs.slice(i, i + 200).map((r) => ({
          id: r.id,
          module: mod,
          status: r.status,
          values: r.values,
          history: r.history,
          created_at: r.createdAt,
          updated_at: r.updatedAt,
        }));
        const { error: e } = await supabase.from('records').insert(chunk);
        if (e) {
          setError('Gagal mengimpor: ' + e.message);
          loadAll();
          return e.message;
        }
      }
      return null;
    },
    [loadAll],
  );

  // ---------- Lampiran ----------

  const uploadFile = useCallback(async (path: string, file: Blob): Promise<string | null> => {
    if (!supabase) {
      // Mode lokal: simpan sebagai data URL di browser.
      return await new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.onerror = () => res(null);
        fr.readAsDataURL(file);
      });
    }
    const { error: e } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (e) {
      setError('Gagal mengunggah: ' + e.message);
      return null;
    }
    return path;
  }, []);

  const fileUrl = useCallback(async (path: string) => {
    if (!supabase || path.startsWith('data:')) return path;
    const { data: d } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    return d?.signedUrl ?? null;
  }, []);

  const removeFile = useCallback(async (path: string) => {
    if (!supabase || path.startsWith('data:')) return;
    await supabase.storage.from(BUCKET).remove([path]);
  }, []);

  // ---------- Peran staf ----------

  const listStaff = useCallback(async (): Promise<StaffMember[]> => {
    if (!supabase) return [{ id: LOCAL_USER.id, email: '', name: LOCAL_USER.name, role: 'admin' }];
    const { data: rows, error: e } = await supabase.rpc('list_staff');
    if (e) {
      setError('Gagal memuat daftar staf: ' + e.message);
      return [];
    }
    return (rows as { id: string; email: string; name: string; role: Role; last_sign_in_at: string | null }[]).map(
      (r) => ({ id: r.id, email: r.email, name: r.name, role: r.role, lastSignIn: r.last_sign_in_at ?? undefined }),
    );
  }, []);

  const setStaffRole = useCallback(async (id: string, next: Role) => {
    if (!supabase) return null;
    const { error: e } = await supabase.rpc('set_staff_role', { target: id, new_role: next });
    return e ? e.message : null;
  }, []);

  const replaceAll = useCallback((next: DataStore) => {
    if (supabase) return;
    setData({ ...EMPTY, ...next });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return null;
    const { error: e } = await supabase.auth.signInWithPassword({ email, password });
    if (!e) return null;
    return e.message === 'Invalid login credentials' ? 'Email atau kata sandi salah.' : e.message;
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setData(EMPTY);
    setActivity([]);
  }, []);

  const setName = useCallback(async (name: string) => {
    if (!supabase) return;
    const { error: e } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    if (e) {
      setError('Gagal menyimpan nama: ' + e.message);
      return;
    }
    // Perbarui token agar nama baru ikut tercatat di riwayat.
    await supabase.auth.refreshSession();
  }, []);

  const changePassword = useCallback(async (password: string) => {
    if (!supabase) return null;
    const { error: e } = await supabase.auth.updateUser({ password });
    return e ? e.message : null;
  }, []);

  return {
    authReady,
    user,
    role,
    isAdmin: role === 'admin',
    data,
    activity,
    loading,
    error,
    clearError: () => setError(null),
    save,
    saveMany,
    remove,
    uploadFile,
    fileUrl,
    removeFile,
    listStaff,
    setStaffRole,
    replaceAll,
    signIn,
    signOut,
    setName,
    changePassword,
  };
}
