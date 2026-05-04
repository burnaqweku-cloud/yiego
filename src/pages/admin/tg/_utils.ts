// Generic helpers shared across Tg admin pages
import { format } from 'date-fns';

export const fmtGhs = (n: number | string | null | undefined) =>
  `GHS ${(Number(n ?? 0)).toFixed(2)}`;

export const fmtDate = (iso: string | null | undefined) =>
  iso ? format(new Date(iso), 'MMM d, yyyy HH:mm') : '—';

export const downloadCsv = (filename: string, rows: Record<string, unknown>[]) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
