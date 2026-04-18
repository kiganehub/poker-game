import type { Position } from "@/constants/gameConfig";

/**
 * Assign positions based on seat count and dealer seat.
 *
 * Seat numbers are NOT assumed to be 0..N-1; we iterate active seats ordered
 * ascending and wrap from the dealer. This keeps things robust if people sit
 * out in non-contiguous seats.
 *
 * 6-max order (clockwise from BTN): BTN, SB, BB, UTG, HJ, CO
 * 9-max order: BTN, SB, BB, UTG, UTG1, MP, MP1, HJ, CO
 * Short-handed (<6) falls back to 6-max labels truncated — HJ/CO may not exist.
 */
export function assignPositions(
  activeSeats: number[],
  dealerSeat: number,
): Map<number, Position> {
  const sorted = [...activeSeats].sort((a, b) => a - b);
  const start = sorted.indexOf(dealerSeat);
  if (start === -1) throw new Error("dealerSeat not in activeSeats");
  const ordered = [...sorted.slice(start), ...sorted.slice(0, start)];
  const n = ordered.length;

  // heads-up special case: BTN is SB, other is BB
  if (n === 2) {
    const m = new Map<number, Position>();
    m.set(ordered[0], "BTN"); // button is also SB in heads-up
    m.set(ordered[1], "BB");
    return m;
  }

  const labelsByCount: Record<number, Position[]> = {
    3: ["BTN", "SB", "BB"],
    4: ["BTN", "SB", "BB", "UTG"],
    5: ["BTN", "SB", "BB", "UTG", "CO"],
    6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
    7: ["BTN", "SB", "BB", "UTG", "MP", "HJ", "CO"],
    8: ["BTN", "SB", "BB", "UTG", "UTG1", "MP", "HJ", "CO"],
    9: ["BTN", "SB", "BB", "UTG", "UTG1", "MP", "MP1", "HJ", "CO"],
  };
  const labels = labelsByCount[n] ?? labelsByCount[9];
  const out = new Map<number, Position>();
  for (let i = 0; i < n; i++) out.set(ordered[i], labels[i]);
  return out;
}

export function dealerRotate(activeSeats: number[], currentDealer: number): number {
  const sorted = [...activeSeats].sort((a, b) => a - b);
  const idx = sorted.indexOf(currentDealer);
  if (idx === -1) return sorted[0];
  return sorted[(idx + 1) % sorted.length];
}

export function seatsClockwiseFrom(
  activeSeats: number[],
  fromSeat: number,
  includeFrom = false,
): number[] {
  const sorted = [...activeSeats].sort((a, b) => a - b);
  const idx = sorted.indexOf(fromSeat);
  if (idx === -1) return sorted;
  const after = [...sorted.slice(idx + 1), ...sorted.slice(0, idx)];
  return includeFrom ? [fromSeat, ...after] : after;
}
