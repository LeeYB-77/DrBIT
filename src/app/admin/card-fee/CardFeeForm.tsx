"use client";

import { useState, useTransition } from "react";
import { formatPct, parsePct } from "@/lib/fmt";
import { updateCardFeeRate } from "./actions";

export function CardFeeForm({
  rate,
  updatedAt,
  pendingCardCount,
}: {
  rate: number;
  updatedAt: string | null;
  pendingCardCount: number;
}) {
  const [input, setInput] = useState(formatPct(rate));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    const next = parsePct(input);
    if (next === null || next < 0 || next > 1) {
      setError("카드수수료율은 0~100% 사이여야 합니다.");
      return;
    }
    if (next === rate) {
      setInput(formatPct(rate));
      return;
    }
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await updateCardFeeRate(input);
      if (!r.ok) {
        setError(r.error);
        setInput(formatPct(rate));
      } else {
        setSaved(true);
      }
    });
  }

  return (
    <div className="max-w-md space-y-3 rounded-lg border bg-white p-5">
      <label className="block">
        <span className="text-sm font-medium text-gray-700">카드수수료율</span>
        <div className="mt-1 flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setSaved(false);
            }}
            placeholder="예: 3.3%"
            className="w-40 rounded-md border px-3 py-1.5 text-right focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "저장 중..." : "저장"}
          </button>
        </div>
      </label>

      <div className="text-xs text-gray-500">
        “3.3”, “3.3%”, “0.033” 모두 동일하게 인식됩니다.
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {saved && (
        <div className="text-sm text-green-700">
          ✓ 저장됨 — 미정산 카드 매출 {pendingCardCount}건이 재계산되었습니다.
        </div>
      )}

      {updatedAt && !saved && (
        <div className="text-xs text-gray-400">
          최근 변경:{" "}
          {new Date(updatedAt).toLocaleString("ko-KR", { hour12: false })}
        </div>
      )}
    </div>
  );
}
