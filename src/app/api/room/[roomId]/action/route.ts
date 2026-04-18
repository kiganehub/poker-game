import { NextResponse } from "next/server";
import { z } from "zod";
import { err, ok } from "@/lib/api/response";
import { applyAndPersist, orchestratorStore } from "@/lib/game/orchestrator";
import { prisma } from "@/lib/db/client";
import { ACTIONS } from "@/constants/gameConfig";

const Body = z.object({
  userId: z.string().min(1),
  seatNumber: z.number().int().min(0),
  action: z.enum(ACTIONS),
  amount: z.number().int().nonnegative().optional(),
});

export async function POST(req: Request, { params }: { params: { roomId: string } }) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(err("invalid-action", parsed.error.message), { status: 400 });
  }
  const { userId, seatNumber, action, amount } = parsed.data;
  const gs = orchestratorStore.get(params.roomId);
  if (!gs) return NextResponse.json(err("invalid-action", "no active hand"), { status: 400 });
  const player = gs.state.players.get(seatNumber);
  if (!player || player.userId !== userId) {
    return NextResponse.json(err("forbidden", "seat / user mismatch"), { status: 403 });
  }
  if (gs.state.currentActor !== seatNumber) {
    return NextResponse.json(err("not-your-turn", "not your turn"), { status: 409 });
  }

  const activeHand = await prisma.hand.findFirst({
    where: { roomId: params.roomId, status: "active" },
    orderBy: { createdAt: "desc" },
  });
  if (!activeHand) {
    return NextResponse.json(err("server-error", "hand row missing"), { status: 500 });
  }

  try {
    const event = await applyAndPersist(
      params.roomId,
      activeHand.id,
      seatNumber,
      action,
      amount ?? 0,
    );
    // Auto-advance street(s) if betting round closed.
    while (gs.needsStreetAdvance()) {
      const advanced = gs.autoAdvanceStreet();
      if (!advanced) break;
      if (advanced === "showdown") break;
    }
    return NextResponse.json(
      ok({
        event,
        street: gs.state.street,
        currentActor: gs.state.currentActor,
        potTotal: gs.potTotal(),
        communityCards: gs.state.communityCards,
      }),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(err("illegal-bet", message), { status: 400 });
  }
}
