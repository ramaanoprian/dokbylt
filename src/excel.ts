// Impor dan ekspor Excel. Pustaka dimuat saat dibutuhkan saja agar aplikasi tetap ringan.
import { MODULES, OTHER, firstStatus, otherKey, type Field, type ModuleDef } from './modules';
import { newId, type DataStore, type DocRecord } from './backend';
import { defaultDue, shown, today } from './util';

type Cell = string | number | boolean | Date | null | undefined;

const STATUS_HEADERS = ['tahap', 'status'];

function toCells(mod: ModuleDef, r: DocRecord) {
  return [
    ...mod.fields.map((f): { value?: Cell; type?: DateConstructor | NumberConstructor | StringConstructor; format?: string } => {
      const v = shown(f, r.values);
      if (!v) return {};
      if (f.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return { value: new Date(v + 'T00:00:00Z'), type: Date, format: 'dd/mm/yyyy' };
      if (f.type === 'number' && !isNaN(Number(v))) return { value: Number(v), type: Number };
      return { value: v, type: String };
    }),
    { value: r.status, type: String },
  ];
}

function sheetOf(mod: ModuleDef, rows: DocRecord[], name = mod.menu) {
  const header = [...mod.fields.map((f) => f.label), 'Tahap'].map((h) => ({ value: h, fontWeight: 'bold' as const }));
  return {
    sheet: name.slice(0, 31),
    data: [header, ...rows.map((r) => toCells(mod, r))],
    columns: [...mod.fields.map((f) => ({ width: f.type === 'textarea' || f.key === 'perihal' ? 48 : f.type === 'date' ? 13 : 22 })), { width: 24 }],
    stickyRowsCount: 1,
  };
}

async function writer() {
  return (await import('write-excel-file/browser')).default;
}

/** Unduh data satu menu (sesuai filter yang sedang tampil) sebagai .xlsx. */
export async function exportXlsx(mod: ModuleDef, rows: DocRecord[]) {
  const write = await writer();
  const s = sheetOf(mod, rows);
  // Tipe pustaka terlalu ketat untuk baris berisi sel campuran; formatnya sendiri valid.
  await write(s.data as never, { sheet: s.sheet, columns: s.columns, stickyRowsCount: 1 } as never).toFile(`${mod.id}-${today()}.xlsx`);
}

/** Rekap satu bulan (YYYY-MM): satu sheet per menu, berdasarkan tanggal utama tiap data. */
export async function exportRekap(data: DataStore, month: string) {
  const write = await writer();
  const sheets = MODULES.map((m) => sheetOf(m, data[m.id].filter((r) => (r.values[m.dateField] ?? '').startsWith(month))));
  const summary = {
    sheet: 'Ringkasan',
    data: [
      [
        { value: 'Menu', fontWeight: 'bold' as const },
        { value: 'Jumlah', fontWeight: 'bold' as const },
        { value: 'Selesai', fontWeight: 'bold' as const },
      ],
      ...sheets.map((s, i) => {
        const m = MODULES[i];
        const done = s.data.length - 1 - data[m.id].filter((r) => (r.values[m.dateField] ?? '').startsWith(month) && r.status !== m.statuses[m.statuses.length - 1]).length;
        return [
          { value: m.menu, type: String },
          { value: s.data.length - 1, type: Number },
          { value: done, type: Number },
        ];
      }),
    ],
    columns: [{ width: 24 }, { width: 12 }, { width: 12 }],
  };
  await write([summary, ...sheets] as never).toFile(`rekap-dokumen-${month}.xlsx`);
}

/** Cadangan lengkap: semua data semua menu, satu sheet per menu. */
export async function exportAll(data: DataStore) {
  const write = await writer();
  await write(MODULES.map((m) => sheetOf(m, data[m.id])) as never).toFile(`cadangan-dokumen-${today()}.xlsx`);
}

/** File contoh berisi judul kolom yang dikenali saat impor. */
export async function downloadTemplate(mod: ModuleDef) {
  const write = await writer();
  const header = [...mod.fields.map((f) => f.label), 'Tahap'].map((h) => ({ value: h, fontWeight: 'bold' as const }));
  const example = [...mod.fields.map((f) => ({ value: f.type === 'date' ? today() : f.options?.[0] ?? '', type: String })), { value: firstStatus(mod), type: String }];
  await write([header, example] as never, { columns: header.map(() => ({ width: 22 })) } as never).toFile(`contoh-impor-${mod.id}.xlsx`);
}

// ---------- Impor ----------

export interface ImportResult {
  records: DocRecord[];
  /** Kolom file yang tidak dikenali (diabaikan). */
  ignored: string[];
  /** Kolom wajib yang tidak ada di file. */
  missingColumns: string[];
  /** Baris yang dilewati beserta alasannya. */
  skipped: { row: number; reason: string }[];
}

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const sep = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell), rows.push(row), (row = []), (cell = '');
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim()));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Mengubah isi sel menjadi YYYY-MM-DD; menerima tanggal Excel, 2026-08-11, 11/08/2026, 11-08-2026. */
function toDate(v: Cell): string {
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return '';
}

