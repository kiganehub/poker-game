interface CardProps {
  card: string | null;
  hidden?: boolean;
}

const SUIT_GLYPH: Record<string, string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};

export function Card({ card, hidden }: CardProps) {
  if (hidden || !card) {
    return (
      <div className="w-10 h-14 rounded bg-gradient-to-br from-indigo-700 to-indigo-900 border border-indigo-400" />
    );
  }
  const rank = card.slice(0, card.length - 1);
  const suit = card.slice(-1);
  const isRed = suit === "H" || suit === "D";
  return (
    <div
      className={`w-10 h-14 rounded bg-white flex flex-col items-center justify-center text-lg font-bold ${
        isRed ? "text-red-600" : "text-neutral-900"
      }`}
    >
      <span>{rank}</span>
      <span className="text-xl leading-none">{SUIT_GLYPH[suit] ?? suit}</span>
    </div>
  );
}
