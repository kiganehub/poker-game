"use client";

export function StatsExportButton({ roomId }: { roomId: string }) {
  return (
    <a
      href={`/api/room/${roomId}/stats-export`}
      className="inline-block px-3 py-1 text-sm bg-neutral-700 hover:bg-neutral-600 rounded"
    >
      Download CSV
    </a>
  );
}
