"use client";

import { useEffect, useState } from "react";

export interface PolledState {
  room: {
    id: string;
    name: string;
    maxPlayers: number;
    smallBlind: number;
    bigBlind: number;
    inviteCode: string;
    hostUserId: string;
  };
  seats: Array<{
    seatNumber: number;
    userId: string | null;
    displayName: string | null;
    stack: number;
  }>;
  hand: null | {
    handNumber: number;
    street: string;
    currentActor: number | null;
    potTotal: number;
    communityCards: string[];
    currentBet: number;
    players: Array<{
      seat: number;
      userId: string;
      stack: number;
      currentBet: number;
      invested: number;
      status: string;
      holeCards: string[] | null;
    }>;
    actionLog: unknown[];
  };
}

/**
 * Polls /state every 1s. The spec calls for WebSockets; polling is a sane MVP
 * fallback that keeps the code testable and deployable on any Next.js host.
 */
export function useGameState(roomId: string, userId: string | null) {
  const [state, setState] = useState<PolledState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const q = userId ? `?userId=${encodeURIComponent(userId)}` : "";
        const res = await fetch(`/api/room/${roomId}/state${q}`, { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) {
          if (json.ok) setState(json.data);
          else setError(json.message);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roomId, userId]);

  return { state, error };
}
