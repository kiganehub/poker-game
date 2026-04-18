import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { err, ok } from "@/lib/api/response";
import { startHand } from "@/lib/game/orchestrator";

const Body = z.object({ hostUserId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: { roomId: string } }) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(err("invalid-action", parsed.error.message), { status: 400 });
  }
  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json(err("not-found", "room not found"), { status: 404 });
  if (room.hostUserId !== parsed.data.hostUserId) {
    return NextResponse.json(err("forbidden", "only host can start hand"), { status: 403 });
  }

  const seats = await prisma.seat.findMany({
    where: { roomId: room.id, userId: { not: null }, isActive: true },
    include: { roomMember: { include: { user: true } } },
    orderBy: { seatNumber: "asc" },
  });
  if (seats.length < 2) {
    return NextResponse.json(err("invalid-action", "need >= 2 players"), { status: 400 });
  }

  const gs = await startHand({
    roomId: room.id,
    smallBlind: room.smallBlind,
    bigBlind: room.bigBlind,
    seats: seats.map((s) => ({
      seat: s.seatNumber,
      userId: s.userId!,
      displayName: s.roomMember?.user.displayName ?? "Player",
      stack: s.stack,
    })),
  });

  return NextResponse.json(
    ok({
      handNumber: gs.state.handNumber,
      dealerSeat: gs.state.dealerSeat,
      currentActor: gs.state.currentActor,
      potTotal: gs.potTotal(),
    }),
  );
}
