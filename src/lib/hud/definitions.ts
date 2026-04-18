/**
 * HUD stat definitions. These are the contract for numerator/denominator
 * semantics and must remain stable. See docs/HUD_DEFINITIONS.md for prose
 * definitions and examples.
 *
 * Implementation note: numerator/denominator counters are set from ActionLog
 * events using the `flags` that the GameState classifier attached at action
 * time. This keeps the calculator decoupled from game-state reconstruction.
 */

export type StatKey =
  | "handsPlayed"
  | "vpip"
  | "pfr"
  | "af"
  | "threeBet"
  | "foldTo3Bet"
  | "cbet"
  | "foldToCBet"
  | "wtsd"
  | "wsd"
  | "steal"
  | "foldBBToSteal"
  | "checkRaise";

export interface StatValue {
  numerator: number;
  denominator: number;
  percent: number; // 0..100; NaN if denominator is 0
}

export interface StatSnapshot {
  handsPlayed: number;
  vpip: StatValue;
  pfr: StatValue;
  af: { numerator: number; denominator: number; value: number | "inf" };
  threeBet: StatValue;
  foldTo3Bet: StatValue;
  cbet: StatValue;
  foldToCBet: StatValue;
  wtsd: StatValue;
  wsd: { numerator: number; denominator: number; percent: number }; // ties count as 0.5
  steal: StatValue;
  foldBBToSteal: StatValue;
  checkRaise: StatValue;
}

export function mkValue(num: number, den: number): StatValue {
  return {
    numerator: num,
    denominator: den,
    percent: den > 0 ? (num / den) * 100 : Number.NaN,
  };
}

export function formatPercent(v: StatValue, minSample = 5): string {
  if (!Number.isFinite(v.percent) || v.denominator < minSample) return "—";
  return `${v.percent.toFixed(1)}%`;
}

export function formatAF(af: StatSnapshot["af"], minSample = 5): string {
  if (af.denominator === 0 && af.numerator > 0) return "∞";
  if (af.numerator + af.denominator < minSample) return "—";
  if (af.value === "inf") return "∞";
  return af.value.toFixed(2);
}
