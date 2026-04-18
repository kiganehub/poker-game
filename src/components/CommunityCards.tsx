import { Card } from "./Card";

export function CommunityCards({ cards, pot }: { cards: string[]; pot: number }) {
  const slots = [0, 1, 2, 3, 4].map((i) => cards[i] ?? null);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-chip font-bold">Pot: {pot}</div>
      <div className="flex gap-1">
        {slots.map((c, i) => (
          <Card key={i} card={c} hidden={c == null} />
        ))}
      </div>
    </div>
  );
}
