import type { QuizTask, AnswerTypeHint } from "@/types/quiz.js";
import { extractSubmitUrl, extractResourceUrls } from "@/core/parsing/url-extractor.js";

export function normalizeTask(text: string): string {
  const t = text.replace(/^\s*Q\d+\.\s*/i, "").trim();
  return t;
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

export function parseQuiz(text: string, pageUrl: string): QuizTask {
  const taskText = normalizeTask(text);
  const submitUrl = extractSubmitUrl(text);
  const resources = extractResourceUrls(text, pageUrl);
  const answerTypeHint = detectAnswerType(text);
  return { taskText, submitUrl, resources, answerTypeHint };
}
