import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { err, ok } from "@/lib/api/response";
import { jsonRoute } from "@/lib/api/jsonRoute";
import { startHand } from "@/lib/game/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ hostUserId: z.string().min(1) });

export const POST = jsonRoute(async (req: Request, { params }: { params: { roomId: string } }) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return { status: 400, body: err("invalid-action", parsed.error.message) };
  }
  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return { status: 404, body: err("not-found", "room not found") };
  if (room.hostUserId !== parsed.data.hostUserId) {
    return { status: 403, body: err("forbidden", "only host can start hand") };
  }

  const seats = await prisma.seat.findMany({
    where: { roomId: room.id, userId: { not: null }, isActive: true },
    include: { roomMember: { include: { user: true } } },
    orderBy: { seatNumber: "asc" },
  });
  if (seats.length < 2) {
    return { status: 400, body: err("invalid-action", "need >= 2 players") };
  }
  const eligible = seats.filter((s) => s.roomMember && s.userId);
  if (eligible.length < 2) {
    return { status: 400, body: err("invalid-action", "need >= 2 seated members") };
  }

  const gs = await startHand({
    roomId: room.id,
    smallBlind: room.smallBlind,
    bigBlind: room.bigBlind,
    seats: eligible.map((s) => ({
      seat: s.seatNumber,
      userId: s.userId!,
      roomMemberId: s.roomMemberId!,
      displayName: s.roomMember!.user.displayName,
      stack: s.stack,
    })),
  });

  return {
    body: ok({
      handNumber: gs.state.handNumber,
      dealerSeat: gs.state.dealerSeat,
      currentActor: gs.state.currentActor,
      potTotal: gs.potTotal(),
    }),
  };
});
