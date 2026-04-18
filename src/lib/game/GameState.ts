import type {
  ActionEvent,
  ActionFlags,
  Card,
  HandState,
  LegalActionSet,
  PlayerState,
} from "@/lib/types/game";
import { EMPTY_FLAGS } from "@/lib/types/game";
import type { ActionName, Position, Street } from "@/constants/gameConfig";
import { MAX_PREFLOP_RAISES } from "@/constants/gameConfig";
import { assignPositions, seatsClockwiseFrom } from "./positions";
import { makeDeck, shuffle } from "./deck";
import {
  applyAwards,
  resolveByFold,
  resolveShowdown,
  type ShowdownResult,
} from "./showdown";

export interface SeatInit {
  seat: number;
  userId: string;
  displayName: string;
  stack: number;
}

export interface StartHandOptions {
  handNumber: number;
  smallBlind: number;
  bigBlind: number;
  dealerSeat: number;
  seats: SeatInit[];
  rand?: () => number;
}

/**
 * Core state machine for a single poker hand.
 *
 * Design notes:
 * - Every mutation goes through `applyAction()` which records an ActionEvent.
 * - Classification flags (VPIP/PFR/3Bet/CBet/...) are computed AT THE MOMENT
 *   the action is applied and stored on the event — this is the source of
 *   truth for the HUD engine.
 * - After applying an action we may auto-advance streets (all-in runout, or
 *   betting round complete).
 * - The class is intentionally not Prisma-aware; the API layer is responsible
 *   for persistence.
 */
export class GameState {
  private deck: Card[] = [];
  private deckIndex = 0;

  private constructor(public state: HandState, public positions: Map<number, Position>) {}

  static startHand(opts: StartHandOptions): GameState {
    const { handNumber, smallBlind, bigBlind, dealerSeat, seats } = opts;
    if (seats.length < 2) throw new Error("need at least 2 seats");

    const activeSeats = seats.map((s) => s.seat);
    const positions = assignPositions(activeSeats, dealerSeat);
    const sorted = [...activeSeats].sort((a, b) => a - b);

    // Determine SB/BB seats from position labels.
    let sbSeat: number | null = null;
    let bbSeat: number | null = null;
    for (const [seat, pos] of positions.entries()) {
      if (pos === "SB") sbSeat = seat;
      if (pos === "BB") bbSeat = seat;
    }
    // Heads-up: BTN is SB.
    if (sorted.length === 2) sbSeat = dealerSeat;
    if (sbSeat == null || bbSeat == null) throw new Error("failed to assign blinds");

    const players = new Map<number, PlayerState>();
    for (const s of seats) {
      players.set(s.seat, {
        seat: s.seat,
        userId: s.userId,
        displayName: s.displayName,
        stack: s.stack,
        holeCards: null,
        invested: 0,
        currentBet: 0,
        status: "active",
        hasActedThisStreet: false,
      });
    }

    // Deal hole cards: two rounds of single-card dealing starting from SB.
    const deck = shuffle(makeDeck(), opts.rand);
    let d = 0;
    const dealOrder = seatsClockwiseFrom(sorted, dealerSeat, false);
    const firstCards = new Map<number, string>();
    for (const seat of dealOrder) firstCards.set(seat, deck[d++]);
    for (const seat of dealOrder) {
      const first = firstCards.get(seat)!;
      const second = deck[d++];
      players.get(seat)!.holeCards = [first, second];
    }

    const state: HandState = {
      handNumber,
      smallBlind,
      bigBlind,
      dealerSeat,
      smallBlindSeat: sbSeat,
      bigBlindSeat: bbSeat,
      street: "preflop",
      communityCards: [],
      players,
      currentBet: 0,
      minRaise: bigBlind,
      lastAggressorSeat: null,
      preflopLastAggressorSeat: null,
      currentActor: null,
      actionLog: [],
      potContributions: new Map(),
      numRaisesThisStreet: 0,
      lastRaiseSize: bigBlind,
      streetOpened: false,
      preflopRaiseCount: 0,
    };

    const gs = new GameState(state, positions);
    gs.deck = deck;
    gs.deckIndex = d;

    // Post blinds.
    gs.postBlind(sbSeat, smallBlind, "SB");
    gs.postBlind(bbSeat, bigBlind, "BB");
    state.currentBet = bigBlind;
    state.streetOpened = true;
    state.numRaisesThisStreet = 1; // BB counts as the opening bet for raise-cap purposes
    state.preflopLastAggressorSeat = bbSeat;

    // First to act preflop = seat clockwise from BB (UTG).
    state.currentActor = gs.nextActiveSeat(bbSeat);

    // Reset hasActedThisStreet flags for non-blinds (blinds haven't truly "acted yet"
    // in the option-to-raise sense — BB still has option).
    for (const p of players.values()) p.hasActedThisStreet = false;

    return gs;
  }

