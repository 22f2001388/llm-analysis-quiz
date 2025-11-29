import type { Table } from "@/types/data.js";

export type OpKind = "sum" | "avg" | "min" | "max" | "count" | "select" | "filter-eq";

export type OperationPlan = {
  op: OpKind;
  column?: string;
  where?: { column: string; eq: string | number | boolean };
  select?: string[];
};

export type SolveInput = {
  taskText: string;
  table?: Table | null;
};

export type SolveResult =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "object"; value: unknown };
