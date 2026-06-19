"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { formatKRW } from "@/lib/fmt";
import { processSettlement } from "./actions";

export type PendingItem = {
  id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  supply_amount: number;
  commission_amount: number;
};

export type PendingGroup = {
  key: string;
  customer: string;
  closing_date: string;
  rep_id: string | null;
  rep_name: string | null;
  rep_matched: boolean;
  item_count: number;
  total_supply: number;
  total_commission: number;
  items: PendingItem[];
};

function nextMonthOf(month: string): string {
  // "2026-05" → "2026-06"
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  return next;
}

export function PendingPanel({
  sourceMonth,
  availableMonths,
  currentRep,
  availableReps,
  groups,
}: {
  sourceMonth: string;
  availableMonths: string[];
  currentRep: string;
  availableReps: { id: string; name: string }[];
  groups: PendingGroup[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [settlementMonth, setSettlementMonth] = useState<string>(
    nextMonthOf(sourceMonth),
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    month: string;
    count: number;
    reps: { name: string; commission: number }[];
  } | null>(null);
  const [pending, startTransition] = useTransition();

  // 미매칭 담당자(rep_id=null) 그룹은 정산 불가
  const togglable = useMemo(
    () => groups.filter((g) => g.rep_id !== null),
    [groups],
  );

  const allSelected =
    togglable.length > 0 && togglable.every((g) => selectedGroups.has(g.key));

  const selectedSummary = useMemo(() => {
    const selectedGroupsList = groups.filter((g) =>
      selectedGroups.has(g.key),
    );
    let supply = 0;
    let commission = 0;
    const ids: string[] = [];
    let groupCount = 0;
    for (const g of selectedGroupsList) {
      groupCount += 1;
      supply += g.total_supply;
      commission += g.total_commission;
      ids.push(...g.items.map((i) => i.id));
    }
    return { groupCount, itemCount: ids.length, supply, commission, ids };
  }, [groups, selectedGroups]);

  function go(updates: { source?: string; rep?: string }) {
    const next = { source: sourceMonth, rep: currentRep, ...updates };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
    }
    router.push(params.toString() ? `${pathname}?${params}` : pathname);
  }

  function toggleSelect(key: string) {
    const next = new Set(selectedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedGroups(next);
  }
  function selectAll() {
    if (allSelected) setSelectedGroups(new Set());
    else setSelectedGroups(new Set(togglable.map((g) => g.key)));
  }

  function onConfirm() {
    if (selectedSummary.ids.length === 0) {
      setError("정산할 거래를 선택하세요.");
      return;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(settlementMonth)) {
      setError("정산월은 YYYY-MM 형식이어야 합니다. (예: 2026-06)");
      return;
    }
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const r = await processSettlement({
        saleIds: selectedSummary.ids,
        settlementMonth,
      });
      if (!r.ok) setError(r.error);
      else {
        setSuccess({
          month: r.settlementMonth,
          count: r.processedCount,
          reps: r.affectedReps.map((a) => ({
            name: a.name,
            commission: a.commission,
          })),
        });
        setSelectedGroups(new Set());
      }
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">정산할 매출 선택</h2>
        <div className="text-xs text-gray-500">
          수금 완료 + 미정산 매출만 표시됩니다.
        </div>
      </div>

      {/* 매출월 / 담당자 선택 */}
      <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-white p-3 text-sm">
        <label className="flex flex-col">
          <span className="mb-1 text-xs font-medium text-gray-600">매출월</span>
          <select
            value={sourceMonth}
            onChange={(e) => go({ source: e.target.value })}
            className="rounded-md border px-2 py-1.5"
          >
            <option value="all">전체</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="mb-1 text-xs font-medium text-gray-600">대리점</span>
          <select
            value={currentRep}
            onChange={(e) => go({ rep: e.target.value })}
            className="rounded-md border px-2 py-1.5"
          >
            <option value="all">전체</option>
            <option value="unmatched">⚠ 미매칭</option>
            {availableReps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <span className="pb-1.5 text-xs text-gray-500">
          의 수금완료 · 미정산 매출
        </span>
      </div>

      {/* 매출 목록 */}
      {groups.length === 0 ? (
        <div className="rounded-lg border bg-white p-10 text-center text-sm text-gray-500">
          {sourceMonth === "all"
            ? "수금완료이면서 미정산인 거래가 없습니다."
            : `${sourceMonth} 매출월에서 수금완료이면서 미정산인 거래가 없습니다.`}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-left font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-2 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={selectAll}
                    disabled={togglable.length === 0}
                  />
                </th>
                <th className="px-2 py-2">대리점</th>
                <th className="px-2 py-2">고객</th>
                <th className="px-2 py-2">마감일자</th>
                <th className="px-2 py-2 text-right">품번 수</th>
                <th className="px-2 py-2 text-right">수량</th>
                <th className="px-2 py-2 text-right">공급가</th>
                <th className="px-2 py-2 text-right">정산수수료</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {groups.map((g) => {
                const disabled = !g.rep_matched;
                const isSel = selectedGroups.has(g.key);
                const totalQty = g.items.reduce((a, i) => a + i.quantity, 0);
                return (
                  <tr
                    key={g.key}
                    className={[
                      isSel ? "bg-blue-50/40" : "",
                      disabled ? "text-gray-400" : "",
                    ].join(" ")}
                  >
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleSelect(g.key)}
                        disabled={disabled}
                      />
                    </td>
                    <td className="px-2 py-1">
                      {g.rep_matched ? (
                        g.rep_name
                      ) : (
                        <span className="text-amber-700">
                          {g.rep_name ?? "(빈값)"} ⚠ 미매칭
                        </span>
                      )}
                    </td>
                    <td
                      className="px-2 py-1 max-w-[16rem] truncate"
                      title={g.customer}
                    >
                      {g.customer}
                    </td>
                    <td className="px-2 py-1 font-mono">{g.closing_date}</td>
                    <td className="px-2 py-1 text-right">
                      {g.item_count > 1 ? (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5">
                          {g.item_count}
                        </span>
                      ) : (
                        "1"
                      )}
                    </td>
                    <td className="px-2 py-1 text-right">{totalQty}</td>
                    <td className="px-2 py-1 text-right">
                      {formatKRW(g.total_supply)}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {formatKRW(g.total_commission)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 정산월 + 확정 */}
      <div className="rounded-lg border bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium">정산월 (수수료 지급월)</span>
            <input
              value={settlementMonth}
              onChange={(e) => setSettlementMonth(e.target.value.trim())}
              placeholder="YYYY-MM"
              className="rounded-md border px-3 py-1.5 font-mono"
            />
            <span className="mt-1 text-xs text-gray-500">
              {sourceMonth === "all"
                ? "수수료를 지급할 정산월을 입력하세요. 예: 2026-06"
                : `예: ${sourceMonth} 매출은 보통 ${nextMonthOf(sourceMonth)} 에 정산`}
            </span>
          </label>

          <div className="flex-1" />

          <div className="text-sm">
            <div className="text-gray-500">선택 합계</div>
            <div className="text-base font-semibold">
              {selectedSummary.groupCount} 거래 / {selectedSummary.itemCount}{" "}
              품번 · 공급가 {formatKRW(selectedSummary.supply)} · 정산수수료{" "}
              <span className="text-blue-700">
                {formatKRW(selectedSummary.commission)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onConfirm}
            disabled={pending || selectedSummary.ids.length === 0}
            className="rounded-md bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {pending ? "처리 중..." : "정산 확정"}
          </button>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            <div className="font-medium">
              ✓ {success.month} 정산 확정 — {success.count}건 처리됨
            </div>
            {success.reps.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {success.reps.map((r) => (
                  <li key={r.name}>
                    {r.name}: {formatKRW(r.commission)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