  private postBlind(seat: number, amount: number, label: "SB" | "BB"): void {
    const p = this.state.players.get(seat)!;
    const paid = Math.min(amount, p.stack);
    p.stack -= paid;
    p.currentBet += paid;
    p.invested += paid;
    if (p.stack === 0) p.status = "all-in";

    const evt: ActionEvent = {
      seat,
      userId: p.userId,
      position: this.positions.get(seat)!,
      street: "preflop",
      action: "post-blind",
      amount: paid,
      potSizeBefore: this.potTotal() - paid,
      toCall: 0,
      stackBefore: p.stack + paid,
      stackAfter: p.stack,
      flags: { ...EMPTY_FLAGS },
      createdAt: Date.now(),
    };
    this.state.actionLog.push(evt);
  }

  potTotal(): number {
    let t = 0;
    for (const p of this.state.players.values()) t += p.invested;
    return t;
  }

  activeSeatsForAction(): number[] {
    // Seats still able to act (not folded, not all-in).
    return [...this.state.players.values()]
      .filter((p) => p.status === "active")
      .map((p) => p.seat)
      .sort((a, b) => a - b);
  }

  remainingSeats(): number[] {
    return [...this.state.players.values()]
      .filter((p) => p.status !== "folded")
      .map((p) => p.seat);
  }

  private nextActiveSeat(from: number): number | null {
    const all = [...this.state.players.keys()].sort((a, b) => a - b);
    const after = seatsClockwiseFrom(all, from, false);
    for (const s of after) {
      const p = this.state.players.get(s)!;
      if (p.status === "active") return s;
    }
    return null;
  }

  legalActions(seat: number): LegalActionSet {
    const p = this.state.players.get(seat);
    if (!p) throw new Error(`no player at seat ${seat}`);
    const toCall = Math.max(0, this.state.currentBet - p.currentBet);
    const canCheck = toCall === 0;
    const canCall = toCall > 0 && p.stack > 0;
    const callAmount = Math.min(toCall, p.stack);
    // Betting (currentBet === 0) vs raising (currentBet > 0).
    const preflopRaiseCap =
      this.state.street === "preflop" && this.state.preflopRaiseCount >= MAX_PREFLOP_RAISES;
    const minBet = this.state.bigBlind;
    const minRaiseTotal = this.state.currentBet + this.state.minRaise;
    const maxTotal = p.currentBet + p.stack;
    return {
      canFold: p.status === "active",
      canCheck,
      canCall,
      callAmount,
      canBet: this.state.currentBet === 0 && p.stack > 0,
      minBet,
      canRaise:
        this.state.currentBet > 0 && p.stack > 0 && !preflopRaiseCap && maxTotal > this.state.currentBet,
      minRaiseTotal,
      maxTotal,
      canAllIn: p.stack > 0,
    };
  }

