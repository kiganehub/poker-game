import type { Card } from "@/lib/types/game";

// Rank ordering. Ace maps to 14, but is also treated as 1 when forming A-2-3-4-5.
const RANK_VALUE: Record<string, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export type HandCategory =
  | "high-card"
  | "pair"
  | "two-pair"
  | "three-of-a-kind"
  | "straight"
  | "flush"
  | "full-house"
  | "four-of-a-kind"
  | "straight-flush"
  | "royal-flush";

const CATEGORY_RANK: Record<HandCategory, number> = {
  "high-card": 0,
  pair: 1,
  "two-pair": 2,
  "three-of-a-kind": 3,
  straight: 4,
  flush: 5,
  "full-house": 6,
  "four-of-a-kind": 7,
  "straight-flush": 8,
  "royal-flush": 9,
};

export interface HandRank {
  category: HandCategory;
  /**
   * A 6-tuple used for lexicographic comparison: [categoryRank, tiebreaker1, ...].
   * Higher is better at every position.
   */
  score: number[];
  bestFive: Card[];
}

function parseCard(card: Card): { rank: number; suit: string } {
  const r = card.slice(0, card.length - 1);
  const s = card.slice(-1);
  const rank = RANK_VALUE[r];
  if (!rank) throw new Error(`invalid card: ${card}`);
  return { rank, suit: s };
}

/** Pick the best 5-card hand from any 5-7 card list. */
export function evaluateHand(cards: Card[]): HandRank {
  if (cards.length < 5) throw new Error("need at least 5 cards");
  // Enumerate 5-card combos (max C(7,5)=21)
  const combos = combinations(cards, 5);
  let best: HandRank | null = null;
  for (const c of combos) {
    const r = rankFive(c);
    if (!best || compareRank(r, best) > 0) best = r;
  }
  return best!;
}

export function compareRank(a: HandRank, b: HandRank): number {
  const len = Math.max(a.score.length, b.score.length);
  for (let i = 0; i < len; i++) {
    const ai = a.score[i] ?? 0;
    const bi = b.score[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

function combinations<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const n = arr.length;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    out.push(idx.map((i) => arr[i]));
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
}

function rankFive(cards: Card[]): HandRank {
  const parsed = cards.map(parseCard);
  const ranks = parsed.map((c) => c.rank).sort((a, b) => b - a);
  const suits = parsed.map((c) => c.suit);

  const isFlush = suits.every((s) => s === suits[0]);
  const straightHigh = checkStraight(ranks);

  // rank count map
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // groups: array of [count, rank] sorted by count desc then rank desc
  const groups = [...counts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => (b.count - a.count) || (b.rank - a.rank));

  if (isFlush && straightHigh) {
    if (straightHigh === 14) {
      return { category: "royal-flush", score: [CATEGORY_RANK["royal-flush"], 14], bestFive: cards };
    }
    return {
      category: "straight-flush",
      score: [CATEGORY_RANK["straight-flush"], straightHigh],
      bestFive: cards,
    };
  }

  if (groups[0].count === 4) {
    const quad = groups[0].rank;
    const kicker = groups[1].rank;
    return {
      category: "four-of-a-kind",
      score: [CATEGORY_RANK["four-of-a-kind"], quad, kicker],
      bestFive: cards,
    };
  }

  if (groups[0].count === 3 && groups[1]?.count >= 2) {
    return {
      category: "full-house",
      score: [CATEGORY_RANK["full-house"], groups[0].rank, groups[1].rank],
      bestFive: cards,
    };
  }

  if (isFlush) {
    return {
      category: "flush",
      score: [CATEGORY_RANK.flush, ...ranks],
      bestFive: cards,
    };
  }

  if (straightHigh) {
    return {
      category: "straight",
      score: [CATEGORY_RANK.straight, straightHigh],
      bestFive: cards,
    };
  }

  if (groups[0].count === 3) {
    const trip = groups[0].rank;
    const kickers = groups.slice(1).map((g) => g.rank);
    return {
      category: "three-of-a-kind",
      score: [CATEGORY_RANK["three-of-a-kind"], trip, ...kickers],
      bestFive: cards,
    };
  }

  if (groups[0].count === 2 && groups[1]?.count === 2) {
    const hi = Math.max(groups[0].rank, groups[1].rank);
    const lo = Math.min(groups[0].rank, groups[1].rank);
    const kicker = groups[2].rank;
    return {
      category: "two-pair",
      score: [CATEGORY_RANK["two-pair"], hi, lo, kicker],
      bestFive: cards,
    };
  }

  if (groups[0].count === 2) {
    const pair = groups[0].rank;
    const kickers = groups.slice(1).map((g) => g.rank);
    return {
      category: "pair",
      score: [CATEGORY_RANK.pair, pair, ...kickers],
      bestFive: cards,
    };
  }

  return { category: "high-card", score: [CATEGORY_RANK["high-card"], ...ranks], bestFive: cards };
}

/** Returns high card rank of the straight, or 0 if none. Handles wheel (A-2-3-4-5 -> 5). */
function checkStraight(descSortedRanks: number[]): number {
  const unique = [...new Set(descSortedRanks)];
  if (unique.length < 5) return 0;
  // Wheel: A-5-4-3-2
  if (
    unique.includes(14) &&
    unique.includes(2) &&
    unique.includes(3) &&
    unique.includes(4) &&
    unique.includes(5)
  ) {
    // but we still need to ensure we don't pick a higher straight instead; check first
    for (let i = 0; i <= unique.length - 5; i++) {
      if (unique[i] - unique[i + 4] === 4) return unique[i];
    }
    return 5;
  }
  for (let i = 0; i <= unique.length - 5; i++) {
    if (unique[i] - unique[i + 4] === 4) return unique[i];
  }
  return 0;
}
