export const DEFAULT_SMALL_BLIND = 10;
export const DEFAULT_BIG_BLIND = 20;
export const DEFAULT_INITIAL_STACK = 1000;
export const MAX_PREFLOP_RAISES = 4; // final raise may be all-in
export const ACTION_TIMEOUT_MS = 30_000;
export const AUTO_FOLD_MS = 15_000;
export const DISCONNECT_GRACE_MS = 15_000;
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60_000;

export const STREETS = ["preflop", "flop", "turn", "river", "showdown", "finished"] as const;
export type Street = (typeof STREETS)[number];

export const ACTIONS = [
  "fold",
  "check",
  "call",
  "bet",
  "raise",
  "all-in",
  "post-blind",
] as const;
export type ActionName = (typeof ACTIONS)[number];

export const POSITIONS_6MAX = ["BTN", "SB", "BB", "UTG", "HJ", "CO"] as const;
export const POSITIONS_9MAX = ["BTN", "SB", "BB", "UTG", "UTG1", "MP", "MP1", "HJ", "CO"] as const;
export type Position =
  | (typeof POSITIONS_6MAX)[number]
  | (typeof POSITIONS_9MAX)[number];

export const LATE_POSITIONS: ReadonlySet<Position> = new Set(["CO", "BTN", "SB"]);
