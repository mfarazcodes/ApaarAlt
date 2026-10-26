/**
 * CSV export that is safe to open in a spreadsheet.
 *
 * A cell that starts with =, +, - or @ can be run as a formula by Excel or Sheets ("CSV injection"), so such
 * cells are prefixed with an apostrophe. Cells are quoted when they hold a comma, quote or newline.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: { key: keyof T & string; header: string }[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c.key])).join(","));
  return lines.join("\r\n") + "\r\n";
}
