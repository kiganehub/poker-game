import type { HudActionLog, HandOutcome } from "./calculator";

/**
 * Derive a HandOutcome summary from a hand's ActionLog + showdown metadata.
 *
 * The orchestrator calls this at hand-end once it knows which userIds reached
 * showdown and which ones won. Everything else is reconstructable from logs.
 */
export function deriveHandOutcome(params: {
  handId: string;
  actions: HudActionLog[];
  participantUserIds: string[];
  wentToShowdownUserIds: string[];
  showdownWinnerUserIds: string[];
}): HandOutcome {
  const { handId, actions, participantUserIds, wentToShowdownUserIds, showdownWinnerUserIds } =
    params;

  // Seats that saw the flop = participants whose final preflop action was not "fold".
  const foldedPreflop = new Set<string>();
  const preflopActionsByUser = new Map<string, HudActionLog[]>();
  for (const a of actions) {
    if (a.street !== "preflop") continue;
    const arr = preflopActionsByUser.get(a.userId) ?? [];
    arr.push(a);
    preflopActionsByUser.set(a.userId, arr);
  }
  for (const [uid, arr] of preflopActionsByUser) {
    if (arr.some((x) => x.action === "fold")) foldedPreflop.add(uid);
  }
  const sawFlopUserIds = participantUserIds.filter((u) => !foldedPreflop.has(u));

  // Preflop aggressor = user of the last raise/bet on preflop (pre-showdown).
  let preflopAggressorUserId: string | null = null;
  for (let i = actions.length - 1; i >= 0; i--) {
    const a = actions[i];
    if (a.street !== "preflop") continue;
    if (a.action === "raise" || a.action === "bet") {
      preflopAggressorUserId = a.userId;
      break;
    }
  }

  // Users who faced a 3-bet (they were the last raiser before a 3bet event).
  const threeBetFacedBy: string[] = [];
  let priorRaiseUser: string | null = null;
  for (const a of actions) {
    if (a.street !== "preflop") continue;
    if (a.isThreeBet) {
      if (priorRaiseUser && !threeBetFacedBy.includes(priorRaiseUser)) {
        threeBetFacedBy.push(priorRaiseUser);
      }
    }
    if (a.action === "raise" || a.action === "bet") priorRaiseUser = a.userId;
  }

  // Users who faced a cbet (they were active on the flop and someone else's cbet was made).
  const cbetFacedBy: string[] = [];
  const flopActions = actions.filter((a) => a.street === "flop");
  const cbetIndex = flopActions.findIndex((a) => a.isCBet);
  if (cbetIndex >= 0) {
    const cbetter = flopActions[cbetIndex].userId;
    // Everyone active on flop except the cbetter who had to act after the cbet.
    const afterSeen = new Set<string>();
    for (let i = cbetIndex + 1; i < flopActions.length; i++) {
      const a = flopActions[i];
      if (a.userId === cbetter) continue;
      afterSeen.add(a.userId);
    }
    // Also anyone who folded before the cbetter in checkers-first contexts: in standard flow,
    // the cbet is the first aggression, so anyone who acted after qualifies. Users who were
    // seated on the flop but never acted (folded out in preflop) are excluded via sawFlopUserIds.
    for (const uid of afterSeen) cbetFacedBy.push(uid);
  }

  // BB user facing a steal attempt.
  let stealFacedByBBUserId: string | null = null;
  for (const a of actions) {
    if (a.street !== "preflop") continue;
    if (a.isStealAttempt) {
      // find the BB's next action
      for (const b of actions) {
        if (b.street !== "preflop") continue;
        if (b.position === "BB" && b !== a) {
          stealFacedByBBUserId = b.userId;
          break;
        }
      }
      break;
    }
  }

  return {
    handId,
    participantUserIds,
    wentToShowdownUserIds,
    showdownWinnerUserIds,
    showdownTie: showdownWinnerUserIds.length > 1,
    preflopAggressorUserId,
    sawFlopUserIds,
    threeBetFacedBy,
    cbetFacedBy,
    stealFacedByBBUserId,
  };
}
