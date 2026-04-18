"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useGameState } from "@/hooks/useGameState";
import { SeatLayout, type SeatInfo } from "@/components/SeatLayout";
import { CommunityCards } from "@/components/CommunityCards";
import { ActionButtons } from "@/components/ActionButtons";
import { StatsExportButton } from "@/components/StatsExportButton";

export default function RoomPage({ params }: { params: { roomId: string } }) {
  const search = useSearchParams();
  const guestId = search.get("guestId") ?? "";
  const [userId, setUserId] = useState<string | null>(null);
  const [seatNumber, setSeatNumber] = useState<number | null>(null);
  const [mySeat, setMySeat] = useState<number | null>(null);
  const [joined, setJoined] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const { state } = useGameState(params.roomId, userId);

  useEffect(() => {
    // Auto-join on mount.
    if (!guestId || joined) return;
    (async () => {
      const res = await fetch(`/api/room/${params.roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId, displayName: guestId }),
      });
      const json = await res.json();
      if (json.ok) {
        setUserId(json.data.userId);
        setSeatNumber(json.data.seatNumber);
        setMySeat(json.data.seatNumber);
        setJoined(true);
      } else {
        setToast(json.message);
      }
    })();
  }, [guestId, joined, params.roomId]);

  async function startHand() {
    if (!userId) return;
    const res = await fetch(`/api/room/${params.roomId}/start-hand`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostUserId: userId }),
    });
    const json = await res.json();
    if (!json.ok) setToast(json.message);
  }

  async function sendAction(action: string, amount?: number) {
    if (!userId || mySeat == null) return;
    const res = await fetch(`/api/room/${params.roomId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        seatNumber: mySeat,
        action,
        amount: amount ?? 0,
      }),
    });
    const json = await res.json();
    if (!json.ok) setToast(json.message);
  }

  const hand = state?.hand;
  const room = state?.room;
  const me = hand?.players.find((p) => p.seat === mySeat);
  const isMyTurn = hand?.currentActor === mySeat;

  const seats: SeatInfo[] =
    state?.seats.map((s) => {
      const hp = hand?.players.find((p) => p.seat === s.seatNumber);
      return {
        seatNumber: s.seatNumber,
        userId: s.userId,
        displayName: s.displayName,
        stack: hp?.stack ?? s.stack,
        currentBet: hp?.currentBet,
        status: hp?.status,
        holeCards: hp?.holeCards ?? null,
        isCurrentActor: hand?.currentActor === s.seatNumber,
      };
    }) ?? [];

  return (
    <main className="p-4 max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">
          {room?.name ?? "Loading…"}
          {room && (
            <span className="ml-2 text-xs text-neutral-400">
              SB {room.smallBlind} / BB {room.bigBlind} · {room.maxPlayers}-max
            </span>
          )}
        </h1>
        <div className="flex gap-2 text-sm">
          {room && <StatsExportButton roomId={room.id} />}
          {room && userId === room.hostUserId && (
            <button
              onClick={startHand}
              className="px-3 py-1 bg-chip text-black rounded font-semibold"
            >
              {hand ? "New Hand" : "Start Hand"}
            </button>
          )}
        </div>
      </header>

      <div className="relative">
        <SeatLayout
          seats={seats}
          maxPlayers={room?.maxPlayers ?? 6}
          viewerUserId={userId}
        />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <CommunityCards
            cards={hand?.communityCards ?? []}
            pot={hand?.potTotal ?? 0}
          />
        </div>
      </div>

      {room && hand && me && (
        <div className="mt-4">
          <ActionButtons
            disabled={!isMyTurn}
            currentBet={hand.currentBet}
            playerCurrentBet={me.currentBet}
            playerStack={me.stack}
            bigBlind={room.bigBlind}
            onAction={sendAction}
          />
        </div>
      )}

      {room && !hand && (
        <p className="mt-4 text-neutral-400">
          Waiting for host to start a hand. Share this URL to invite players:
          <code className="ml-2 bg-neutral-800 px-2 py-1 rounded">
            {typeof window !== "undefined" ? window.location.href : ""}
          </code>
        </p>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 bg-red-700 px-3 py-2 rounded text-sm">
          {toast}
          <button className="ml-2" onClick={() => setToast(null)}>
            ✕
          </button>
        </div>
      )}
    </main>
  );
}
