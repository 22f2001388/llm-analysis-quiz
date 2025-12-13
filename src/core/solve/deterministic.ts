import type { Table } from "@/types/data.js";
import type { OperationPlan, SolveResult } from "@/types/solve.js";

export function applyPlan(table: Table, plan: OperationPlan): SolveResult | null {
  if (plan.op === 'direct-answer' && plan.answer !== undefined) {
    const answer = plan.answer;
    if (typeof answer === 'number') {
      return { kind: 'number', value: answer };
    }
    if (typeof answer === 'string') {
      return { kind: 'string', value: answer };
    }
    if (typeof answer === 'boolean') {
      return { kind: 'boolean', value: answer };
    }
    return { kind: 'object', value: answer };
  }
  return null;
}
