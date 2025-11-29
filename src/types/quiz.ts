export type ExtractionMeta = {
  url: string;
  title: string;
  selectorWaitMs: number;
  totalMs: number;
};

export type ExtractResult = {
  text: string;
  html: string;
  meta: ExtractionMeta;
};

export type AnswerTypeHint = "number" | "string" | "boolean" | "object" | "data-uri";

export type QuizTask = {
  taskText: string;
  submitUrl: string;
  resources: string[];
  answerTypeHint?: AnswerTypeHint;
};
