export enum ErrorCode {
  INPUT_400 = 'INPUT_400',
  AUTH_403 = 'AUTH_403',
  RENDER_TIMEOUT = 'RENDER_TIMEOUT',
  RENDER_NO_SELECTOR = 'RENDER_NO_SELECTOR',
  RENDER_EMPTY_RESULT = 'RENDER_EMPTY_RESULT',
  PARSER_NO_URL = 'PARSER_NO_URL',
  FETCH_FAIL = 'FETCH_FAIL',
  FORMAT_INVALID = 'FORMAT_INVALID',
  SUBMIT_FAIL = 'SUBMIT_FAIL',
  LLM_TIMEOUT = 'LLM_TIMEOUT',
  LLM_INVALID_RESPONSE = 'LLM_INVALID_RESPONSE',
  TIME_BUDGET_EXCEEDED = 'TIME_BUDGET_EXCEEDED',
  UNEXPECTED_500 = 'UNEXPECTED_500',
}

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.INPUT_400]: 400,
  [ErrorCode.AUTH_403]: 403,
  [ErrorCode.RENDER_TIMEOUT]: 504,
  [ErrorCode.RENDER_NO_SELECTOR]: 500,
  [ErrorCode.RENDER_EMPTY_RESULT]: 422,
  [ErrorCode.PARSER_NO_URL]: 422,
  [ErrorCode.FETCH_FAIL]: 502,
  [ErrorCode.FORMAT_INVALID]: 422,
  [ErrorCode.SUBMIT_FAIL]: 502,
  [ErrorCode.LLM_TIMEOUT]: 504,
  [ErrorCode.LLM_INVALID_RESPONSE]: 500,
  [ErrorCode.TIME_BUDGET_EXCEEDED]: 408,
  [ErrorCode.UNEXPECTED_500]: 500,
};

export class DomainError<T> extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details?: T;

  constructor(
    code: ErrorCode,
    message?: string,
    details?: T,
    status?: number
  ) {
    super(message ?? code);
    this.code = code;
    this.status = status ?? DEFAULT_STATUS[code] ?? 500;
    this.details = details;
  }
}

export function makeError<T>(
  code: ErrorCode,
  message?: string,
  details?: T,
  status?: number
): DomainError<T> {
  return new DomainError(code, message, details, status);
}

export function isDomainError(e: unknown): e is DomainError<unknown> {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    'status' in e
  );
}