  /**
   * Apply an action by the current actor.
   *
   * `amount` semantics:
   *  - fold/check/call: ignored
   *  - bet: total bet size for this street (must be >= minBet)
   *  - raise: new total bet size for this street (must be >= minRaiseTotal)
   *  - all-in: ignored (uses remaining stack)
   *
   * Returns the event that was produced.
   */
  applyAction(seat: number, action: ActionName, amount = 0): ActionEvent {
    if (this.state.street === "showdown" || this.state.street === "finished") {
      throw new Error("hand already finished");
    }
    if (this.state.currentActor !== seat) {
      throw new Error("not your turn");
    }
    const p = this.state.players.get(seat)!;
    if (p.status !== "active") throw new Error("player not active");
    const legal = this.legalActions(seat);

    const potBefore = this.potTotal();
    const stackBefore = p.stack;
    const toCall = Math.max(0, this.state.currentBet - p.currentBet);

    let resolvedAmount = 0;
    let actualAction: ActionName = action;

    switch (action) {
      case "fold": {
        if (!legal.canFold) throw new Error("cannot fold");
        p.status = "folded";
        p.hasActedThisStreet = true;
        break;
      }
      case "check": {
        if (!legal.canCheck) throw new Error("cannot check");
        p.hasActedThisStreet = true;
        break;
      }
      case "call": {
        if (!legal.canCall) throw new Error("cannot call");
        const pay = legal.callAmount;
        p.stack -= pay;
        p.currentBet += pay;
        p.invested += pay;
        resolvedAmount = pay;
        if (p.stack === 0) {
          p.status = "all-in";
          actualAction = "all-in";
        }
        p.hasActedThisStreet = true;
        break;
      }
      case "bet": {
        if (!legal.canBet) throw new Error("cannot bet");
        if (amount < legal.minBet && amount < p.stack) {
          throw new Error(`bet must be >= ${legal.minBet}`);
        }
        const total = Math.min(amount, legal.maxTotal);
        const pay = total - p.currentBet;
        p.stack -= pay;
        p.currentBet = total;
        p.invested += pay;
        resolvedAmount = pay;
        this.state.currentBet = total;
        this.state.lastRaiseSize = total;
        this.state.minRaise = total; // next raise must be >= 2*total
        this.state.lastAggressorSeat = seat;
        if (this.state.street === "preflop") this.state.preflopLastAggressorSeat = seat;
        this.state.streetOpened = true;
        this.state.numRaisesThisStreet += 1;
        if (this.state.street === "preflop") this.state.preflopRaiseCount += 1;
        // Other active players' hasActed resets.
        for (const op of this.state.players.values()) {
          if (op.seat !== seat && op.status === "active") op.hasActedThisStreet = false;
        }
        p.hasActedThisStreet = true;
        if (p.stack === 0) {
          p.status = "all-in";
          actualAction = "all-in";
        }
        break;
      }
      case "raise": {
        if (!legal.canRaise) throw new Error("cannot raise");
        // amount = target total this street
        if (amount < legal.minRaiseTotal && amount < legal.maxTotal) {
          throw new Error(`raise must be >= ${legal.minRaiseTotal}`);
        }
        const total = Math.min(amount, legal.maxTotal);
        const pay = total - p.currentBet;
        p.stack -= pay;
        p.currentBet = total;
        p.invested += pay;
        resolvedAmount = pay;
        const raiseIncrement = total - this.state.currentBet;
        this.state.currentBet = total;
        this.state.minRaise = Math.max(this.state.minRaise, raiseIncrement);
        this.state.lastRaiseSize = raiseIncrement;
        this.state.lastAggressorSeat = seat;
        if (this.state.street === "preflop") this.state.preflopLastAggressorSeat = seat;
        this.state.numRaisesThisStreet += 1;
        if (this.state.street === "preflop") this.state.preflopRaiseCount += 1;
        for (const op of this.state.players.values()) {
          if (op.seat !== seat && op.status === "active") op.hasActedThisStreet = false;
        }
        p.hasActedThisStreet = true;
        if (p.stack === 0) {
          p.status = "all-in";
          actualAction = "all-in";
        }
        break;
      }
      case "all-in": {
        if (!legal.canAllIn) throw new Error("cannot all-in");
        const pay = p.stack;
        const total = p.currentBet + pay;
        p.stack = 0;
        p.currentBet = total;
        p.invested += pay;
        resolvedAmount = pay;
        const isRaise = total > this.state.currentBet;
        if (isRaise) {
          const raiseIncrement = total - this.state.currentBet;
          this.state.currentBet = total;
          // A short all-in that does not meet min raise does NOT reopen action for prior raisers.
          // We still update lastRaiseSize so subsequent raises must exceed this increment only
          // if the increment met the minimum.
          const fullRaise = raiseIncrement >= this.state.minRaise;
          if (fullRaise) {
            this.state.minRaise = raiseIncrement;
            this.state.lastRaiseSize = raiseIncrement;
            this.state.lastAggressorSeat = seat;
            if (this.state.street === "preflop") this.state.preflopLastAggressorSeat = seat;
            for (const op of this.state.players.values()) {
              if (op.seat !== seat && op.status === "active") op.hasActedThisStreet = false;
            }
          }
          this.state.numRaisesThisStreet += 1;
          if (this.state.street === "preflop") this.state.preflopRaiseCount += 1;
          this.state.streetOpened = true;
        }
        p.status = "all-in";
        p.hasActedThisStreet = true;
        actualAction = "all-in";
        break;
      }
      default:
        throw new Error(`unknown action ${action}`);
    }

    const flags = this.classify(seat, actualAction, toCall);

    const evt: ActionEvent = {
      seat,
      userId: p.userId,
      position: this.positions.get(seat)!,
      street: this.state.street,
      action: actualAction,
      amount: resolvedAmount,
      potSizeBefore: potBefore,
      toCall,
      stackBefore,
      stackAfter: p.stack,
      flags,
      createdAt: Date.now(),
    };
    this.state.actionLog.push(evt);

    // Advance turn.
    this.advanceTurn();
    return evt;
  }

