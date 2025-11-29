export type LlmAdvice = {
  op: "sum" | "avg" | "min" | "max" | "count" | "select" | "filter-eq";
  column?: string;
  where?: { column: string; eq: string | number | boolean };
  select?: string[];
};
