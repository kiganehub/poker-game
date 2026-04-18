import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { generateInviteCode, resolveGuestUser } from "@/lib/auth/session";
import { err, ok } from "@/lib/api/response";
import { jsonRoute } from "@/lib/api/jsonRoute";
import {
  DEFAULT_BIG_BLIND,
  DEFAULT_INITIAL_STACK,
  DEFAULT_SMALL_BLIND,
} from "@/constants/gameConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  hostGuestId: z.string().min(1),
  hostDisplayName: z.string().min(1).optional(),
  name: z.string().min(1).max(60),
  maxPlayers: z.union([z.literal(6), z.literal(9)]),
  smallBlind: z.number().int().positive().optional(),
  bigBlind: z.number().int().positive().optional(),
  initialStack: z.number().int().positive().optional(),
});

export const POST = jsonRoute(async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return { status: 400, body: err("invalid-action", parsed.error.message) };
  }
  const b = parsed.data;
  const host = await resolveGuestUser(b.hostGuestId, b.hostDisplayName);
  const room = await prisma.room.create({
    data: {
      name: b.name,
      hostUserId: host.id,
      inviteCode: generateInviteCode(),
      smallBlind: b.smallBlind ?? DEFAULT_SMALL_BLIND,
      bigBlind: b.bigBlind ?? DEFAULT_BIG_BLIND,
      initialStack: b.initialStack ?? DEFAULT_INITIAL_STACK,
      maxPlayers: b.maxPlayers,
    },
  });
  await prisma.seat.createMany({
    data: Array.from({ length: b.maxPlayers }, (_, i) => ({
      roomId: room.id,
      seatNumber: i,
      stack: room.initialStack,
    })),
  });
  return {
    body: ok({
      roomId: room.id,
      inviteCode: room.inviteCode,
      hostUserId: host.id,
    }),
  };
});
