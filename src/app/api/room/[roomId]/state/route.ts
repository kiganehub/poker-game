import { prisma } from "@/lib/db/client";
import { err, ok } from "@/lib/api/response";
import { jsonRoute } from "@/lib/api/jsonRoute";
import { orchestratorStore } from "@/lib/game/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = jsonRoute(async (req: Request, { params }: { params: { roomId: string } }) => {
  const url = new URL(req.url);
  const viewerUserId = url.searchParams.get("userId");

  const room = await prisma.room.findUnique({
    where: { id: params.roomId },
    include: {
      seats: {
        orderBy: { seatNumber: "asc" },
        include: { roomMember: { include: { user: true } } },
      },
    },
  });
  if (!room) return { status: 404, body: err("not-found", "room not found") };

  const gs = orchestratorStore.get(room.id);
  return {
    body: ok({
      room: {
        id: room.id,
        name: room.name,
        maxPlayers: room.maxPlayers,
        smallBlind: room.smallBlind,
        bigBlind: room.bigBlind,
        inviteCode: room.inviteCode,
        hostUserId: room.hostUserId,
      },
      seats: room.seats.map((s) => ({
        seatNumber: s.seatNumber,
        userId: s.userId,
        displayName: s.roomMember?.user.displayName ?? null,
        stack: s.stack,
      })),
      hand: gs
        ? {
            handNumber: gs.state.handNumber,
            street: gs.state.street,
            currentActor: gs.state.currentActor,
            potTotal: gs.potTotal(),
            communityCards: gs.state.communityCards,
            currentBet: gs.state.currentBet,
            players: [...gs.state.players.values()].map((p) => ({
              seat: p.seat,
              userId: p.userId,
              stack: p.stack,
              currentBet: p.currentBet,
              invested: p.invested,
              status: p.status,
              holeCards:
                viewerUserId && p.userId === viewerUserId ? p.holeCards : null,
            })),
            actionLog: gs.state.actionLog.slice(-10),
          }
        : null,
    }),
  };
});
