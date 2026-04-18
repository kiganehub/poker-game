"use client";

import { useState } from "react";

export default function HomePage() {
  const [hostName, setHostName] = useState("alice");
  const [roomName, setRoomName] = useState("Friday Night Poker");
  const [maxPlayers, setMaxPlayers] = useState<6 | 9>(6);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createRoom() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostGuestId: hostName,
          hostDisplayName: hostName,
          name: roomName,
          maxPlayers,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        const url = `/room/${json.data.roomId}?guestId=${encodeURIComponent(hostName)}`;
        window.location.href = url;
      } else {
        setResult(`Error: ${json.message}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="p-6 max-w-xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Home Poker</h1>
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm text-neutral-400">Your name</span>
          <input
            className="block w-full mt-1 rounded bg-neutral-800 border border-neutral-700 px-3 py-2"
            value={hostName}
            onChange={(e) => setHostName(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-400">Room name</span>
          <input
            className="block w-full mt-1 rounded bg-neutral-800 border border-neutral-700 px-3 py-2"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
          />
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={maxPlayers === 6}
              onChange={() => setMaxPlayers(6)}
            />
            6-max
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={maxPlayers === 9}
              onChange={() => setMaxPlayers(9)}
            />
            9-max
          </label>
        </div>
        <button
          onClick={createRoom}
          disabled={busy}
          className="bg-chip text-black font-semibold rounded px-4 py-2 hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Creating…" : "Create Room"}
        </button>
        {result && <p className="text-red-400">{result}</p>}
      </div>
      <p className="mt-8 text-sm text-neutral-500">
        Share <code>/room/&lt;roomId&gt;?guestId=&lt;name&gt;</code> with friends to invite them.
      </p>
    </main>
  );
}
