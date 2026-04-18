import type { PlayerState, SidePot } from "@/lib/types/game";

export interface Contribution {
  seat: number;
  amount: number;
  folded: boolean;
}

/**
 * Builds layered pots from each player's total invested amount.
 *
 * Algorithm: sort contributions ascending, then for each distinct commitment
 * level, build a pot layer. Only non-folded seats are eligible to win a layer,
 * but folded chips still contribute to that layer's amount (that's the whole
 * point of a pot — folds leave chips behind).
 */
export function buildPots(contributions: Contribution[]): SidePot[] {
  const active = contributions.filter((c) => c.amount > 0);
  if (active.length === 0) return [];

  // Sort by amount asc. Ties get collapsed in the loop.
  const sorted = [...active].sort((a, b) => a.amount - b.amount);

  const pots: SidePot[] = [];
  let prevLevel = 0;
  let remaining = sorted.slice();

  while (remaining.length > 0) {
    const level = remaining[0].amount;
    const layerSize = level - prevLevel;
    if (layerSize > 0) {
      // Everyone (including folded who contributed to this layer) puts layerSize in.
      // Folded contributions are included in this loop because remaining still holds them.
      const amount = layerSize * remaining.length;
      // Eligible winners are the seats in `remaining` who have NOT folded.
      const eligible = remaining.filter((r) => !r.folded).map((r) => r.seat);
      // If no one is eligible (everyone at this level folded), merge into previous pot if it exists,
      // otherwise create the layer anyway (shouldn't happen in legal play).
      if (eligible.length === 0 && pots.length > 0) {
        pots[pots.length - 1].amount += amount;
      } else {
        pots.push({ amount, eligibleSeats: eligible });
      }
    }
    prevLevel = level;
    // Drop anyone whose total commitment matches this level.
    remaining = remaining.filter((r) => r.amount > level);
  }

  return pots;
}

/**
 * Convenience: build contributions from HandState player map.
 */
export function contributionsFromPlayers(players: Map<number, PlayerState>): Contribution[] {
  return [...players.values()].map((p) => ({
    seat: p.seat,
    amount: p.invested,
    folded: p.status === "folded",
  }));
}
