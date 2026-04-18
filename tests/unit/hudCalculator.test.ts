import { describe, it, expect } from "vitest";
import { computeStats, type HudActionLog, type HandOutcome } from "@/lib/hud/calculator";

const emptyFlags = {
  isVoluntary: false,
  isOpenRaise: false,
  isThreeBet: false,
  isFourBetPlus: false,
  isCBet: false,
  isCheckRaise: false,
  isFoldTo3Bet: false,
  isFoldToCBet: false,
  isStealAttempt: false,
  isFoldBBSteal: false,
};

function mkAction(partial: Partial<HudActionLog>): HudActionLog {
  return {
    handId: "h1",
    userId: "u1",
    seatNumber: 0,
    position: "BTN",
    street: "preflop",
    action: "fold",
    amount: 0,
    ...emptyFlags,
    ...partial,
  };
}

describe("computeStats — VPIP / PFR", () => {
  it("BB checking the option does NOT count as VPIP", () => {
    // One hand: U1 is BB, checks preflop.
    const actions: HudActionLog[] = [
      mkAction({ userId: "u1", position: "BB", action: "check", isVoluntary: false }),
    ];
    const outcomes: HandOutcome[] = [
      {
        handId: "h1",
        participantUserIds: ["u1"],
        wentToShowdownUserIds: [],
        showdownWinnerUserIds: [],
        showdownTie: false,
        preflopAggressorUserId: null,
        sawFlopUserIds: ["u1"],
        threeBetFacedBy: [],
        cbetFacedBy: [],
        stealFacedByBBUserId: null,
      },
    ];
    const stats = computeStats("u1", actions, outcomes);
    expect(stats.vpip.numerator).toBe(0);
    expect(stats.vpip.denominator).toBe(1);
  });

  it("calling preflop raises VPIP and not PFR", () => {
    const actions: HudActionLog[] = [
      mkAction({ userId: "u1", action: "call", isVoluntary: true }),
    ];
    const outcomes: HandOutcome[] = [
      {
        handId: "h1",
        participantUserIds: ["u1"],
        wentToShowdownUserIds: [],
        showdownWinnerUserIds: [],
        showdownTie: false,
        preflopAggressorUserId: "u2",
        sawFlopUserIds: ["u1"],
        threeBetFacedBy: [],
        cbetFacedBy: [],
        stealFacedByBBUserId: null,
      },
    ];
    const stats = computeStats("u1", actions, outcomes);
    expect(stats.vpip.numerator).toBe(1);
    expect(stats.pfr.numerator).toBe(0);
  });

  it("raising preflop raises both VPIP and PFR", () => {
    const actions: HudActionLog[] = [
      mkAction({ userId: "u1", action: "raise", amount: 60, isVoluntary: true, isOpenRaise: true }),
    ];
    const outcomes: HandOutcome[] = [
      {
        handId: "h1",
        participantUserIds: ["u1"],
        wentToShowdownUserIds: [],
        showdownWinnerUserIds: [],
        showdownTie: false,
        preflopAggressorUserId: "u1",
        sawFlopUserIds: ["u1"],
        threeBetFacedBy: [],
        cbetFacedBy: [],
        stealFacedByBBUserId: null,
      },
    ];
    const stats = computeStats("u1", actions, outcomes);
    expect(stats.vpip.numerator).toBe(1);
    expect(stats.pfr.numerator).toBe(1);
  });
});

describe("computeStats — AF", () => {
  it("AF is bet+raise / call on post-flop streets", () => {
    // Postflop: 2 bets, 1 raise, 2 calls → AF = 3/2 = 1.5
    const mk = (a: string, street = "flop") =>
      mkAction({ userId: "u1", action: a, street });
    const actions = [mk("bet"), mk("raise"), mk("call"), mk("bet"), mk("call")];
    const outcomes: HandOutcome[] = [
      {
        handId: "h1",
        participantUserIds: ["u1"],
        wentToShowdownUserIds: [],
        showdownWinnerUserIds: [],
        showdownTie: false,
        preflopAggressorUserId: null,
        sawFlopUserIds: ["u1"],
        threeBetFacedBy: [],
        cbetFacedBy: [],
        stealFacedByBBUserId: null,
      },
    ];
    const stats = computeStats("u1", actions, outcomes);
    expect(stats.af.numerator).toBe(3);
    expect(stats.af.denominator).toBe(2);
    expect(stats.af.value).toBeCloseTo(1.5);
  });

  it("AF returns inf when calls = 0 and at least one bet/raise", () => {
    const actions = [mkAction({ userId: "u1", action: "bet", street: "flop" })];
    const outcomes: HandOutcome[] = [
      {
        handId: "h1",
        participantUserIds: ["u1"],
        wentToShowdownUserIds: [],
        showdownWinnerUserIds: [],
        showdownTie: false,
        preflopAggressorUserId: null,
        sawFlopUserIds: ["u1"],
        threeBetFacedBy: [],
        cbetFacedBy: [],
        stealFacedByBBUserId: null,
      },
    ];
    const stats = computeStats("u1", actions, outcomes);
    expect(stats.af.value).toBe("inf");
  });
});

describe("computeStats — W$SD ties", () => {
  it("ties count as 0.5 toward wsd numerator", () => {
    const actions: HudActionLog[] = [];
    const outcomes: HandOutcome[] = [
      {
        handId: "h1",
        participantUserIds: ["u1", "u2"],
        wentToShowdownUserIds: ["u1", "u2"],
        showdownWinnerUserIds: ["u1", "u2"],
        showdownTie: true,
        preflopAggressorUserId: null,
        sawFlopUserIds: ["u1", "u2"],
        threeBetFacedBy: [],
        cbetFacedBy: [],
        stealFacedByBBUserId: null,
      },
    ];
    const stats = computeStats("u1", actions, outcomes);
    expect(stats.wsd.numerator).toBeCloseTo(0.5);
    expect(stats.wsd.denominator).toBe(1);
  });
});
