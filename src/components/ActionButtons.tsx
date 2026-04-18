"use client";

import { useState } from "react";

interface ActionButtonsProps {
  disabled: boolean;
  currentBet: number;
  playerCurrentBet: number;
  playerStack: number;
  bigBlind: number;
  onAction: (action: string, amount?: number) => void;
}

export function ActionButtons({
  disabled,
  currentBet,
  playerCurrentBet,
  playerStack,
  bigBlind,
  onAction,
}: ActionButtonsProps) {
  const toCall = Math.max(0, currentBet - playerCurrentBet);
  const canCheck = toCall === 0;
  const minRaise = Math.max(currentBet * 2, currentBet + bigBlind);
  const [raiseAmt, setRaiseAmt] = useState(minRaise);

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-neutral-800 rounded">
      <button
        disabled={disabled}
        onClick={() => onAction("fold")}
        className="px-4 py-2 bg-red-700 rounded disabled:opacity-40"
      >
        Fold
      </button>
      {canCheck ? (
        <button
          disabled={disabled}
          onClick={() => onAction("check")}
          className="px-4 py-2 bg-neutral-700 rounded disabled:opacity-40"
        >
          Check
        </button>
      ) : (
        <button
          disabled={disabled}
          onClick={() => onAction("call")}
          className="px-4 py-2 bg-blue-700 rounded disabled:opacity-40"
        >
          Call {toCall}
        </button>
      )}
      {currentBet === 0 ? (
        <>
          <input
            type="number"
            min={bigBlind}
            max={playerStack + playerCurrentBet}
            value={raiseAmt}
            onChange={(e) => setRaiseAmt(Number(e.target.value))}
            className="w-24 px-2 py-1 rounded bg-neutral-900 border border-neutral-700"
          />
          <button
            disabled={disabled}
            onClick={() => onAction("bet", raiseAmt)}
            className="px-4 py-2 bg-green-700 rounded disabled:opacity-40"
          >
            Bet
          </button>
        </>
      ) : (
        <>
          <input
            type="number"
            min={minRaise}
            max={playerStack + playerCurrentBet}
            value={raiseAmt}
            onChange={(e) => setRaiseAmt(Number(e.target.value))}
            className="w-24 px-2 py-1 rounded bg-neutral-900 border border-neutral-700"
          />
          <button
            disabled={disabled}
            onClick={() => onAction("raise", raiseAmt)}
            className="px-4 py-2 bg-green-700 rounded disabled:opacity-40"
          >
            Raise to {raiseAmt}
          </button>
        </>
      )}
      <button
        disabled={disabled}
        onClick={() => onAction("all-in")}
        className="px-4 py-2 bg-purple-700 rounded disabled:opacity-40"
      >
        All-in {playerStack}
      </button>
    </div>
  );
}
