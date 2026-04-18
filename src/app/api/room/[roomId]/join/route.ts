import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { err, ok } from "@/lib/api/response";
import { resolveGuestUser } from "@/lib/auth/session";

const Body = z.object({
  guestId: z.string().min(1),
  displayName: z.string().min(1).optional(),
  seatNumber: z.number().int().min(0).optional(),
});

export async function POST(req: Request, { params }: { params: { roomId: string } }) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(err("invalid-action", parsed.error.message), { status: 400 });
  }
  const { guestId, displayName, seatNumber } = parsed.data;
  const room = await prisma.room.findUnique({ where: { id: params.roomId } });
  if (!room) return NextResponse.json(err("not-found", "room not found"), { status: 404 });
  const user = await resolveGuestUser(guestId, displayName);

  // Upsert membership.
  const member = await prisma.roomMember.upsert({
    where: { userId_roomId: { userId: user.id, roomId: room.id } },
    update: { disconnectedAt: null },
    create: { userId: user.id, roomId: room.id },
  });

  // Pick seat. If not specified, grab first empty one.
  let seat = null as Awaited<ReturnType<typeof prisma.seat.findFirst>>;
  if (seatNumber != null) {
    seat = await prisma.seat.findFirst({
      where: { roomId: room.id, seatNumber },
    });
    if (!seat) return NextResponse.json(err("not-found", "seat not found"), { status: 404 });
    if (seat.userId && seat.userId !== user.id) {
      return NextResponse.json(err("forbidden", "seat taken"), { status: 409 });
    }
  } else {
    seat = await prisma.seat.findFirst({
      where: { roomId: room.id, userId: null },
      orderBy: { seatNumber: "asc" },
    });
    if (!seat) return NextResponse.json(err("forbidden", "room full"), { status: 409 });
  }
  await prisma.seat.update({
    where: { id: seat.id },
    data: { userId: user.id, roomMemberId: member.id, stack: room.initialStack },
  });

  return NextResponse.json(
    ok({
      userId: user.id,
      displayName: user.displayName,
      seatNumber: seat.seatNumber,
      roomId: room.id,
    }),
  );
}