  /**
   * Classify an action for HUD purposes. This runs AFTER mutating player state
   * but uses pre-action values (toCall) for context.
   *
   * Voluntary: any non-fold preflop action that voluntarily puts chips in
   *   beyond the forced blind. BB checking their option doesn't count.
   */
  private classify(seat: number, action: ActionName, toCall: number): ActionFlags {
    const flags: ActionFlags = { ...EMPTY_FLAGS };
    const pos = this.positions.get(seat);
    if (this.state.street === "preflop") {
      const priorRaises = this.priorPreflopRaiseCount(seat);
      if (action === "call" || action === "bet" || action === "raise" || action === "all-in") {
        // BB "checking option" is not voluntary. But BB calling a raise IS voluntary.
        const isBBCheck = pos === "BB" && toCall === 0 && action === "call";
        const isForcedBlind = false; // real blinds are post-blind, not "call"
        if (!isBBCheck && !isForcedBlind) flags.isVoluntary = true;
      }
      if (action === "raise" || (action === "all-in" && this.didRaiseThisAction(seat))) {
        if (priorRaises === 0) flags.isOpenRaise = true;
        else if (priorRaises === 1) flags.isThreeBet = true;
        else if (priorRaises >= 2) flags.isFourBetPlus = true;

        // steal attempt: open raise from late position with everyone before folded
        if (
          flags.isOpenRaise &&
          pos &&
          (pos === "BTN" || pos === "CO" || pos === "SB") &&
          this.noVPIPBeforePreflop(seat)
        ) {
          flags.isStealAttempt = true;
        }
      }
      if (action === "fold") {
        // fold to 3bet: we made an open raise preflop AND a 3bet (or higher) was made after it
        if (this.wasOriginalOpenRaiser(seat) && priorRaises >= 2) {
          flags.isFoldTo3Bet = true;
        }
        // fold BB to steal: BB folds preflop when a steal raise is standing
        if (pos === "BB" && this.isFacingStealAttempt(seat)) {
          flags.isFoldBBSteal = true;
        }
      }
    } else {
      // postflop
      const preflopAggressor = this.state.preflopLastAggressorSeat;
      if (this.state.street === "flop" && seat === preflopAggressor) {
        // cbet: bet on flop AND everyone before seat this street has checked
        if ((action === "bet" || action === "raise") && this.isContinuationContext()) {
          flags.isCBet = true;
        }
      }
      // check-raise: had checked earlier this street then raised
      if (action === "raise" && this.didPlayerCheckEarlierThisStreet(seat)) {
        flags.isCheckRaise = true;
      }
      // fold to cbet: prior action this street was a cbet
      if (action === "fold" && this.isFacingCBet()) {
        flags.isFoldToCBet = true;
      }
    }
    return flags;
  }

