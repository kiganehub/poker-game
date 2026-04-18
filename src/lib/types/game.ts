import type { ActionName, Position, Street } from "@/constants/gameConfig";

export type Card = string; // "AS", "KH", "TD", "9C", "2S"  rank: 2-9,T,J,Q,K,A  suit: S H D C

export interface PlayerState {
  seat: number;
  userId: string;
  displayName: string;
  stack: number;
  holeCards: [Card, Card] | null;
  invested: number; // total across the whole hand
  currentBet: number; // in current street
  status: "active" | "folded" | "all-in" | "sitting-out";
  hasActedThisStreet: boolean;
}

export interface ActionEvent {
  seat: number;
  userId: string;
  position: Position;
  street: Street;
  action: ActionName;
  amount: number;
  potSizeBefore: number;
  toCall: number;
  stackBefore: number;
  stackAfter: number;
  // classification flags (denormalized for easy stat recompute)
  flags: ActionFlags;
  createdAt: number;
}

export interface ActionFlags {
  isVoluntary: boolean;
  isOpenRaise: boolean;
  isThreeBet: boolean;
  isFourBetPlus: boolean;
  isCBet: boolean;
  isCBetOppFaced: boolean;
  isCheckRaise: boolean;
  isFoldTo3Bet: boolean;
  isFoldToCBet: boolean;
  isStealAttempt: boolean;
  isFoldBBSteal: boolean;
}

export const EMPTY_FLAGS: ActionFlags = {
  isVoluntary: false,
  isOpenRaise: false,
  isThreeBet: false,
  isFourBetPlus: false,
  isCBet: false,
  isCBetOppFaced: false,
  isCheckRaise: false,
  isFoldTo3Bet: false,
  isFoldToCBet: false,
  isStealAttempt: false,
  isFoldBBSteal: false,
};

export interface HandState {
  handNumber: number;
  smallBlind: number;
  bigBlind: number;
  dealerSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  street: Street;
  communityCards: Card[];
  players: Map<number, PlayerState>;
  currentBet: number; // highest bet this street
  minRaise: number; // min raise increment
  lastAggressorSeat: number | null;
  preflopLastAggressorSeat: number | null;
  currentActor: number | null;
  actionLog: ActionEvent[];
  potContributions: Map<number, number>; // seat -> total invested (same as invested)
  numRaisesThisStreet: number;
  lastRaiseSize: number;
  streetOpened: boolean; // a bet has been placed this street
  preflopRaiseCount: number;
}

export interface SidePot {
  amount: number;
  eligibleSeats: number[];
}

export interface LegalActionSet {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;
  minBet: number;
  canRaise: boolean;
  minRaiseTotal: number; // target total for current street (what `raise amount` must meet)
  maxTotal: number; // all-in total = stack + already committed this street
  canAllIn: boolean;
}
