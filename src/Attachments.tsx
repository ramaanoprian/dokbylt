import { useEffect, useRef, useState } from 'react';
import { Camera, FileText, Paperclip, Trash2 } from 'lucide-react';
import type { Attachment } from './backend';

export interface FileApi {
  upload: (path: string, file: Blob) => Promise<string | null>;
  url: (path: string) => Promise<string | null>;
  remove: (path: string) => Promise<void>;
}

interface Props {
  folder: string;
  items: Attachment[];
  userName: string;
  files: FileApi;
  onChange: (items: Attachment[]) => void;
}

const MAX_SIDE = 1800;

/** Foto dari kamera HP bisa 5–10 MB; perkecil dulu supaya hemat kuota penyimpanan. */
export async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.82));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

const safeName = (n: string) => n.replace(/[^\w.-]+/g, '_').slice(-80);
const fmtSize = (b: number) => (b > 1_000_000 ? `${(b / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1000))} KB`);

function Thumb({ a, files }: { a: Attachment; files: FileApi }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    files.url(a.path).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [a.path, files]);
  const isImg = a.type.startsWith('image/');
  return (
    <a className="att-thumb" href={src ?? undefined} target="_blank" rel="noreferrer" aria-label={`Buka ${a.name}`}>
      {isImg && src ? <img src={src} alt="" loading="lazy" /> : <FileText size={26} />}
    </a>
  );
}

export function Attachments({ folder, items, userName, files, onChange }: Props) {
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState('');
  const pickRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setErr('');
    setBusy(list.length);
    const added: Attachment[] = [];
    for (const f of Array.from(list)) {
      if (!/^image\/|^application\/pdf$/.test(f.type)) {
        setErr('Hanya foto (JPG/PNG) dan PDF yang bisa dilampirkan.');
        continue;
      }
      const blob = await shrink(f);
      if (blob.size > 10_000_000) {
        setErr(`${f.name} lebih dari 10 MB.`);
        continue;
      }
      const name = blob === f ? f.name : f.name.replace(/\.\w+$/, '') + '.jpg';
      const path = await files.upload(`${folder}/${Date.now()}-${safeName(name)}`, blob);
      if (path) added.push({ path, name, type: blob.type || f.type, size: blob.size, at: new Date().toISOString(), by: userName });
      setBusy((n) => n - 1);
    }
    setBusy(0);
    if (added.length) onChange([...items, ...added]);
  };

  // Berkas baru benar-benar dihapus dari penyimpanan saat form disimpan.
  const drop = (a: Attachment) => onChange(items.filter((x) => x.path !== a.path));

  return (
    <div className="attachments full">
      <div className="att-head">
        <span>Lampiran foto/scan</span>
        <span className="muted small">{items.length ? `${items.length} berkas` : 'Belum ada'}</span>
      </div>
      {items.length > 0 && (
        <ul className="att-list">
          {items.map((a) => (
            <li key={a.path}>
              <Thumb a={a} files={files} />
              <span className="grow">
                <span className="ellipsis block">{a.name}</span>
                <span className="muted small">
                  {fmtSize(a.size)}
                  {a.by && ` · ${a.by}`}
                </span>
              </span>
              <button type="button" className="icon-btn" onClick={() => drop(a)} aria-label={`Hapus ${a.name}`}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="att-actions">
        <button type="button" className="btn small" onClick={() => camRef.current?.click()} disabled={busy > 0}>
          <Camera size={15} /> Foto
        </button>
        <button type="button" className="btn small" onClick={() => pickRef.current?.click()} disabled={busy > 0}>
          <Paperclip size={15} /> Pilih file
        </button>
        {busy > 0 && <span className="muted small">Mengunggah…</span>}
      </div>
      {err && <p className="notice">{err}</p>}
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
      <input ref={pickRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
    </div>
  );
}
