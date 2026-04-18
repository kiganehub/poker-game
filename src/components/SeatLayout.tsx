import { Card } from "./Card";

export interface SeatInfo {
  seatNumber: number;
  userId: string | null;
  displayName: string | null;
  stack: number;
  currentBet?: number;
  status?: string;
  holeCards?: string[] | null;
  isDealer?: boolean;
  isCurrentActor?: boolean;
}

interface SeatLayoutProps {
  seats: SeatInfo[];
  maxPlayers: 6 | 9 | number;
  viewerUserId?: string | null;
}

export function SeatLayout({ seats, maxPlayers, viewerUserId }: SeatLayoutProps) {
  // Compute position around an ellipse.
  const coords = Array.from({ length: maxPlayers }, (_, i) => {
    const angle = (i / maxPlayers) * 2 * Math.PI - Math.PI / 2;
    const rx = 42; // % of container
    const ry = 32;
    return {
      left: `${50 + rx * Math.cos(angle)}%`,
      top: `${50 + ry * Math.sin(angle)}%`,
    };
  });

  return (
    <div className="relative w-full aspect-[2/1] bg-felt rounded-[50%] border-4 border-feltDark shadow-inner">
      {seats.map((s, i) => {
        const c = coords[i] ?? coords[0];
        const isMe = s.userId && s.userId === viewerUserId;
        const foldedClass = s.status === "folded" ? "opacity-40" : "";
        return (
          <div
            key={s.seatNumber}
            className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center ${foldedClass}`}
            style={{ left: c.left, top: c.top }}
          >
            <div
              className={`px-3 py-2 rounded-lg min-w-[100px] text-center text-sm ${
                s.isCurrentActor
                  ? "bg-yellow-500 text-black"
                  : s.userId
                    ? "bg-neutral-800 text-neutral-100"
                    : "bg-neutral-700 text-neutral-400"
              }`}
            >
              <div className="font-semibold truncate">
                {s.displayName ?? `Seat ${s.seatNumber}`}
                {s.isDealer && <span className="ml-1 text-xs">🎯</span>}
              </div>
              <div className="text-xs text-neutral-300">💰 {s.stack}</div>
              {s.currentBet != null && s.currentBet > 0 && (
                <div className="text-xs text-chip">bet {s.currentBet}</div>
              )}
              {s.status === "folded" && <div className="text-xs italic">folded</div>}
              {s.status === "all-in" && <div className="text-xs text-red-400">all-in</div>}
            </div>
            {s.holeCards && s.holeCards.length === 2 && (
              <div className="mt-1 flex gap-1">
                <Card card={s.holeCards[0]} hidden={!isMe && s.status !== "showdown"} />
                <Card card={s.holeCards[1]} hidden={!isMe && s.status !== "showdown"} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
