// CSV export.
//
// Kept as a pure builder plus a thin download shim so the part that can be got wrong (escaping)
// is unit tested. Excel and Sheets both need RFC 4180 quoting or a customer name containing a
// comma silently shifts every column after it, which is the kind of bug that shows up months later
// in someone's accounts.

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * Escapes one field. Quotes are doubled, and any field containing a comma, quote, newline or
 * leading/trailing space is wrapped.
 */
function escapeField(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  const s = String(raw);
  const needsQuoting = /[",\r\n]/.test(s) || s !== s.trim();
  return needsQuoting ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds an RFC 4180 CSV. Rows are CRLF separated, which is what Excel expects. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => escapeField(c.header)).join(",");
  const body = rows.map((row) => columns.map((c) => escapeField(c.value(row))).join(","));
  return [head, ...body].join("\r\n");
}

/**
 * Triggers a download of `csv` as `filename`. Prefixed with a UTF-8 BOM so Excel on Windows reads
 * accented customer names correctly instead of mojibake.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoked on the next tick: revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Convenience: build and download in one call. */
export function exportCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]): void {
  downloadCsv(filename, toCsv(rows, columns));
}
