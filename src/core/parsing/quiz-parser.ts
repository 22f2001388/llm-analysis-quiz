import type { QuizTask, AnswerTypeHint } from "@/types/quiz.js";
import { callGemini } from "@/adapters/llm/gemini.js";
import { logger } from "@/adapters/telemetry/logger.js";

function buildParsePrompt(text: string, pageUrl: string): string {
  return `Extract quiz information from this page content:

"""
${text.substring(0, 8000)}
"""

Page URL: ${pageUrl}

Return JSON with:
- taskText: The quiz question/task (cleaned, without Q1. prefix or extra whitespace)
- submitUrl: The full URL where answers should be submitted (usually contains "submit" or is an API endpoint)
- resources: Array of URLs to data files (.csv, .json, .tsv, .pdf) found in the text

Rules:
1. For submitUrl, extract the COMPLETE URL including any query parameters
2. For resources, only include URLs that point to data files (csv, json, tsv, pdf)
3. Make relative URLs absolute using the page URL as base
4. If no submit URL found, set submitUrl to null
5. If no resources found, set resources to empty array []

Example: {"taskText": "Calculate the sum of values", "submitUrl": "https://api.example.com/submit", "resources": ["https://data.example.com/file.csv"]}

Respond with JSON only.`;
}

function parseParseResponse(response: string | null): { taskText: string; submitUrl: string | null; resources: string[] } | null {
  if (!response) return null;

  try {
    const jsonStart = response.indexOf('{');
    const jsonEnd = response.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) return null;

    const jsonStr = response.substring(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonStr);

    if (typeof parsed.taskText === 'string') {
      return {
        taskText: parsed.taskText,
        submitUrl: typeof parsed.submitUrl === 'string' ? parsed.submitUrl : null,
        resources: Array.isArray(parsed.resources) ? parsed.resources.filter((r: unknown) => typeof r === 'string') : []
      };
    }
  } catch (error) {
    logger.error({ event: 'quiz_parse:json_error', error }, 'Failed to parse LLM response');
  }

  return null;
}

export function detectAnswerType(text: string): AnswerTypeHint | undefined {
  const s = text.toLowerCase();
  if (/\bbase64\b/.test(s) || /data:image\//.test(s)) return "data-uri";
  if (/\bboolean\b/.test(s) || /\btrue\/false\b/.test(s)) return "boolean";
  if (/\bjson\b/.test(s) || /\bobject\b/.test(s)) return "object";
  if (/\bnumber\b/.test(s) || /\bsum\b/.test(s) || /\bcount\b/.test(s) || /\baverage\b/.test(s)) return "number";
  if (/\bstring\b/.test(s) || /\btext\b/.test(s)) return "string";
  return undefined;
}

export async function parseQuiz(text: string, pageUrl: string): Promise<QuizTask> {
  const prompt = buildParsePrompt(text, pageUrl);
  const response = await callGemini(prompt, { timeoutMs: 15000, model: 'gemma-3-27b-it' });
  const parsed = parseParseResponse(response);

  if (!parsed || !parsed.submitUrl) {
    throw new Error("PARSE_FAILED: Could not extract quiz information from page");
  }

  const answerTypeHint = detectAnswerType(text);

  return {
    taskText: parsed.taskText,
    submitUrl: parsed.submitUrl,
    resources: parsed.resources,
    answerTypeHint
  };
}
