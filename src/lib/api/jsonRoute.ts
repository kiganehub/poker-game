import { NextResponse } from "next/server";
import { err, type ApiResponse } from "./response";

type Handler<TCtx> = (req: Request, ctx: TCtx) => Promise<{ status?: number; body: ApiResponse<unknown> }>;

/**
 * Wrap an App Router handler so any thrown error becomes a structured JSON
 * response instead of an empty 500 body. Without this, the client sees
 * "Unexpected end of JSON input" when Prisma / DB calls throw.
 */
export function jsonRoute<TCtx>(handler: Handler<TCtx>) {
  return async (req: Request, ctx: TCtx) => {
    try {
      const { status, body } = await handler(req, ctx);
      return NextResponse.json(body, { status: status ?? 200 });
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown error";
      // Surface the underlying message so users can debug missing DB / migration issues.
      // eslint-disable-next-line no-console
      console.error("[jsonRoute] handler threw:", e);
      return NextResponse.json(err("server-error", message), { status: 500 });
    }
  };
}
