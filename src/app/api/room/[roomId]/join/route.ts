import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { err, ok } from "@/lib/api/response";
import { jsonRoute } from "@/lib/api/jsonRoute";
import { resolveGuestUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  guestId: z.string().min(1),
  displayName: z.string().min(1).optional(),
  seatNumber: z.number().int().min(0).optional(),
});

export const POST = jsonRoute(async (req: Request, { params }: { params: { roomId: string } }) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return { status: 400, body: err("invalid-action", parsed.error.message) };
  }
  const { guestId, displayName, seatNumber } = parsed.data;
  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return { status: 404, body: err("not-found", "room not found") };
  const user = await resolveGuestUser(guestId, displayName);

  const member = await prisma.roomMember.upsert({
    where: { userId_roomId: { userId: user.id, roomId: room.id } },
    update: { disconnectedAt: null },
    create: { userId: user.id, roomId: room.id },
  });

  let seat: Awaited<ReturnType<typeof prisma.seat.findFirst>> = null;
  if (seatNumber != null) {
    seat = await prisma.seat.findFirst({ where: { roomId: room.id, seatNumber } });
    if (!seat) return { status: 404, body: err("not-found", "seat not found") };
    if (seat.userId && seat.userId !== user.id) {
      return { status: 409, body: err("forbidden", "seat taken") };
    }
  } else {
    // Reuse existing seat if user is already seated.
    seat = await prisma.seat.findFirst({ where: { roomId: room.id, userId: user.id } });
    if (!seat) {
      seat = await prisma.seat.findFirst({
        where: { roomId: room.id, userId: null },
        orderBy: { seatNumber: "asc" },
      });
    }
    if (!seat) return { status: 409, body: err("forbidden", "room full") };
  }
  await prisma.seat.update({
    where: { id: seat.id },
    data: { userId: user.id, roomMemberId: member.id, stack: room.initialStack },
  });

  return {
    body: ok({
      userId: user.id,
      displayName: user.displayName,
      seatNumber: seat.seatNumber,
      roomId: room.id,
    }),
  };
});