  private didRaiseThisAction(seat: number): boolean {
    const p = this.state.players.get(seat)!;
    return p.currentBet >= this.state.currentBet;
  }

  private priorPreflopRaiseCount(_seat: number): number {
    // Count raises (or bets, though preflop always has the BB as a pseudo-bet) already
    // logged THIS street prior to the current action. classify() runs BEFORE the current
    // event is pushed, so filtering the log is correct.
    // Convention: open raise → 0 priors, 3-bet → 1 prior, 4-bet+ → 2+ priors.
    if (this.state.street !== "preflop") return 0;
    return this.state.actionLog.filter(
      (e) => e.street === "preflop" && (e.action === "raise" || e.action === "bet"),
    ).length;
  }

  private noVPIPBeforePreflop(seat: number): boolean {
    for (const e of this.state.actionLog) {
      if (e.street !== "preflop") continue;
      if (e.seat === seat) continue;
      if (e.flags.isVoluntary) return false;
    }
    return true;
  }

  private wasOriginalOpenRaiser(seat: number): boolean {
    // The first raiser preflop = open raiser.
    for (const e of this.state.actionLog) {
      if (e.street !== "preflop") continue;
      if (e.action === "raise" || e.action === "bet") return e.seat === seat;
    }
    return false;
  }

  private isFacingStealAttempt(seat: number): boolean {
    for (let i = this.state.actionLog.length - 1; i >= 0; i--) {
      const e = this.state.actionLog[i];
      if (e.street !== "preflop") continue;
      if (e.action === "raise" || e.action === "bet") return e.flags.isStealAttempt;
    }
    return false;
  }

  private isContinuationContext(): boolean {
    // Everyone preceding this seat in THIS street (flop) has checked.
    const seat = this.state.currentActor;
    if (seat == null) return false;
    for (const e of this.state.actionLog) {
      if (e.street !== this.state.street) continue;
      if (e.seat === seat) return true; // reached
      if (e.action !== "check") return false;
    }
    return true;
  }

  private didPlayerCheckEarlierThisStreet(seat: number): boolean {
    for (const e of this.state.actionLog) {
      if (e.street !== this.state.street) continue;
      if (e.seat === seat && e.action === "check") return true;
    }
    return false;
  }

  private isFacingCBet(): boolean {
    // The last bet/raise event this street was marked as isCBet.
    for (let i = this.state.actionLog.length - 1; i >= 0; i--) {
      const e = this.state.actionLog[i];
      if (e.street !== this.state.street) continue;
      if (e.action === "bet" || e.action === "raise" || e.action === "all-in") {
        return e.flags.isCBet;
      }
    }
    return false;
  }

