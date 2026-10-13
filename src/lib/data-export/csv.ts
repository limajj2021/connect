export interface CsvColumn<T> {
  key: keyof T;
  label: string;
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCsvCell(row[c.key])).join(","));
  // Leading BOM so Excel on Windows/macOS opens UTF-8 Traditional-Chinese text correctly.
  return "﻿" + [header, ...lines].join("\r\n");
}
