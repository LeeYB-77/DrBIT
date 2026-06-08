"use client";

import { useState, useTransition } from "react";
import { formatKRW } from "@/lib/fmt";
import { bulkToggleCollected } from "./actions";

export type SaleRow = {
  id: string;
  sales_month: string;
  closing_date: string;
  customer: string;
  product_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  supply_amount: number;
  total_amount: number;
  rep_id: string | null;
  rep_name: string | null;
  rep_matched: boolean;
  is_collected: boolean;
  collected_at: string | null;
  settlement_month: string | null;
  commission_amount: number | null;
};

export type SaleGroup = {
  key: string;
  customer: string;
  closing_date: string;
  sales_month: string;
  rep_id: string | null;
  rep_name: string | null;
  rep_matched: boolean;
  total_quantity: number;
  total_supply: number;
  total_amount: number;
  total_commission: number;
  items: SaleRow[];
  is_collected: "all" | "partial" | "none";
  settlement_month: string | "partial" | null;
};

export function SalesTable({ groups }: { groups: SaleGroup[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-10 text-center text-sm text-gray-500">
        조건에 해당하는 거래가 없습니다.
      </div>
    );
  }

  // 정산 확정된 그룹은 토글/선택 불가
  const togglableGroups = groups.filter(
    (g) => g.settlement_month === null || g.settlement_month === "partial",
  );
  const allTogglableSelected =
    togglableGroups.length > 0 &&
    togglableGroups.every((g) => selected.has(g.key));

  function toggleSelectGroup(key: string, settled: boolean) {
    if (settled) return;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  }
  function selectAll() {
    if (allTogglableSelected) setSelected(new Set());
    else setSelected(new Set(togglableGroups.map((g) => g.key)));
  }
  function toggleExpand(key: string) {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpanded(next);
  }

  function toggleGroupCollected(group: SaleGroup) {
    // 한 번이라도 미수금 행이 있으면 → 전체 수금완료로
    // 모두 수금완료면 → 전체 수금취소
    const target = group.is_collected !== "all";
    const ids = group.items
      .filter((i) => !i.settlement_month) // 정산된 행은 제외
      .map((i) => i.id);
    if (ids.length === 0) return;
    setError(null);
    startTransition(async () => {
      const r = await bulkToggleCollected(ids, target);
      if (!r.ok) setError(r.error);
    });
  }

  function bulkSet(target: boolean) {
    const selectedGroups = groups.filter((g) => selected.has(g.key));
    const ids = selectedGroups
      .flatMap((g) => g.items)
      .filter((i) => !i.settlement_month)
      .map((i) => i.id);
    if (ids.length === 0) return;
    setError(null);
    startTransition(async () => {
      const r = await bulkToggleCollected(ids, target);
      if (!r.ok) setError(r.error);
      else setSelected(new Set());
    });
  }

  return (
    <div className="space-y-2">
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2 text-sm">
          <span className="font-medium">{selected.size}건 선택</span>
          <button
            onClick={() => bulkSet(true)}
            disabled={pending}
            className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            수금완료 표시
          </button>
          <button
            onClick={() => bulkSet(false)}
            disabled={pending}
            className="rounded-md border bg-white px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
          >
            수금취소
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-gray-500 hover:text-gray-700"
          >
            선택 해제
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-2 py-2 w-8">
                <input
                  type="checkbox"
                  checked={allTogglableSelected}
                  onChange={selectAll}
                  disabled={togglableGroups.length === 0}
                />
              </th>
              <th className="px-2 py-2 w-6"></th>
              <th className="px-2 py-2 w-20">수금</th>
              <th className="px-2 py-2">담당자</th>
              <th className="px-2 py-2">고객</th>
              <th className="px-2 py-2">마감일자</th>
              <th className="px-2 py-2 text-right">품번 수</th>
              <th className="px-2 py-2 text-right">수량</th>
              <th className="px-2 py-2 text-right">공급가</th>
              <th className="px-2 py-2 text-right">수수료</th>
              <th className="px-2 py-2">정산월</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {groups.map((g) => {
              const settled = g.settlement_month !== null;
              const fullySettled =
                g.settlement_month !== null && g.settlement_month !== "partial";
              const isSel = selected.has(g.key);
              const isExp = expanded.has(g.key);
              return (
                <GroupRows
                  key={g.key}
                  group={g}
                  settled={settled}
                  fullySettled={fullySettled}
                  isSelected={isSel}
                  isExpanded={isExp}
                  pending={pending}
                  onToggleSelect={() => toggleSelectGroup(g.key, fullySettled)}
                  onToggleExpand={() => toggleExpand(g.key)}
                  onToggleCollected={() => toggleGroupCollected(g)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRows({
  group: g,
  settled,
  fullySettled,
  isSelected,
  isExpanded,
  pending,
  onToggleSelect,
  onToggleExpand,
  onToggleCollected,
}: {
  group: SaleGroup;
  settled: boolean;
  fullySettled: boolean;
  isSelected: boolean;
  isExpanded: boolean;
  pending: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onToggleCollected: () => void;
}) {
  const collectedBadge =
    g.is_collected === "all"
      ? { label: "완료", cls: "bg-green-100 text-green-700" }
      : g.is_collected === "partial"
        ? { label: "부분", cls: "bg-amber-100 text-amber-700" }
        : { label: "미수금", cls: "bg-gray-100 text-gray-500" };

  return (
    <>
      <tr
        className={[
          isSelected ? "bg-blue-50/40" : "",
          fullySettled ? "text-gray-400" : "",
        ].join(" ")}
      >
        <td className="px-2 py-1">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            disabled={fullySettled}
          />
        </td>
        <td className="px-2 py-1">
          {g.items.length > 1 ? (
            <button
              type="button"
              onClick={onToggleExpand}
              className="text-gray-400 hover:text-gray-700"
              title="품번 펼치기/접기"
            >
              {isExpanded ? "▼" : "▶"}
            </button>
          ) : null}
        </td>
        <td className="px-2 py-1">
          <button
            type="button"
            onClick={onToggleCollected}
            disabled={fullySettled || pending}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${collectedBadge.cls} ${
              fullySettled ? "opacity-50" : "hover:opacity-80"
            }`}
            title={
              fullySettled
                ? "정산 확정된 거래는 수금 변경 불가"
                : "클릭하여 토글"
            }
          >
            {collectedBadge.label}
          </button>
        </td>
        <td className="px-2 py-1">
          {g.rep_matched ? (
            g.rep_name
          ) : (
            <span className="text-amber-700">
              {g.rep_name ?? "(빈값)"} ⚠
            </span>
          )}
        </td>
        <td className="px-2 py-1 max-w-[18rem] truncate" title={g.customer}>
          {g.customer}
        </td>
        <td className="px-2 py-1 font-mono">{g.closing_date}</td>
        <td className="px-2 py-1 text-right">
          {g.items.length > 1 ? (
            <span className="rounded bg-gray-100 px-1.5 py-0.5">
              {g.items.length}
            </span>
          ) : (
            <span className="text-gray-400">1</span>
          )}
        </td>
        <td className="px-2 py-1 text-right">{g.total_quantity}</td>
        <td className="px-2 py-1 text-right font-medium">
          {formatKRW(g.total_supply)}
        </td>
        <td className="px-2 py-1 text-right">
          {formatKRW(g.total_commission)}
        </td>
        <td className="px-2 py-1 font-mono">
          {g.settlement_month === null ? (
            <span className="text-gray-400">-</span>
          ) : g.settlement_month === "partial" ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
              혼합
            </span>
          ) : (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">
              {g.settlement_month}
            </span>
          )}
        </td>
      </tr>

      {isExpanded &&
        g.items.map((item) => (
          <tr key={item.id} className="bg-gray-50/50 text-gray-600">
            <td colSpan={4}></td>
            <td className="px-2 py-1 pl-6 text-[11px]">
              ↳ <span className="font-mono">{item.product_code}</span>{" "}
              {item.product_name}
            </td>
            <td className="px-2 py-1"></td>
            <td className="px-2 py-1"></td>
            <td className="px-2 py-1 text-right">{item.quantity}</td>
            <td className="px-2 py-1 text-right">
              {formatKRW(item.supply_amount)}
            </td>
            <td className="px-2 py-1 text-right">
              {formatKRW(item.commission_amount)}
            </td>
            <td className="px-2 py-1"></td>
          </tr>
        ))}
    </>
  );
}
