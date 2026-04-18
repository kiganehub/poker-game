import { GameState } from "./GameState";
import type { ActionEvent } from "@/lib/types/game";
import type { ActionName } from "@/constants/gameConfig";
import { prisma } from "@/lib/db/client";
import { dealerRotate } from "./positions";

/**
 * In-memory room orchestrator.
 *
 * Holds the active GameState per room between HTTP calls. In production this
 * would live on a single-writer process (or be persisted per-event to Redis).
 * For the MVP we rely on Node module singleton semantics — acceptable because
 * one Next.js process handles the room.
 */
class RoomOrchestratorStore {
  private byRoom = new Map<string, GameState>();
  private lastDealer = new Map<string, number>();
  private handNumber = new Map<string, number>();

  get(roomId: string): GameState | undefined {
    return this.byRoom.get(roomId);
  }

  set(roomId: string, gs: GameState): void {
    this.byRoom.set(roomId, gs);
  }

  clear(roomId: string): void {
    this.byRoom.delete(roomId);
  }

  nextDealer(roomId: string, seats: number[], fallback: number): number {
    const last = this.lastDealer.get(roomId);
    const next = last == null ? fallback : dealerRotate(seats, last);
    this.lastDealer.set(roomId, next);
    return next;
  }

  nextHandNumber(roomId: string): number {
    const n = (this.handNumber.get(roomId) ?? 0) + 1;
    this.handNumber.set(roomId, n);
    return n;
  }
}

export const orchestratorStore = new RoomOrchestratorStore();

export interface SeatInit {
  seat: number;
  userId: string;
  roomMemberId: string;
  displayName: string;
  stack: number;
}

export interface StartHandInput {
  roomId: string;
  seats: SeatInit[]; // seats that are sat down and ready
  smallBlind: number;
  bigBlind: number;
}

export async function startHand(input: StartHandInput): Promise<GameState> {
  const { roomId, seats, smallBlind, bigBlind } = input;
  const seatNumbers = seats.map((s) => s.seat);
  const dealerSeat = orchestratorStore.nextDealer(roomId, seatNumbers, seatNumbers[0]);
  const handNumber = orchestratorStore.nextHandNumber(roomId);

  const gs = GameState.startHand({
    handNumber,
    smallBlind,
    bigBlind,
    dealerSeat,
    seats: seats.map((s) => ({
      seat: s.seat,
      userId: s.userId,
      displayName: s.displayName,
      stack: s.stack,
    })),
  });
  orchestratorStore.set(roomId, gs);

  const hand = await prisma.hand.create({
    data: {
      roomId,
      handNumber,
      dealerSeat,
      smallBlindSeat: gs.state.smallBlindSeat,
      bigBlindSeat: gs.state.bigBlindSeat,
      street: "preflop",
      status: "active",
      potTotal: gs.potTotal(),
      holeCards: Object.fromEntries(
        [...gs.state.players.values()].map((p) => [p.seat, p.holeCards ?? []]),
      ),
      communityCards: [],
      players: {
        create: seats.map((s) => ({
          userId: s.userId,
          roomMemberId: s.roomMemberId,
          seatNumber: s.seat,
          holeCards: gs.state.players.get(s.seat)?.holeCards?.join(" ") ?? null,
          invested: gs.state.players.get(s.seat)?.invested ?? 0,
          currentBet: gs.state.players.get(s.seat)?.currentBet ?? 0,
          status: gs.state.players.get(s.seat)?.status ?? "active",
        })),
      },
    },
    include: { players: true },
  });

  // Persist blind events.
  const blindEvents = gs.state.actionLog.filter((e) => e.action === "post-blind");
  for (const e of blindEvents) {
    const hp = hand.players.find((p) => p.seatNumber === e.seat);
    if (!hp) continue;
    await prisma.actionLog.create({
      data: actionLogData(hand.id, hp.id, e),
    });
  }

  return gs;
}

export async function applyAndPersist(
  roomId: string,
  handId: string,
  seat: number,
  action: ActionName,
  amount: number,
): Promise<ActionEvent> {
  const gs = orchestratorStore.get(roomId);
  if (!gs) throw new Error("no active hand");
  const event = gs.applyAction(seat, action, amount);
  const hp = await prisma.handPlayer.findFirst({
    where: { handId, seatNumber: seat },
  });
  if (hp) {
    await prisma.actionLog.create({ data: actionLogData(handId, hp.id, event) });
  }
  return event;
}

function actionLogData(handId: string, handPlayerId: string, e: ActionEvent) {
  return {
    handId,
    handPlayerId,
    userId: e.userId,
    seatNumber: e.seat,
    position: e.position,
    street: e.street,
    action: e.action,
    amount: e.amount,
    potSizeBefore: e.potSizeBefore,
    toCall: e.toCall,
    stackBefore: e.stackBefore,
    stackAfter: e.stackAfter,
    isVoluntary: e.flags.isVoluntary,
    isOpenRaise: e.flags.isOpenRaise,
    isThreeBet: e.flags.isThreeBet,
    isFourBetPlus: e.flags.isFourBetPlus,
    isCBet: e.flags.isCBet,
    isCBetOppFaced: e.flags.isCBetOppFaced,
    isCheckRaise: e.flags.isCheckRaise,
    isFoldTo3Bet: e.flags.isFoldTo3Bet,
    isFoldToCBet: e.flags.isFoldToCBet,
    isStealAttempt: e.flags.isStealAttempt,
    isFoldBBSteal: e.flags.isFoldBBSteal,
  };
}
