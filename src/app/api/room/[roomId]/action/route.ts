import { z } from "zod";
import { err, ok } from "@/lib/api/response";
import { jsonRoute } from "@/lib/api/jsonRoute";
import { applyAndPersist, orchestratorStore } from "@/lib/game/orchestrator";
import { prisma } from "@/lib/db/client";
import { ACTIONS } from "@/constants/gameConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  userId: z.string().min(1),
  seatNumber: z.number().int().min(0),
  action: z.enum(ACTIONS),
  amount: z.number().int().nonnegative().optional(),
});

export const POST = jsonRoute(async (req: Request, { params }: { params: { roomId: string } }) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return { status: 400, body: err("invalid-action", parsed.error.message) };
  }
  const { userId, seatNumber, action, amount } = parsed.data;
  const gs = orchestratorStore.get(params.roomId);
  if (!gs) return { status: 400, body: err("invalid-action", "no active hand") };
  const player = gs.state.players.get(seatNumber);
  if (!player || player.userId !== userId) {
    return { status: 403, body: err("forbidden", "seat / user mismatch") };
  }
  if (gs.state.currentActor !== seatNumber) {
    return { status: 409, body: err("not-your-turn", "not your turn") };
  }

  const activeHand = await prisma.hand.findFirst({
    where: { roomId: params.roomId, status: "active" },
    orderBy: { createdAt: "desc" },
  });
  if (!activeHand) {
    return { status: 500, body: err("server-error", "hand row missing") };
  }

  try {
    const event = await applyAndPersist(
      params.roomId,
      activeHand.id,
      seatNumber,
      action,
      amount ?? 0,
    );
    while (gs.needsStreetAdvance()) {
      const advanced = gs.autoAdvanceStreet();
      if (!advanced || advanced === "showdown") break;
    }
    return {
      body: ok({
        event,
        street: gs.state.street,
        currentActor: gs.state.currentActor,
        potTotal: gs.potTotal(),
        communityCards: gs.state.communityCards,
      }),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return { status: 400, body: err("illegal-bet", message) };
  }
});
