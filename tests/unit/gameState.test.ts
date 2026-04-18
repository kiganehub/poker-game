import { describe, it, expect } from "vitest";
import { GameState } from "@/lib/game/GameState";

/**
 * Helper to get a deterministic 3-player preflop setup. Stacks 1000 each, SB=10, BB=20.
 * Seat 0 = BTN, Seat 1 = SB, Seat 2 = BB (per assignPositions for 3-handed).
 */
function threeHanded() {
  const rand = mulberry32(42);
  return GameState.startHand({
    handNumber: 1,
    smallBlind: 10,
    bigBlind: 20,
    dealerSeat: 0,
    seats: [
      { seat: 0, userId: "u0", displayName: "A", stack: 1000 },
      { seat: 1, userId: "u1", displayName: "B", stack: 1000 },
      { seat: 2, userId: "u2", displayName: "C", stack: 1000 },
    ],
    rand,
  });
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("GameState", () => {
  it("posts blinds correctly 3-handed", () => {
    const gs = threeHanded();
    // SB = seat 1, BB = seat 2
    expect(gs.state.smallBlindSeat).toBe(1);
    expect(gs.state.bigBlindSeat).toBe(2);
    expect(gs.state.players.get(1)!.currentBet).toBe(10);
    expect(gs.state.players.get(2)!.currentBet).toBe(20);
    // UTG = BTN in 3-handed → seat 0 acts first preflop
    expect(gs.state.currentActor).toBe(0);
    expect(gs.state.currentBet).toBe(20);
  });

  it("fold-all-but-one awards whole pot immediately", () => {
    const gs = threeHanded();
    // BTN folds, SB folds → BB wins
    gs.applyAction(0, "fold");
    gs.applyAction(1, "fold");
    expect(gs.state.street).toBe("showdown");
    const result = gs.finalize();
    const bbAward = result.awards.find((a) => a.seat === 2);
    expect(bbAward?.amount).toBe(30); // 10 + 20
  });

  it("call around preflop advances to flop", () => {
    const gs = threeHanded();
    gs.applyAction(0, "call"); // BTN calls 20
    gs.applyAction(1, "call"); // SB completes (pays 10 more)
    gs.applyAction(2, "check"); // BB checks option
    expect(gs.needsStreetAdvance()).toBe(true);
    gs.autoAdvanceStreet();
    expect(gs.state.street).toBe("flop");
    expect(gs.state.communityCards.length).toBe(3);
    expect(gs.state.currentActor).toBe(1); // first active clockwise from dealer
  });

  it("raise reopens action; call + call closes", () => {
    const gs = threeHanded();
    gs.applyAction(0, "raise", 60); // BTN raises to 60
    gs.applyAction(1, "call"); // SB calls
    gs.applyAction(2, "call"); // BB calls
    gs.autoAdvanceStreet();
    expect(gs.state.street).toBe("flop");
    expect(gs.potTotal()).toBe(180); // 60*3
  });

  it("classifies open raise and 3bet", () => {
    const gs = threeHanded();
    gs.applyAction(0, "raise", 60); // BTN open raise
    const e1 = gs.state.actionLog.at(-1)!;
    expect(e1.flags.isOpenRaise).toBe(true);
    expect(e1.flags.isThreeBet).toBe(false);
    expect(e1.flags.isStealAttempt).toBe(true); // late position (BTN), first in

    gs.applyAction(1, "raise", 180); // SB 3-bets
    const e2 = gs.state.actionLog.at(-1)!;
    expect(e2.flags.isThreeBet).toBe(true);
    expect(e2.flags.isOpenRaise).toBe(false);
  });

  it("classifies fold to 3bet", () => {
    const gs = threeHanded();
    gs.applyAction(0, "raise", 60); // BTN opens
    gs.applyAction(1, "raise", 180); // SB 3bets
    gs.applyAction(2, "fold"); // BB folds
    gs.applyAction(0, "fold"); // BTN folds to 3bet
    const btnFold = gs.state.actionLog.at(-1)!;
    expect(btnFold.flags.isFoldTo3Bet).toBe(true);
  });

  it("classifies cbet on flop", () => {
    const gs = threeHanded();
    gs.applyAction(0, "raise", 60); // BTN opens
    gs.applyAction(1, "call");
    gs.applyAction(2, "call");
    gs.autoAdvanceStreet(); // flop
    // first to act = SB
    gs.applyAction(1, "check");
    gs.applyAction(2, "check");
    gs.applyAction(0, "bet", 100);
    const cbet = gs.state.actionLog.at(-1)!;
    expect(cbet.flags.isCBet).toBe(true);
  });

  it("classifies check-raise", () => {
    const gs = threeHanded();
    gs.applyAction(0, "call");
    gs.applyAction(1, "call");
    gs.applyAction(2, "check");
    gs.autoAdvanceStreet(); // flop
    gs.applyAction(1, "check"); // SB checks
    gs.applyAction(2, "bet", 40); // BB bets
    gs.applyAction(0, "fold"); // BTN folds
    gs.applyAction(1, "raise", 140); // SB check-raises
    const cr = gs.state.actionLog.at(-1)!;
    expect(cr.flags.isCheckRaise).toBe(true);
  });
});
