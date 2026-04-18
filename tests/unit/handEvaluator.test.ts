import { describe, it, expect } from "vitest";
import { evaluateHand, compareRank } from "@/lib/game/handEvaluator";

describe("evaluateHand", () => {
  it("royal flush beats straight flush", () => {
    const royal = evaluateHand(["AS", "KS", "QS", "JS", "TS"]);
    const sf = evaluateHand(["9H", "8H", "7H", "6H", "5H"]);
    expect(royal.category).toBe("royal-flush");
    expect(sf.category).toBe("straight-flush");
    expect(compareRank(royal, sf)).toBeGreaterThan(0);
  });

  it("wheel straight (A-2-3-4-5) is ranked as 5-high", () => {
    const wheel = evaluateHand(["AS", "2H", "3C", "4D", "5S"]);
    const six = evaluateHand(["2C", "3D", "4S", "5C", "6H"]);
    expect(wheel.category).toBe("straight");
    expect(six.category).toBe("straight");
    expect(compareRank(six, wheel)).toBeGreaterThan(0);
  });

  it("four of a kind beats full house", () => {
    const quads = evaluateHand(["AS", "AH", "AD", "AC", "2S"]);
    const boat = evaluateHand(["KS", "KH", "KD", "2C", "2S"]);
    expect(quads.category).toBe("four-of-a-kind");
    expect(boat.category).toBe("full-house");
    expect(compareRank(quads, boat)).toBeGreaterThan(0);
  });

  it("picks best 5 from 7 cards", () => {
    // AA in hand, board has AKQJ of spades → royal flush
    const r = evaluateHand(["AS", "AC", "KS", "QS", "JS", "TS", "2D"]);
    expect(r.category).toBe("royal-flush");
  });

  it("two pair kicker matters", () => {
    // Both have aces and kings; kicker decides.
    const a = evaluateHand(["AS", "AH", "KD", "KC", "QS"]);
    const b = evaluateHand(["AS", "AH", "KD", "KC", "JS"]);
    expect(a.category).toBe("two-pair");
    expect(b.category).toBe("two-pair");
    expect(compareRank(a, b)).toBeGreaterThan(0);
  });

  it("compares flushes by high card", () => {
    const aFlush = evaluateHand(["AS", "KS", "8S", "5S", "2S"]);
    const qFlush = evaluateHand(["QH", "JH", "8H", "5H", "2H"]);
    expect(compareRank(aFlush, qFlush)).toBeGreaterThan(0);
  });
});
