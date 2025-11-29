export type Cell = string | number | boolean | null;
export type ColumnType = "string" | "number" | "boolean";
export type Table = { headers: string[]; rows: Cell[][]; types?: ColumnType[] };

export type Fetched = {
  url: string;
  contentType: string;
  size: number;
  data: Uint8Array;
};

export type JsonData = unknown;
export type PdfData = { text: string };