// Judul kolom dari register lama (Excel buku agenda) yang namanya berbeda dengan form.
const ALIASES: Record<string, string[]> = {
  unitpengusul: ['unit'],
  tanggalsurat: ['tanggalSurat', 'tanggal', 'tanggalTerima', 'tanggalMasuk'],
  tanggalagenda: ['tanggalMasuk', 'tanggalTerima', 'tanggal'],
  batasttd: ['tenggat'],
  nosuratdokumen: ['nomor', 'nomorSurat'],
  nosurat: ['nomorSurat', 'nomor'],
  jenisdokumen: ['jenis'],
  asaltujuan: ['asal', 'tujuan'],
  nowa: ['kontakPic', 'kontak'],
  nowapic: ['kontakPic'],
  nohp: ['kontakPic', 'kontak'],
};

function matchField(mod: ModuleDef, header: string): Field | undefined {
  const h = norm(header);
  if (!h) return undefined;
  const alias = ALIASES[h]?.map((k) => mod.fields.find((f) => f.key === k)).find(Boolean);
  return (
    alias ??
    mod.fields.find((f) => norm(f.label) === h || norm(f.key) === h) ??
    mod.fields.find((f) => norm(f.label).startsWith(h) || h.startsWith(norm(f.label)))
  );
}

export async function readImportFile(file: File, mod: ModuleDef, userName: string): Promise<ImportResult> {
  let rows: Cell[][];
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
    rows = parseCsv((await file.text()).replace(/^﻿/, ''));
  } else {
    const { readSheet } = await import('read-excel-file/browser');
    rows = (await readSheet(file)) as Cell[][];
  }
  const [head = [], ...body] = rows;
  const headers = head.map((h) => String(h ?? '').trim());
  const map = headers.map((h) => (STATUS_HEADERS.includes(norm(h)) ? 'status' : matchField(mod, h)));
  const ignored = headers.filter((h, i) => h && !map[i]);
  const found = new Set(map.filter((m): m is Field => typeof m === 'object').map((f) => f.key));
  const missingColumns = mod.fields.filter((f) => f.required && !found.has(f.key)).map((f) => f.label);

  const records: DocRecord[] = [];
  const skipped: ImportResult['skipped'] = [];
  body.forEach((row, idx) => {
    const line = idx + 2;
    if (!row.some((c) => String(c ?? '').trim())) return;
    const values: Record<string, string> = {};
    let status = firstStatus(mod);
    map.forEach((f, i) => {
      const raw = row[i];
      if (!f || raw == null || String(raw).trim() === '' || String(raw).trim() === '-') return;
      if (f === 'status') {
        const t = norm(String(raw)).replace(/^(sudah|telah)/, '');
        const s = mod.statuses.find((x) => norm(x) === t) ?? (t.length > 4 ? mod.statuses.find((x) => norm(x).startsWith(t)) : undefined);
        if (s) status = s;
        return;
      }
      if (f.type === 'date') {
        const d = toDate(raw);
        if (d) values[f.key] = d;
        return;
      }
      const text = String(raw).trim();
      if (f.type === 'select' && f.options) {
        const opt = f.options.find((o) => norm(o) === norm(text));
        if (opt) {
          values[f.key] = opt;
          delete values[otherKey(f.key)];
        } else if (values[f.key] && values[f.key] !== OTHER) return;
        else if (f.options.includes(OTHER)) {
          values[f.key] = OTHER;
          values[otherKey(f.key)] = text;
        } else values[f.key] = text;
        return;
      }
      values[f.key] = text;
    });
    const lacking = mod.fields.filter((f) => f.required && !values[f.key]).map((f) => f.label.toLowerCase());
    if (lacking.length) {
      skipped.push({ row: line, reason: `${lacking.join(', ')} kosong` });
      return;
    }
    // Data yang belum selesai tanpa tenggat diberi tenggat bawaan menu.
    if (!values.tenggat && status !== mod.statuses[mod.statuses.length - 1]) {
      const due = defaultDue(mod, values);
      if (due) values.tenggat = due;
    }
    const at = (values[mod.dateField] ?? today()) + 'T08:00:00+07:00';
    const upto = mod.statuses.slice(0, mod.statuses.indexOf(status) + 1);
    records.push({
      id: newId(),
      status,
      createdAt: new Date(at).toISOString(),
      updatedAt: new Date(at).toISOString(),
      createdBy: userName,
      updatedBy: userName,
      history: upto.map((s) => ({ status: s, at: new Date(at).toISOString(), by: `${userName} (impor)` })),
      values,
    });
  });
  return { records, ignored, missingColumns, skipped };
}
