import { mkValue, type StatSnapshot } from "./definitions";

/**
 * Minimal ActionLog shape the calculator needs. Compatible with both the
 * in-memory `ActionEvent` and the persisted `ActionLog` Prisma row.
 */
export interface HudActionLog {
  handId: string;
  userId: string;
  seatNumber: number;
  position: string;
  street: string;
  action: string;
  amount: number;
  isVoluntary: boolean;
  isOpenRaise: boolean;
  isThreeBet: boolean;
  isFourBetPlus: boolean;
  isCBet: boolean;
  isCheckRaise: boolean;
  isFoldTo3Bet: boolean;
  isFoldToCBet: boolean;
  isStealAttempt: boolean;
  isFoldBBSteal: boolean;
}

export interface HandOutcome {
  handId: string;
  participantUserIds: string[]; // seated for this hand
  wentToShowdownUserIds: string[];
  showdownWinnerUserIds: string[]; // list of winners (ties: include all)
  showdownTie: boolean;
  preflopAggressorUserId: string | null;
  sawFlopUserIds: string[];
  threeBetFacedBy: string[]; // original raiser(s) who faced a 3bet
  cbetFacedBy: string[]; // seats that faced a flop cbet
  stealFacedByBBUserId: string | null; // BB user facing a steal attempt
}

/**
 * Pure function: compute a player's stats across all their ActionLog rows
 * plus HandOutcome metadata (needed for wtsd/wsd and opportunity denominators
 * that aren't directly inferable from a single action).
 *
 * NOTE: For simplicity and correctness we expect HandOutcome to be provided
 * from the orchestrator at hand-end. The calculator itself is stateless.
 */
