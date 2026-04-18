# HUD statistic definitions

Every stat in `StatSnapshot` has a precisely-defined numerator and denominator.
The in-memory `ActionEvent.flags` object (and its persisted counterpart on
`ActionLog`) is the source of truth. The calculator never looks at amounts —
only at flags that the `GameState.classify()` method attached at action time.

| Stat | Numerator | Denominator | Source of truth |
|------|-----------|-------------|-----------------|
| **Hands Played** | Hands the player was dealt into | — | `HandOutcome.participantUserIds` |
| **VPIP** | Hands with any voluntary preflop action | Hands played | `ActionLog.isVoluntary` |
| **PFR** | Hands with a preflop raise/bet | Hands played | `action ∈ {raise, bet} on preflop` |
| **AF** | Post-flop bet + raise count | Post-flop call count | `action` on flop/turn/river |
| **3-Bet%** | Preflop re-raises | Hands where another player opened before you acted | `ActionLog.isThreeBet` + `HandOutcome.preflopAggressorUserId` |
| **Fold-to-3Bet%** | Folds to a 3-bet after we opened | Hands where our open was 3-bet | `isFoldTo3Bet` + `HandOutcome.threeBetFacedBy` |
| **CBet%** | Flop bets by the preflop aggressor | Hands where you were PF aggressor AND saw flop | `isCBet` + `HandOutcome.sawFlopUserIds` |
| **Fold-to-CBet%** | Folds on flop to a cbet | Hands where you faced a cbet | `isFoldToCBet` + `HandOutcome.cbetFacedBy` |
| **WTSD%** | Hands reached showdown | Hands you saw the flop | `HandOutcome.wentToShowdownUserIds` |
| **W$SD%** | Showdowns won (ties = 0.5) | Showdowns reached | `HandOutcome.showdownWinnerUserIds` |
| **Steal%** | Preflop open raises from BTN/CO/SB | First preflop action from BTN/CO/SB | `isStealAttempt` |
| **FoldBB→Steal%** | BB folds vs a steal raise | Times BB faced a steal | `isFoldBBSteal` |
| **Check-Raise%** | Check-raises | Times checked and then faced a bet | `isCheckRaise` + per-street sequence |

## Critical conventions

- **BB checking their option is NOT a VPIP event.** The BB already has money
  in voluntarily-speaking-from-the-blind's-point-of-view, so the classifier
  sets `isVoluntary=false` for "BB call with toCall=0 preflop."
- **Posting the blind is NOT voluntary and NOT a bet.** Blinds are logged with
  `action="post-blind"` so they never inflate PFR or voluntary counters.
- **3-bet / 4-bet are counted by number of prior preflop raises**, not by
  bet sizing. An open raise has 0 priors, a 3-bet has 1 prior raise, a 4-bet
  has 2+ priors.
- **CBet context** requires everyone before the preflop aggressor on the flop
  to have checked. If someone leads into them, their bet is not a cbet.
- **Steal definition** = first-in late-position raise (BTN / CO / SB) where no
  one has voluntarily put money in before them this street.
- **Fold-to-3bet denominator** = "you opened and got 3-bet", not "you folded
  to any re-raise". A limper who folds to a 3-bet does NOT count.
- **W$SD ties** contribute 0.5 to the numerator per tie (standard PokerTracker
  convention).
- **Minimum sample size**: the default formatter shows `—` when denominator
  < 5 to avoid misleading small-sample percentages.

## Why ActionLog is the source of truth

`PlayerStats` rows exist only as a cache for fast reads. Any inconsistency can
be repaired by re-running the calculator against the full ActionLog. This is
why `ActionLog` rows are **never** modified after insertion and why the
classification flags are set at action time (when all the context is known)
rather than reconstructed later.
