export type SolveRequest = {
  email: string;
  secret: string;
  url: string;
};

export type OkResponse = {
  status: "accepted";
};

export type ErrorResponse = {
  error: "Bad Request" | "Forbidden";
};
