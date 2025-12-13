

export type OpKind = "direct-answer";

export type OperationPlan = {
  op: OpKind;
  answer?: string | number | boolean | unknown;
};




export type SolveResult =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "object"; value: unknown };
