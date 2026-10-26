import Papa from "papaparse";

/** Upload limits for marksheet CSVs. */
export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_CSV_ROWS = 5000;

export type RawRow = Record<string, unknown>;

export class CsvLimitError extends Error {}

export interface ParsedCsv {
  headers: string[];
  rows: RawRow[];
  delimiter: string;
  /** Non-fatal parser notes, for example rows with too few fields. */
  warnings: string[];
}

/**
 * Parses a marksheet CSV. Handles escaped quotes, quotes spanning lines, a UTF-8 BOM, and comma,
 * semicolon, tab or pipe delimiters (auto-detected). Header names are trimmed and lower-cased.
 */
export function parseCsv(text: string): ParsedCsv {
  if (text.length > MAX_CSV_BYTES) {
    throw new CsvLimitError(`CSV is larger than ${MAX_CSV_BYTES / 1024 / 1024} MB.`);
  }
  const clean = text.replace(/^﻿/, "");
  const result = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });

  if (result.data.length > MAX_CSV_ROWS) {
    throw new CsvLimitError(`CSV has more than ${MAX_CSV_ROWS} rows.`);
  }
  const fatal = result.errors.find((e) => e.type === "Quotes");
  if (fatal) throw new Error(`CSV has an unterminated quote near row ${(fatal.row ?? 0) + 2}.`);

  return {
    headers: (result.meta.fields ?? []).filter((h) => h !== ""),
    rows: result.data,
    delimiter: result.meta.delimiter,
    warnings: result.errors.map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`),
  };
}

export const parseMessyCSV = (text: string): RawRow[] => parseCsv(text).rows;
export const csvHeaders = (text: string): string[] => parseCsv(text).headers;
