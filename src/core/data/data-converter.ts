import { callGemini } from "@/adapters/llm/gemini.js";
import { logger } from "@/adapters/telemetry/logger.js";

export type StructuredResource = {
  name: string;
  headers: string[];
  rows: unknown[][];
  rowCount: number;
  rawContent?: string;
  metadata: {
    sourceUrl: string;
    contentType: string;
  };
};

function buildConversionPrompt(name: string, content: string): string {
  return `Convert this data file to structured JSON format.

File name: ${name}
Content (first 10000 chars):
"""
${content.substring(0, 10000)}
"""

Return JSON with:
- headers: Array of column names (strings)
- rows: Array of arrays, each inner array is a row of values
- rowCount: Total number of data rows

Rules:
1. Detect if this is CSV, TSV, JSON, or other tabular format
2. Parse and extract the data into a consistent table format
3. Coerce numeric strings to numbers where appropriate
4. Handle missing values as null

Example response:
{"headers": ["name", "age", "score"], "rows": [["Alice", 25, 85], ["Bob", 30, 90]], "rowCount": 2}

Respond with JSON only.`;
}

function parseConversionResponse(response: string | null): { headers: string[]; rows: unknown[][]; rowCount: number } | null {
  if (!response) return null;

  try {
    const jsonStart = response.indexOf('{');
    const jsonEnd = response.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) return null;

    const jsonStr = response.substring(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonStr);

    if (Array.isArray(parsed.headers) && Array.isArray(parsed.rows)) {
      return {
        headers: parsed.headers,
        rows: parsed.rows,
        rowCount: typeof parsed.rowCount === 'number' ? parsed.rowCount : parsed.rows.length
      };
    }
  } catch (error) {
    logger.error({ event: 'data_convert:json_error', error }, 'Failed to parse conversion response');
  }

  return null;
}

export async function convertResourceToJson(
  name: string,
  content: string,
  sourceUrl: string,
  contentType: string
): Promise<StructuredResource> {
  const prompt = buildConversionPrompt(name, content);

  try {
    const response = await callGemini(prompt, { timeoutMs: 15000, model: 'gemini-2.5-flash-lite' });
    const parsed = parseConversionResponse(response);

    if (parsed) {
      return {
        name,
        headers: parsed.headers,
        rows: parsed.rows,
        rowCount: parsed.rowCount,
        metadata: { sourceUrl, contentType }
      };
    }
  } catch (error) {
    logger.warn({ event: 'data_convert:llm_error', name, error }, 'LLM conversion failed');
  }

  logger.warn({ event: 'data_convert:fallback', name }, 'Using raw content fallback');
  return {
    name,
    headers: [],
    rows: [],
    rowCount: 0,
    rawContent: content.substring(0, 15000),
    metadata: { sourceUrl, contentType }
  };
}

