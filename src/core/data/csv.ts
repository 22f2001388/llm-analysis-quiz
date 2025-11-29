import { parse, ParseResult } from "papaparse";
import type { Table, Cell } from "@/types/data.js";

type RowObj = Record<string, string>;

function toRows(records: RowObj[], headers: string[]): Cell[][] {
  return records.map((r) =>
    headers.map((h) => (Object.prototype.hasOwnProperty.call(r, h) ? r[h] : null))
  );
}

export function parseCsv(input: string): Table {
  // Handle empty or invalid input
  if (!input || typeof input !== 'string') {
    throw new Error("FORMAT_INVALID");
  }

  const trimmedInput = input.trim();
  if (trimmedInput === '') {
    throw new Error("FORMAT_INVALID");
  }

  const out: ParseResult<RowObj> = parse(trimmedInput, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  // Check for parsing errors
  if (out.errors.length > 0) {
    // Only throw if there are critical errors (not just row parsing issues)
    const criticalErrors = out.errors.filter(err => err.type !== 'Delimiter');
    if (criticalErrors.length > 0) {
      throw new Error("FORMAT_INVALID");
    }
  }

  const records = out.data;
  
  // Handle case with no data
  if (!records || records.length === 0) {
    throw new Error("FORMAT_INVALID");
  }

  const headers = (
    out.meta.fields && out.meta.fields.length
      ? out.meta.fields
      : Object.keys(records[0] || {})
  ).slice();

  // Ensure we have valid headers
  if (headers.length === 0) {
    throw new Error("FORMAT_INVALID");
  }

  const rows = toRows(records, headers);
  return { headers, rows };
}

export function parseTsv(input: string): Table {
  // Handle empty or invalid input
  if (!input || typeof input !== 'string') {
    throw new Error("FORMAT_INVALID");
  }

  const trimmedInput = input.trim();
  if (trimmedInput === '') {
    throw new Error("FORMAT_INVALID");
  }

  const out: ParseResult<RowObj> = parse(trimmedInput, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    delimiter: "\t",
  });

  // Check for parsing errors
  if (out.errors.length > 0) {
    // Only throw if there are critical errors (not just row parsing issues)
    const criticalErrors = out.errors.filter(err => err.type !== 'Delimiter');
    if (criticalErrors.length > 0) {
      throw new Error("FORMAT_INVALID");
    }
  }

  const records = out.data;
  
  // Handle case with no data
  if (!records || records.length === 0) {
    throw new Error("FORMAT_INVALID");
  }

  const headers = (
    out.meta.fields && out.meta.fields.length
      ? out.meta.fields
      : Object.keys(records[0] || {})
  ).slice();

  // Ensure we have valid headers
  if (headers.length === 0) {
    throw new Error("FORMAT_INVALID");
  }

  const rows = toRows(records, headers);
  return { headers, rows };
}
