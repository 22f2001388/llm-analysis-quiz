import { callGemini } from "@/adapters/llm/gemini.js";
import { logger } from "@/adapters/telemetry/logger.js";
import type { StructuredResource } from "@/core/data/data-converter.js";
import type { SolutionPlan } from "@/core/solve/planner.js";
import type { OperationPlan, SolveResult } from "@/types/solve.js";

const MODEL_CASCADE = {
  simple: ['gemini-2.5-flash-lite', 'gemini-2.5-flash'],
  medium: ['gemini-2.5-flash', 'gemma-3-27b-it', 'gemini-2.5-pro'],
  hard: ['gemini-2.5-pro']
};

function buildSolvePrompt(taskText: string, plan: SolutionPlan, resources: StructuredResource[]): string {
  let prompt = `Solve this quiz task.

Task: "${taskText}"

Strategy: ${plan.strategy}
Steps: ${plan.steps.join(' → ')}

`;

  for (const resource of resources) {
    prompt += `Resource: ${resource.name}\n`;
    prompt += `Headers: ${resource.headers.join(', ')}\n`;

    if (resource.rows.length > 0) {
      if (resource.rows.length <= 100) {
        prompt += `Data: ${JSON.stringify(resource.rows)}\n\n`;
      } else {
        prompt += `Sample (first 5): ${JSON.stringify(resource.rows.slice(0, 5))}\n`;
        prompt += `Total rows: ${resource.rowCount}\n\n`;
      }
    } else if (resource.rawContent) {
      prompt += `Raw content:\n${resource.rawContent}\n\n`;
    }
  }

  prompt += `Instructions:
1. If this is an ENTRY/LANDING page (mentions "Start by POSTing", "begin", etc.), answer: true
2. Otherwise, analyze the data and compute the answer following the strategy.
3. For data normalization tasks, return the JSON array as a STRING (escaped JSON).
4. Return ONLY: {"op": "direct-answer", "answer": YOUR_COMPUTED_ANSWER}

Respond with JSON only.`;
  return prompt;
}

function parseResponse(response: string | null): OperationPlan | null {
  if (!response || typeof response !== 'string') return null;

  try {
    const jsonStart = response.indexOf('{');
    const jsonEnd = response.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonStart >= jsonEnd) return null;

    const jsonStr = response.substring(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonStr) as unknown;

    if (typeof parsed === 'object' && parsed !== null && 'op' in parsed) {
      const plan = parsed as Record<string, unknown>;
      if (plan.op === 'direct-answer' && 'answer' in plan) {
        return { op: 'direct-answer', answer: plan.answer };
      }
    }
  } catch (error) {
    logger.error({ event: 'solve:parse_error', error }, 'Failed to parse solve response');
  }

  return null;
}

export async function solveProblem(
  taskText: string,
  plan: SolutionPlan,
  resources: StructuredResource[]
): Promise<SolveResult | null> {
  const prompt = buildSolvePrompt(taskText, plan, resources);
  const models = MODEL_CASCADE[plan.complexity] || MODEL_CASCADE.medium;

  for (const model of models) {
    logger.debug({ event: 'solve:trying', model, complexity: plan.complexity }, 'Trying model');

    try {
      const response = await callGemini(prompt, { timeoutMs: 20000, model });
      const result = parseResponse(response);

      if (result && result.answer !== undefined) {
        logger.info({ event: 'solve:success', model }, 'Solved with model');
        return toSolveResult(result.answer);
      }
    } catch (error) {
      logger.warn({ event: 'solve:model_failed', model, error }, 'Model failed, trying next');
    }
  }

  logger.error({ event: 'solve:all_failed' }, 'All models failed');
  return null;
}

function toSolveResult(answer: unknown): SolveResult {
  if (typeof answer === 'number') return { kind: 'number', value: answer };
  if (typeof answer === 'string') return { kind: 'string', value: answer };
  if (typeof answer === 'boolean') return { kind: 'boolean', value: answer };
  return { kind: 'object', value: answer };
}

export async function adviseOperation(taskText: string, resources: StructuredResource[]): Promise<SolveResult | null> {
  const defaultPlan: SolutionPlan = {
    complexity: 'simple',
    strategy: 'Analyze and answer directly',
    steps: ['Analyze', 'Answer'],
    requiredResources: resources.map(r => r.name)
  };
  return solveProblem(taskText, defaultPlan, resources);
}
