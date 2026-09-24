// Reads Viseca's synthetic data pack (viseca-2026-main/data). Join on ids, never on names.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";

export const DATA_DIR = fileURLToPath(new URL("../../viseca-2026-main/data/", import.meta.url));

export type Row = Record<string, string>;

export function readCsv(file: string): Row[] {
  return parse(readFileSync(DATA_DIR + file), { columns: true, skip_empty_lines: true });
}

export function indexBy(rows: Row[], key: string): Map<string, Row> {
  return new Map(rows.map((r) => [r[key], r]));
}

export function groupBy(rows: Row[], key: string): Map<string, Row[]> {
  const out = new Map<string, Row[]>();
  for (const r of rows) {
    const list = out.get(r[key]) ?? [];
    list.push(r);
    out.set(r[key], list);
  }
  return out;
}
