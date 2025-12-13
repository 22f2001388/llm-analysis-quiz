import { callGemini } from "@/adapters/llm/gemini.js";
import { logger } from "@/adapters/telemetry/logger.js";
import type { StructuredResource } from "@/core/data/data-converter.js";

export type SolutionPlan = {
  complexity: 'simple' | 'medium' | 'hard';
  strategy: string;
  steps: string[];
  requiredResources: string[];
};

function buildPlanPrompt(taskText: string, resourceNames: string[], resourceHeaders: Record<string, string[]>): string {
  let prompt = `Analyze this quiz task and create a solution plan.

Task: "${taskText}"

Available resources:
${resourceNames.map(name => `- ${name}: columns [${(resourceHeaders[name] || []).join(', ')}]`).join('\n')}

Return JSON with:
- complexity: "simple" (basic lookup/arithmetic), "medium" (filtering/aggregation), or "hard" (multi-step analysis/ML)
- strategy: Brief description of how to solve
- steps: Array of steps to execute
- requiredResources: Which resources are needed

Example:
{"complexity": "simple", "strategy": "Sum the values column", "steps": ["Load data", "Sum column X"], "requiredResources": ["data.csv"]}

Respond with JSON only.`;
  return prompt;
}

function parsePlanResponse(response: string | null): SolutionPlan | null {
  if (!response) return null;

  try {
    const jsonStart = response.indexOf('{');
    const jsonEnd = response.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) return null;

    const jsonStr = response.substring(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonStr);

    if (parsed.complexity && parsed.strategy) {
      return {
        complexity: parsed.complexity || 'medium',
        strategy: parsed.strategy,
        steps: Array.isArray(parsed.steps) ? parsed.steps : [],
        requiredResources: Array.isArray(parsed.requiredResources) ? parsed.requiredResources : []
      };
    }
  } catch (error) {
    logger.error({ event: 'planner:json_error', error }, 'Failed to parse plan response');
  }

  return null;
}

export async function planSolution(
  taskText: string,
  resources: StructuredResource[]
): Promise<SolutionPlan> {
  const resourceNames = resources.map(r => r.name);
  const resourceHeaders: Record<string, string[]> = {};
  resources.forEach(r => { resourceHeaders[r.name] = r.headers; });

  const prompt = buildPlanPrompt(taskText, resourceNames, resourceHeaders);
  const response = await callGemini(prompt, { timeoutMs: 15000, model: 'gemini-2.5-flash-lite' });
  const plan = parsePlanResponse(response);

  if (!plan) {
    logger.warn({ event: 'planner:fallback' }, 'Using default plan');
    return {
      complexity: 'medium',
      strategy: 'Analyze data and compute answer',
      steps: ['Load resources', 'Analyze task', 'Compute answer'],
      requiredResources: resourceNames
    };
  }

  logger.info({ event: 'planner:success', complexity: plan.complexity }, 'Solution planned');
  return plan;
}
