import type { SolveResult, OperationPlan } from "@/types/solve.js";
import type { Table } from "@/types/data.js";

function normalizeColumnName(name: string): string {
  return name.trim().toLowerCase();
}

function findColumnIndex(table: Table, columnName: string): number | null {
  const normalized = normalizeColumnName(columnName);
  for (let i = 0; i < table.headers.length; i++) {
    if (normalizeColumnName(table.headers[i]) === normalized) {
      return i;
    }
  }
  return null;
}

function parseColumn(match: RegExpMatchArray): string | null {
  return match[1] || match[2] || match[3] || null;
}

export function parseOperation(taskText: string): OperationPlan | null {
  const lower = taskText.toLowerCase();
  const colRx = `(?:"([^"]+)"|'([^']+)'|([\\w.-]+(?:\\s+[\\w.-]+)*))`;

  const sumMatch = lower.match(new RegExp(`sum(?:\\s+of)?\\s+(?:the\\s+)?(?:column\\s+)?${colRx}`, 'i'));
  if (sumMatch) {
    const column = parseColumn(sumMatch);
    if (column) return { op: "sum", column };
  }

  const avgMatch = lower.match(new RegExp(`(?:average|avg|mean)(?:\\s+of)?\\s+(?:the\\s+)?(?:column\\s+)?${colRx}`, 'i'));
  if (avgMatch) {
    const column = parseColumn(avgMatch);
    if (column) return { op: "avg", column };
  }

  const minMatch = lower.match(new RegExp(`(?:minimum|min)(?:\\s+of)?\\s+(?:the\\s+)?(?:column\\s+)?${colRx}`, 'i'));
  if (minMatch) {
    const column = parseColumn(minMatch);
    if (column) return { op: "min", column };
  }

  const maxMatch = lower.match(new RegExp(`(?:maximum|max)(?:\\s+of)?\\s+(?:the\\s+)?(?:column\\s+)?${colRx}`, 'i'));
  if (maxMatch) {
    const column = parseColumn(maxMatch);
    if (column) return { op: "max", column };
  }

  if (lower.includes("count") && lower.includes("rows")) {
    return { op: "count" };
  }
  const filterMatch = lower.match(new RegExp(`rows?\\s+where\\s+(?:column\\s+)?${colRx}\\s+equals?\\s+(.+)`, 'i'));
  if (filterMatch) {
    const column = parseColumn(filterMatch);
    if (!column) return null;
    const valueStr = filterMatch[4].trim();
    let value: string | number | boolean = valueStr;
    if (!isNaN(Number(valueStr))) {
      value = Number(valueStr);
    } else if (valueStr.toLowerCase() === "true") {
      value = true;
    } else if (valueStr.toLowerCase() === "false") {
      value = false;
    }
    return { op: "filter-eq", column, where: { column, eq: value } };
  }

  return null;
}

function applyOperation(table: Table, plan: OperationPlan): SolveResult | null {
  const { op, column, where } = plan;

  if (op === "count") {
    return { kind: "number", value: table.rows.length };
  }

  if (!column) return null;

  const colIndex = findColumnIndex(table, column);
  if (colIndex === null) return null;

  if (op === "sum" || op === "avg" || op === "min" || op === "max") {
    const values: number[] = [];
    for (const row of table.rows) {
      const cell = row[colIndex];
      if (typeof cell === "number" && !isNaN(cell) && isFinite(cell)) {
        values.push(cell);
      } else if (typeof cell === "string" && cell.trim() !== "") {
        const num = parseFloat(cell.trim());
        if (!isNaN(num) && isFinite(num)) {
          values.push(num);
        }
      }
    }
    if (values.length === 0) return null;
    if (op === "sum") return { kind: "number", value: values.reduce((a, b) => a + b, 0) };
    if (op === "avg") return { kind: "number", value: values.reduce((a, b) => a + b, 0) / values.length };
    if (op === "min") return { kind: "number", value: Math.min(...values) };
    if (op === "max") return { kind: "number", value: Math.max(...values) };
  }

  if (op === "filter-eq") {
    if (!where) return null;
    const filteredRows = table.rows.filter((row) => {
      const cell = row[colIndex];
      return cell === where.eq;
    });
    return { kind: "number", value: filteredRows.length };
  }

  return null;
}

export function solveDeterministic(taskText: string, table: Table | null): SolveResult | null {
  if (!table) return null;

  const plan = parseOperation(taskText);
  if (!plan) return null;

  return applyOperation(table, plan);
}

export function applyPlan(table: Table, plan: OperationPlan): SolveResult | null {
  return applyOperation(table, plan);
}