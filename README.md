# Home Poker

A no-limit Texas hold'em app for playing with friends. Invite-URL based auth,
6- or 9-handed tables, PokerTracker-style HUD (VPIP/PFR/AF/3-Bet/CBet/WTSD/W$SD),
and CSV export.

The MVP prioritizes **game-progression correctness** over UI polish: the core
game logic, pot calculator, hand evaluator, and HUD statistics engine are pure
TypeScript and fully unit-tested.

## Quick start

```bash
docker compose up -d              # Postgres
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run dev                       # http://localhost:3000
```

Open the home page, create a room, and share
`/room/<roomId>?guestId=<yourName>` with friends. Anyone visiting that URL
auto-joins as a guest.

## Tests

```bash
npm test           # vitest: 25 tests across 4 files
```

Covered:

| File | What it tests |
|------|----------------|
| `potCalculator.test.ts` | Side-pot layering, folded-chip accounting |
| `handEvaluator.test.ts` | Royal flush vs straight flush, wheel A-2-3-4-5, kickers |
| `gameState.test.ts` | Blinds, fold-around, preflop classification (open/3bet/cbet/check-raise) |
| `hudCalculator.test.ts` | VPIP excludes BB option, AF math & inf case, W$SD ties as 0.5 |

## Project layout

```
src/
  app/                 # Next.js App Router
    api/room/...       # REST endpoints
    room/[roomId]/     # Table UI
  components/          # React components (TableView, SeatLayout, …)
  constants/           # Game config defaults + position labels
  hooks/               # useGameState polling hook
  lib/
    game/              # Pure TS game engine
      GameState.ts       state machine
      handEvaluator.ts   5/7-card hand ranker
      potCalculator.ts   side pots
      showdown.ts        pot distribution
      positions.ts       BTN/SB/BB/… assignment
      orchestrator.ts    in-memory room orchestrator + DB persist
    hud/               # Statistics engine
      calculator.ts      ActionLog → StatSnapshot
      definitions.ts     stat shapes + formatters
      handOutcome.ts     per-hand metadata derivation
      exporter.ts        CSV writer
    db/client.ts       # Prisma singleton
    auth/session.ts    # guestId → User resolver
prisma/schema.prisma
tests/unit/
docs/HUD_DEFINITIONS.md
```

## Architecture notes

- **Event sourcing for stats.** Every action is written to `ActionLog` with
  denormalized classification flags (`isVoluntary`, `isOpenRaise`,
  `isThreeBet`, `isCBet`, `isCheckRaise`, …). The HUD calculator recomputes
  percentages from those flags + per-hand outcome metadata; there is no stat
  cache that can drift.
- **Pure game engine.** `src/lib/game/` has no Prisma imports. You can drive a
  hand end-to-end in a test with a seeded RNG and no database.
- **Polling instead of WebSockets (MVP).** The spec calls for sockets; the
  `/api/room/[roomId]/state` endpoint + 1s polling in `useGameState` hook is
  the pragmatic MVP. Swapping in `socket.io` is a ~50-line change since the
  broadcast payload is already defined (`PolledState`).
- **In-memory orchestrator.** `orchestratorStore` holds the live `GameState`
  per room between HTTP calls. A hand reset / server restart recovers from
  the DB by replaying `ActionLog` (replay engine not implemented in MVP).

## Known MVP gaps

- No WebSockets (polling instead)
- No reconnect-token flow (guestId re-auth is effectively idempotent)
- No chat
- Orchestrator state is single-process; would need Redis for multi-instance

See `docs/HUD_DEFINITIONS.md` for the contract between game classifier and HUD.
