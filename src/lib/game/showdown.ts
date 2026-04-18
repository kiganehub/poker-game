import { compareRank, evaluateHand, type HandRank } from "./handEvaluator";
import type { Card, HandState, PlayerState, SidePot } from "@/lib/types/game";
import { buildPots, contributionsFromPlayers } from "./potCalculator";

export interface PotAward {
  seat: number;
  amount: number;
}

export interface ShowdownResult {
  pots: SidePot[];
  awards: PotAward[]; // per-seat total winnings
  ranks: Map<number, HandRank>; // per-seat best 5-card rank (only non-folded seats)
}

/**
 * Distribute all pots among eligible non-folded players based on best 5-card hand.
 *
 * - Ties within a pot split evenly; odd remainder chips go to the first eligible
 *   seat clockwise from the dealer (standard rule) to keep it deterministic.
 */
export function resolveShowdown(state: HandState): ShowdownResult {
  const pots = buildPots(contributionsFromPlayers(state.players));
  const awards = new Map<number, number>();
  const ranks = new Map<number, HandRank>();

  // Precompute hand ranks for anyone not folded.
  for (const p of state.players.values()) {
    if (p.status === "folded" || !p.holeCards) continue;
    const all: Card[] = [...p.holeCards, ...state.communityCards];
    if (all.length < 5) continue;
    ranks.set(p.seat, evaluateHand(all));
  }

  for (const pot of pots) {
    const contenders = pot.eligibleSeats.filter((s) => ranks.has(s));
    if (contenders.length === 0) {
      // No one eligible — return chips to the highest non-folded contributor (rare edge).
      // Practical fallback: award to first eligibleSeat if present.
      if (pot.eligibleSeats.length > 0) {
        const s = pot.eligibleSeats[0];
        awards.set(s, (awards.get(s) ?? 0) + pot.amount);
      }
      continue;
    }

    let best: HandRank | null = null;
    const winners: number[] = [];
    for (const s of contenders) {
      const r = ranks.get(s)!;
      if (!best) {
        best = r;
        winners.push(s);
        continue;
      }
      const cmp = compareRank(r, best);
      if (cmp > 0) {
        best = r;
        winners.length = 0;
        winners.push(s);
      } else if (cmp === 0) {
        winners.push(s);
      }
    }

    const share = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount - share * winners.length;
    const ordered = winners.slice().sort((a, b) => distanceFromDealer(a, b, state));
    for (const w of ordered) awards.set(w, (awards.get(w) ?? 0) + share);
    // Odd chips to first winner after dealer.
    if (remainder > 0 && ordered.length > 0) {
      awards.set(ordered[0], (awards.get(ordered[0]) ?? 0) + remainder);
    }
  }

  return {
    pots,
    awards: [...awards.entries()].map(([seat, amount]) => ({ seat, amount })),
    ranks,
  };
}

function distanceFromDealer(a: number, b: number, state: HandState): number {
  const seats = [...state.players.keys()].sort((x, y) => x - y);
  const n = seats.length;
  const start = seats.indexOf(state.dealerSeat);
  const order = [...seats.slice(start + 1), ...seats.slice(0, start + 1)];
  const ai = order.indexOf(a);
  const bi = order.indexOf(b);
  return (ai === -1 ? n : ai) - (bi === -1 ? n : bi);
}

/**
 * Short-circuit: if only one non-folded player remains, they get everything.
 */
export function resolveByFold(state: HandState): ShowdownResult {
  const pots = buildPots(contributionsFromPlayers(state.players));
  const remaining = [...state.players.values()].filter((p) => p.status !== "folded");
  const awards: PotAward[] = [];
  if (remaining.length === 1) {
    const total = pots.reduce((acc, p) => acc + p.amount, 0);
    awards.push({ seat: remaining[0].seat, amount: total });
  }
  return { pots, awards, ranks: new Map() };
}

export function applyAwards(players: Map<number, PlayerState>, awards: PotAward[]): void {
  for (const a of awards) {
    const p = players.get(a.seat);
    if (p) p.stack += a.amount;
  }
}
