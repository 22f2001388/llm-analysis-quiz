import { callGemini } from "@/adapters/llm/gemini.js";
import type { Table } from "@/types/data.js";
import type { OperationPlan } from "@/types/solve.js";

export function buildPrompt(taskText: string, table: Table | null): string {
  let prompt = `Task: "${taskText}"\n\n`;
  if (table) {
    prompt += `Data table headers: ${table.headers.join(', ')}\n`;
    prompt += `Sample rows: ${table.rows.slice(0, 3).map(row => row.join(', ')).join('; ')}\n`;
    prompt += `Total rows: ${table.rows.length}\n\n`;
  }
  prompt += `Identify the required operation. Possible ops: sum, avg, min, max, count, filter-eq.\n`;
  prompt += `For sum/avg/min/max/count: specify column name.\n`;
  prompt += `For filter-eq: specify column and eq value.\n`;
  prompt += `Respond with JSON only: {"op": "...", "column": "...", "where": {"column": "...", "eq": "..."}}\n`;
  prompt += `If unclear, respond with null.`;
  return prompt;
}

export function parseResponse(response: string | null): OperationPlan | null {
  if (!response || typeof response !== 'string') return null;
  
  try {
    // Find JSON object boundaries more safely
    const jsonStart = response.indexOf('{');
    const jsonEnd = response.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1 || jsonStart >= jsonEnd) {
      return null;
    }
    
    const jsonStr = response.substring(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonStr) as unknown;
    
    // Validate the structure more thoroughly
    if (
      typeof parsed === 'object' && 
      parsed !== null && 
      'op' in parsed &&
      typeof parsed.op === 'string' &&
      ['sum', 'avg', 'min', 'max', 'count', 'filter-eq'].includes(parsed.op)
    ) {
      const plan = parsed as Record<string, unknown>;
      
      // Validate required fields based on operation type
      if (plan.op === 'count') {
        return { op: 'count' };
      }
      
      if (plan.op === 'filter-eq') {
        if (
          'column' in plan && 
          typeof plan.column === 'string' &&
          'where' in plan &&
          typeof plan.where === 'object' &&
          plan.where !== null &&
          'column' in plan.where &&
          'eq' in plan.where
        ) {
          const where = plan.where as Record<string, unknown>;
          if (typeof where.column === 'string') {
            return {
              op: 'filter-eq',
              column: plan.column,
              where: { column: where.column, eq: where.eq as string | number | boolean }
            };
          }
        }
      } else if ('column' in plan && typeof plan.column === 'string') {
        return {
          op: plan.op as 'sum' | 'avg' | 'min' | 'max',
          column: plan.column
        };
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_error) {
    // Log parsing errors for debugging but don't expose them
    // Could add logging here if needed
  }
  
  return null;
}

export async function adviseOperation(taskText: string, table: Table | null): Promise<OperationPlan | null> {
  const prompt = buildPrompt(taskText, table);
  const response = await callGemini(prompt, 5000);
  return parseResponse(response);
}