  /** Move to next actor or advance street if round complete. */
  private advanceTurn(): void {
    // If only one non-folded player, hand ends immediately.
    const remaining = this.remainingSeats();
    if (remaining.length <= 1) {
      this.state.street = "showdown";
      this.state.currentActor = null;
      return;
    }

    const activeToAct = [...this.state.players.values()].filter(
      (p) => p.status === "active",
    );
    const allActed = activeToAct.every((p) => p.hasActedThisStreet);
    const allMatched = activeToAct.every((p) => p.currentBet === this.state.currentBet);
    const roundComplete = activeToAct.length === 0 || (allActed && allMatched);

    if (!roundComplete) {
      const next = this.nextActiveSeat(this.state.currentActor!);
      this.state.currentActor = next;
      return;
    }

    // Round complete → advance street.
    this.state.currentActor = null;
  }

  /** Pop n cards from the internal deck (used to deal community cards). */
  private dealFromDeck(n: number): Card[] {
    const out = this.deck.slice(this.deckIndex, this.deckIndex + n);
    this.deckIndex += n;
    return out;
  }

  /**
   * Auto-advance to the next street, dealing community cards from the internal deck.
   * Returns the new street, or null if no advance was needed.
   */
  autoAdvanceStreet(): Street | null {
    if (!this.needsStreetAdvance()) return null;
    const order: Street[] = ["preflop", "flop", "turn", "river", "showdown"];
    const idx = order.indexOf(this.state.street);
    if (idx === -1 || idx === order.length - 1) return null;
    const next = order[idx + 1];
    const cards =
      next === "flop" ? this.dealFromDeck(3) : next === "showdown" ? [] : this.dealFromDeck(1);
    this.advanceStreet(cards);
    return next;
  }

  /**
   * Advance to the next street. Caller (orchestrator) checks `needsStreetAdvance`
   * and deals community cards from the provided deck slice.
   */
  needsStreetAdvance(): boolean {
    if (this.state.street === "showdown" || this.state.street === "finished") return false;
    return this.state.currentActor == null;
  }

  advanceStreet(nextCards: Card[]): void {
    const order: Street[] = ["preflop", "flop", "turn", "river", "showdown"];
    const idx = order.indexOf(this.state.street);
    if (idx === -1 || idx === order.length - 1) return;
    const next = order[idx + 1];
    this.state.street = next;

    if (next === "flop") {
      if (nextCards.length !== 3) throw new Error("flop needs 3 cards");
      this.state.communityCards.push(...nextCards);
    } else if (next === "turn" || next === "river") {
      if (nextCards.length !== 1) throw new Error(`${next} needs 1 card`);
      this.state.communityCards.push(...nextCards);
    }

    // Reset per-street player state.
    for (const p of this.state.players.values()) {
      p.currentBet = 0;
      p.hasActedThisStreet = false;
    }
    this.state.currentBet = 0;
    this.state.minRaise = this.state.bigBlind;
    this.state.numRaisesThisStreet = 0;
    this.state.streetOpened = false;
    this.state.lastRaiseSize = this.state.bigBlind;
    this.state.lastAggressorSeat = null;

    // First to act postflop = first active seat clockwise from dealer (SB position).
    if (next !== "showdown") {
      const sorted = [...this.state.players.keys()].sort((a, b) => a - b);
      const clockwise = seatsClockwiseFrom(sorted, this.state.dealerSeat, false);
      const first = clockwise.find((s) => this.state.players.get(s)?.status === "active");
      this.state.currentActor = first ?? null;
      // If currentActor is null but >1 remaining and some are all-in → runout (no betting).
      if (this.state.currentActor == null && this.remainingSeats().length > 1) {
        // Skip straight to showdown by recursively advancing remaining streets externally.
      }
    }
  }

  /** Finalize the hand: award pots. Returns showdown result. */
  finalize(): ShowdownResult {
    const remaining = this.remainingSeats();
    let result: ShowdownResult;
    if (remaining.length === 1) {
      result = resolveByFold(this.state);
    } else {
      result = resolveShowdown(this.state);
    }
    applyAwards(this.state.players, result.awards);
    this.state.street = "finished";
    this.state.currentActor = null;
    return result;
  }
}
