import { formatAF, formatPercent, type StatSnapshot } from "./definitions";

export interface ExportRow {
  userId: string;
  displayName: string;
  stats: StatSnapshot;
}

const HEADERS = [
  "Player",
  "Hands",
  "VPIP%",
  "PFR%",
  "AF",
  "3Bet%",
  "FoldTo3Bet%",
  "CBet%",
  "FoldToCBet%",
  "WTSD%",
  "W$SD%",
  "Steal%",
  "FoldBBSteal%",
  "CheckRaise%",
];

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function toCSV(rows: ExportRow[]): string {
  const lines = [HEADERS.join(",")];
  for (const r of rows) {
    const s = r.stats;
    lines.push(
      [
        csvEscape(r.displayName),
        s.handsPlayed,
        formatPercent(s.vpip, 1),
        formatPercent(s.pfr, 1),
        formatAF(s.af, 1),
        formatPercent(s.threeBet, 1),
        formatPercent(s.foldTo3Bet, 1),
        formatPercent(s.cbet, 1),
        formatPercent(s.foldToCBet, 1),
        formatPercent(s.wtsd, 1),
        s.wsd.denominator > 0 ? `${s.wsd.percent.toFixed(1)}%` : "—",
        formatPercent(s.steal, 1),
        formatPercent(s.foldBBToSteal, 1),
        formatPercent(s.checkRaise, 1),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}
