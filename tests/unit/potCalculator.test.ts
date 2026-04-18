import { describe, it, expect } from "vitest";
import { buildPots } from "@/lib/game/potCalculator";

describe("buildPots", () => {
  it("single pot when everyone bets the same", () => {
    const pots = buildPots([
      { seat: 0, amount: 100, folded: false },
      { seat: 1, amount: 100, folded: false },
      { seat: 2, amount: 100, folded: false },
    ]);
    expect(pots).toEqual([{ amount: 300, eligibleSeats: [0, 1, 2] }]);
  });

  it("one side pot when one player is all-in short", () => {
    // A=50, B=100, C=100
    const pots = buildPots([
      { seat: 0, amount: 50, folded: false }, // A all-in
      { seat: 1, amount: 100, folded: false },
      { seat: 2, amount: 100, folded: false },
    ]);
    expect(pots).toEqual([
      { amount: 150, eligibleSeats: [0, 1, 2] },
      { amount: 100, eligibleSeats: [1, 2] },
    ]);
  });

  it("two side pots: A=50, B=100, C=500", () => {
    // Expected (per spec):
    // Main (0-50): all three → 50*3 = 150
    // Side 1 (50-100): B,C → 50*2 = 100
    // Side 2 (100-500): C → 400*1 = 400
    const pots = buildPots([
      { seat: 0, amount: 50, folded: false },
      { seat: 1, amount: 100, folded: false },
      { seat: 2, amount: 500, folded: false },
    ]);
    expect(pots).toEqual([
      { amount: 150, eligibleSeats: [0, 1, 2] },
      { amount: 100, eligibleSeats: [1, 2] },
      { amount: 400, eligibleSeats: [2] },
    ]);
  });

  it("folded chips still contribute to the pot they landed in", () => {
    // A folds after committing 50. B calls C's all-in for 200.
    const pots = buildPots([
      { seat: 0, amount: 50, folded: true },
      { seat: 1, amount: 200, folded: false },
      { seat: 2, amount: 200, folded: false },
    ]);
    // Main (0-50): 50*3 = 150, eligible = B, C (A folded so not eligible but chips counted)
    // Side (50-200): 150*2 = 300, eligible = B, C
    expect(pots).toEqual([
      { amount: 150, eligibleSeats: [1, 2] },
      { amount: 300, eligibleSeats: [1, 2] },
    ]);
  });

  it("handles everyone folding at a single level gracefully", () => {
    const pots = buildPots([
      { seat: 0, amount: 100, folded: true },
      { seat: 1, amount: 100, folded: true },
      { seat: 2, amount: 200, folded: false },
    ]);
    expect(pots).toEqual([
      { amount: 300, eligibleSeats: [2] },
      { amount: 100, eligibleSeats: [2] },
    ]);
  });
});
