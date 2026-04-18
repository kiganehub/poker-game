export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = {
  ok: false;
  reason: "invalid-action" | "illegal-bet" | "not-your-turn" | "server-error" | "not-found" | "forbidden";
  message: string;
};
export type ApiResponse<T> = ApiOk<T> | ApiErr;

export function ok<T>(data: T): ApiOk<T> {
  return { ok: true, data };
}

export function err(reason: ApiErr["reason"], message: string): ApiErr {
  return { ok: false, reason, message };
}
