import type { Table, Cell, ColumnType, JsonData } from "@/types/data.js";
import { logger } from "@/adapters/telemetry/logger.js";

function toSafeString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function toCell(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  return null;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = toSafeString(v);
  if (s === null) return null;
  const cleaned = s.trim().replace(/,/g, "");
  if (cleaned === "" || /^nan$/i.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function coerceNumbers(table: Table): Table {
  const { headers } = table;
  const rowsCopy: Cell[][] = table.rows.map((r) => r.slice());
  const types: ColumnType[] = Array.from({ length: headers.length }, () => "string");

  for (let c = 0; c < headers.length; c++) {
    let numericCount = 0;
    for (let r = 0; r < rowsCopy.length; r++) {
      const n = toNumber(rowsCopy[r][c]);
      if (n !== null) numericCount++;
    }
    if (numericCount > 0 && numericCount >= Math.max(1, Math.floor(rowsCopy.length * 0.6))) {
      types[c] = "number";
      for (let r = 0; r < rowsCopy.length; r++) {
        const n = toNumber(rowsCopy[r][c]);
        rowsCopy[r][c] = n === null ? null : n;
      }
    }
  }
  return { headers, rows: rowsCopy, types };
}

export function fromJsonArray(arr: unknown[]): Table {
  const objs = arr.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
  const headers = Array.from(new Set(objs.flatMap((o) => Object.keys(o))));
  const rows: Cell[][] = objs.map((o) => headers.map((h) => toCell(Object.prototype.hasOwnProperty.call(o, h) ? o[h] : null)));
  return coerceNumbers({ headers, rows });
}

export function normalizeJson(data: JsonData): Table | null {
  if (Array.isArray(data)) return fromJsonArray(data);
  if (data && typeof data === "object") {
    const arrays = Object.values(data as Record<string, unknown>).filter((v) => Array.isArray(v)) as unknown[][];
    if (arrays.length > 0) {
      if (arrays.length > 1) {
        logger.warn({ arraysFound: arrays.length }, 'normalizeJson: Multiple arrays found, using first one');
      }
      return fromJsonArray(arrays[0]);
    }
  }
  return null;
}
