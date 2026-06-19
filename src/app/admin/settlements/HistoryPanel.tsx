"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatKRW } from "@/lib/fmt";
import { cancelSettlement } from "./actions";

export type HistoryRow = {
  id: string;
  settlement_month: string;
  rep_id: string | null;
  rep_name: string;
  total_supply: number;
  total_commission: number;
  total_card_fee: number;
  sales_count: number;
  finalized_at: string;
};

export function HistoryPanel({ rows }: { rows: HistoryRow[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function onCancel(row: HistoryRow) {
    if (!row.rep_id) {
      setError("미매칭 정산은 화면에서 취소할 수 없습니다.");
      return;
    }
    const confirmed = window.confirm(
      `${row.rep_name}님의 ${row.settlement_month} 정산을 취소하시겠어요?\n\n정산수수료: ${formatKRW(row.total_commission - row.total_card_fee)} (${row.sales_count}건)\n\n해당 매출들은 다시 '미정산' 상태가 되며 현재 수수료율로 재계산됩니다.`,
    );
    if (!confirmed) return;

    setError(null);
    setPendingId(row.id);
    startTransition(async () => {
      const r = await cancelSettlement({
        settlementMonth: row.settlement_month,
        repId: row.rep_id!,
      });
      setPendingId(null);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">정산 이력</h2>
        <div className="text-xs text-gray-500">
          담당자 × 정산월 단위. 취소 시 audit log에 기록됩니다.
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-white p-10 text-center text-sm text-gray-500">
          아직 정산 이력이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-full whitespace-nowrap text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">정산월</th>
                <th className="px-3 py-2">담당자</th>
                <th className="px-3 py-2 text-right">건수</th>
                <th className="px-3 py-2 text-right">공급가 합계</th>
                <th className="px-3 py-2 text-right">부가세</th>
                <th className="px-3 py-2 text-right">합계</th>
                <th className="px-3 py-2 text-right">카드수수료</th>
                <th className="px-3 py-2 text-right">정산수수료</th>
                <th className="px-3 py-2">확정일시</th>
                <th className="px-3 py-2 text-center">상세</th>
                <th className="px-3 py-2 text-center">취소</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const isThisPending = pendingId === r.id && pending;
                return (
                  <tr key={r.id} className={isThisPending ? "opacity-50" : ""}>
                    <td className="px-3 py-2 font-mono">
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">
                        {r.settlement_month}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium">{r.rep_name}</td>
                    <td className="px-3 py-2 text-right">{r.sales_count}</td>
                    <td className="px-3 py-2 text-right">
                      {formatKRW(r.total_supply)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {formatKRW(r.total_supply / 10)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatKRW(r.total_supply + r.total_supply / 10)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {r.total_card_fee > 0
                        ? `-${formatKRW(r.total_card_fee)}`
                        : "-"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-blue-700">
                      {formatKRW(r.total_commission - r.total_card_fee)}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {new Date(r.finalized_at).toLocaleString("ko-KR", {
                        hour12: false,
                      })}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Link
                        href={`/admin/settlements/${r.id}`}
                        className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1 text-xs text-blue-700 hover:bg-blue-100"
                      >
                        상세보기
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => onCancel(r)}
                        disabled={pending}
                        className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {isThisPending ? "처리 중..." : "취소"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
