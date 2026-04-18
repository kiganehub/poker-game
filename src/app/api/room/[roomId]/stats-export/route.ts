import { prisma } from "@/lib/db/client";
import { computeStats, type HudActionLog } from "@/lib/hud/calculator";
import { deriveHandOutcome } from "@/lib/hud/handOutcome";
import { toCSV, type ExportRow } from "@/lib/hud/exporter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { roomId: string } }) {
  try {
    const room = await prisma.room.findUnique({
      where: { id: params.roomId },
      include: { members: { include: { user: true } } },
    });
    if (!room) return new Response("room not found", { status: 404 });

    const hands = await prisma.hand.findMany({
      where: { roomId: room.id, status: "finished" },
      include: { players: true, actionLog: true },
      orderBy: { handNumber: "asc" },
    });

    const allActions: HudActionLog[] = hands.flatMap((h) =>
      h.actionLog.map((a) => ({
        handId: a.handId,
        userId: a.userId,
        seatNumber: a.seatNumber,
        position: a.position,
        street: a.street,
        action: a.action,
        amount: a.amount,
        isVoluntary: a.isVoluntary,
        isOpenRaise: a.isOpenRaise,
        isThreeBet: a.isThreeBet,
        isFourBetPlus: a.isFourBetPlus,
        isCBet: a.isCBet,
        isCheckRaise: a.isCheckRaise,
        isFoldTo3Bet: a.isFoldTo3Bet,
        isFoldToCBet: a.isFoldToCBet,
        isStealAttempt: a.isStealAttempt,
        isFoldBBSteal: a.isFoldBBSteal,
      })),
    );

    const outcomes = hands.map((h) => {
      const wentToShowdown = h.players.filter((p) => p.status !== "folded").map((p) => p.userId);
      const winners = h.players.filter((p) => p.result === "win").map((p) => p.userId);
      return deriveHandOutcome({
        handId: h.id,
        actions: allActions.filter((a) => a.handId === h.id),
        participantUserIds: h.players.map((p) => p.userId),
        wentToShowdownUserIds: wentToShowdown,
        showdownWinnerUserIds: winners,
      });
    });

    const rows: ExportRow[] = room.members.map((m) => ({
      userId: m.userId,
      displayName: m.user.displayName,
      stats: computeStats(m.userId, allActions, outcomes),
    }));

    const csv = toCSV(rows);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="poker-stats-${room.id}.csv"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    // eslint-disable-next-line no-console
    console.error("[stats-export] failed:", e);
    return new Response(`error: ${message}`, { status: 500 });
  }
}