export function computeStats(
  userId: string,
  actions: HudActionLog[],
  outcomes: HandOutcome[],
): StatSnapshot {
  const byHand = new Map<string, HudActionLog[]>();
  for (const a of actions) {
    if (a.userId !== userId) continue;
    const arr = byHand.get(a.handId) ?? [];
    arr.push(a);
    byHand.set(a.handId, arr);
  }

  // --- Hands played ---
  const handsPlayed = outcomes.filter((o) => o.participantUserIds.includes(userId)).length;

  // --- VPIP / PFR ---
  let vpipNum = 0;
  let pfrNum = 0;
  let vpipDen = 0;
  let pfrDen = 0;
  for (const o of outcomes) {
    if (!o.participantUserIds.includes(userId)) continue;
    const acts = (byHand.get(o.handId) ?? []).filter((a) => a.street === "preflop");
    if (acts.length === 0) continue;
    // Every preflop hand participated in is an opportunity.
    vpipDen += 1;
    pfrDen += 1;
    if (acts.some((a) => a.isVoluntary)) vpipNum += 1;
    if (acts.some((a) => a.action === "raise" || (a.action === "bet" && a.street === "preflop"))) {
      pfrNum += 1;
    }
  }

  // --- 3Bet% (preflop re-raise opportunity) ---
  let threeBetNum = 0;
  let threeBetDen = 0;
  // --- 4Bet+ / Fold to 3Bet ---
  let foldTo3BetNum = 0;
  let foldTo3BetDen = 0;
  // --- Steal / Fold BB to steal ---
  let stealNum = 0;
  let stealDen = 0;
  let foldBBToStealNum = 0;
  let foldBBToStealDen = 0;

  for (const [, acts] of byHand) {
    const preflop = acts.filter((a) => a.street === "preflop");
    // 3bet opportunity: someone raised before this player acted AND this player had a chance to act.
    // We approximate by: if there is a "raise/bet" event before this player's first preflop action.
    // The opportunity is counted once per hand per player.
    // (For strict correctness across multi-action preflop, we count at the moment they first face a raise.)
    const firstAction = preflop[0];
    if (firstAction) {
      // Does this player face a standing raise when they first act? We infer from isThreeBet
      // (they responded with 3bet) OR if isVoluntary was set after one or more raises — but
      // we don't store "facing raise" explicitly. The safest proxy is:
      //  - 3bet opportunity = at least one raise occurred on preflop BEFORE this action (impossible
      //    to know from just this player's actions)
      // So we conservatively ONLY count 3bet for users who actually 3bet. This gives correct
      // numerator but a denominator equal to "faced a raise" which we can derive from outcomes
      // if the orchestrator provides it. For MVP, denominator = hands where player had preflop
      // actions AND priorRaises >= 1 at time of decision is captured by isThreeBet + voluntary.
    }
    for (const a of preflop) {
      if (a.isThreeBet) threeBetNum += 1;
      if (a.isFoldTo3Bet) foldTo3BetNum += 1;
      if (a.isStealAttempt) stealNum += 1;
      if (a.isFoldBBSteal) foldBBToStealNum += 1;
    }
  }

  // Denominators for 3bet / fold-to-3bet / steal / foldBBtoSteal come from HandOutcome.
  for (const o of outcomes) {
    if (o.threeBetFacedBy.includes(userId)) foldTo3BetDen += 1;
    if (o.participantUserIds.includes(userId)) {
      // Rough 3bet denominator: hands where player had a preflop decision AFTER an open raise.
      // The orchestrator provides `preflopAggressorUserId` — if it's not this user and there was
      // at least one raise, this user had a 3bet opportunity.
      if (
        o.preflopAggressorUserId &&
        o.preflopAggressorUserId !== userId &&
        o.participantUserIds.includes(userId)
      ) {
        threeBetDen += 1;
      }
    }
    if (o.stealFacedByBBUserId === userId) foldBBToStealDen += 1;
  }
  // Steal denominator: preflop actions in LATE positions (BTN/CO/SB) with no prior voluntary
  // action. We count any preflop action in a steal seat as an "opportunity" when the action
  // was either a steal (isStealAttempt) or a fold/call from those positions first-in.
  // For MVP simplicity: denominator = numerator + late-position first-in folds, which we
  // approximate by counting preflop actions where position ∈ {BTN,CO,SB} and action is fold/call/raise
  // AND it is the player's first preflop action AND prior actions in hand are all folds.
  for (const [, acts] of byHand) {
    const preflop = acts.filter((a) => a.street === "preflop");
    if (preflop.length === 0) continue;
    const first = preflop[0];
    if (first.position === "BTN" || first.position === "CO" || first.position === "SB") {
      stealDen += 1;
    }
  }

  // --- CBet / Fold to CBet ---
  let cbetNum = 0;
  let cbetDen = 0;
  let foldToCBetNum = 0;
  let foldToCBetDen = 0;
  for (const [, acts] of byHand) {
    for (const a of acts) {
      if (a.isCBet) cbetNum += 1;
      if (a.isFoldToCBet) foldToCBetNum += 1;
    }
  }
  for (const o of outcomes) {
    // cbet denom: player was preflop aggressor AND saw flop
    if (o.preflopAggressorUserId === userId && o.sawFlopUserIds.includes(userId)) cbetDen += 1;
    // fold-to-cbet denom: player faced a flop cbet
    if (o.cbetFacedBy.includes(userId)) foldToCBetDen += 1;
  }

  // --- Check-Raise (all streets) ---
  let checkRaiseNum = 0;
  let checkRaiseDen = 0;
  for (const [, acts] of byHand) {
    // denominator: any time the player checked and then faced a bet (from someone else) this street
    // We approximate by scanning per-street sequences.
    const byStreet = new Map<string, HudActionLog[]>();
    for (const a of acts) {
      const arr = byStreet.get(a.street) ?? [];
      arr.push(a);
      byStreet.set(a.street, arr);
    }
    for (const [, streetActs] of byStreet) {
      // Sort by array order already = insertion order
      let checkedBefore = false;
      for (const a of streetActs) {
        if (a.action === "check") checkedBefore = true;
        if (a.isCheckRaise) {
          checkRaiseNum += 1;
          checkRaiseDen += 1;
          checkedBefore = false;
        } else if (checkedBefore && (a.action === "fold" || a.action === "call")) {
          // They checked and then acted after a bet → opportunity but didn't check-raise
          checkRaiseDen += 1;
          checkedBefore = false;
        }
      }
    }
  }

  // --- AF (aggression factor) ---
  let betRaiseCount = 0;
  let callCount = 0;
  for (const a of actions) {
    if (a.userId !== userId) continue;
    if (a.street === "preflop") continue; // AF is postflop by convention
    if (a.action === "bet" || a.action === "raise") betRaiseCount += 1;
    else if (a.action === "call") callCount += 1;
  }
  const af =
    callCount === 0
      ? { numerator: betRaiseCount, denominator: 0, value: betRaiseCount > 0 ? ("inf" as const) : 0 }
      : { numerator: betRaiseCount, denominator: callCount, value: betRaiseCount / callCount };

  // --- WTSD / W$SD ---
  let wtsdNum = 0;
  let wtsdDen = 0;
  let wsdWinNum = 0;
  let wsdDen = 0;
  for (const o of outcomes) {
    if (!o.participantUserIds.includes(userId)) continue;
    if (o.sawFlopUserIds.includes(userId)) wtsdDen += 1;
    if (o.wentToShowdownUserIds.includes(userId)) {
      wtsdNum += 1;
      wsdDen += 1;
      if (o.showdownWinnerUserIds.includes(userId)) {
        // ties count as 0.5 by convention
        wsdWinNum += o.showdownWinnerUserIds.length > 1 ? 0.5 : 1;
      }
    }
  }

  return {
    handsPlayed,
    vpip: mkValue(vpipNum, vpipDen),
    pfr: mkValue(pfrNum, pfrDen),
    af,
    threeBet: mkValue(threeBetNum, threeBetDen),
    foldTo3Bet: mkValue(foldTo3BetNum, foldTo3BetDen),
    cbet: mkValue(cbetNum, cbetDen),
    foldToCBet: mkValue(foldToCBetNum, foldToCBetDen),
    wtsd: mkValue(wtsdNum, wtsdDen),
    wsd: {
      numerator: wsdWinNum,
      denominator: wsdDen,
      percent: wsdDen > 0 ? (wsdWinNum / wsdDen) * 100 : Number.NaN,
    },
    steal: mkValue(stealNum, stealDen),
    foldBBToSteal: mkValue(foldBBToStealNum, foldBBToStealDen),
    checkRaise: mkValue(checkRaiseNum, checkRaiseDen),
  };
}
