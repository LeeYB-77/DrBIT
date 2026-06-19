"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { formatKRW } from "@/lib/fmt";

export type SettlementSummary = {
  id: string;
  settlement_month: string;
  total_supply: number;
  total_commission: number;
  total_card_fee: number;
  sales_count: number;
  finalized_at: string;
};

export type SaleItem = {
  id: string;
  settlement_month: string;
  closing_date: string;
  customer: string;
  product_code: string;
  product_name: string;
  quantity: number;
  supply: number;
  vat: number;
  total: number;
  payment_method: "cash" | "card";
  card_fee: number;
  commission: number;
};

// 정산수수료(순액) = 수수료 − 카드수수료
function netCommission(i: SaleItem): number {
  return i.commission - i.card_fee;
}

const DEFAULT_VIEW = "__default__"; // 현재월+다음달

export function MySettlementsClient({
  summaries,
  allSales,
  currentMonth,
  nextMonth,
  repName,
}: {
  summaries: SettlementSummary[];
  allSales: SaleItem[];
  currentMonth: string;
  nextMonth: string;
  repName: string;
}) {
  const [view, setView] = useState<string>(DEFAULT_VIEW);

  const allMonths = useMemo(
    () => Array.from(new Set(summaries.map((s) => s.settlement_month))).sort().reverse(),
    [summaries],
  );

  // 보여줄 월 목록 계산
  const displayMonths = useMemo<string[]>(() => {
    if (view === DEFAULT_VIEW) return [currentMonth, nextMonth];
    if (view === "__all__") return allMonths;
    return [view];
  }, [view, currentMonth, nextMonth, allMonths]);

  // 카드 데이터 (정산 없는 월도 0으로 표시)
  const cards = useMemo(
    () =>
      displayMonths.map((month) => {
        const s = summaries.find((x) => x.settlement_month === month);
        return {
          month,
          total_supply: s?.total_supply ?? 0,
          // 정산수수료(순액) = 수수료 − 카드수수료
          total_commission: (s?.total_commission ?? 0) - (s?.total_card_fee ?? 0),
          total_card_fee: s?.total_card_fee ?? 0,
          sales_count: s?.sales_count ?? 0,
          finalized_at: s?.finalized_at ?? null,
          has_data: !!s,
        };
      }),
    [displayMonths, summaries],
  );

  function downloadExcel(month: string) {
    const items = allSales.filter((s) => s.settlement_month === month);
    if (items.length === 0) {
      alert("해당 월에 정산 내역이 없습니다.");
      return;
    }
    const data = items.map((i) => ({
      마감일자: i.closing_date,
      고객: i.customer,
      품번: i.product_code,
      품명: i.product_name,
      수량: i.quantity,
      공급가: i.supply,
      부가세: i.vat,
      합계: i.total,
      결제: i.payment_method === "card" ? "카드" : "현금",
      카드수수료: i.card_fee,
      정산수수료: netCommission(i),
    }));
    const totalSupply = items.reduce((a, c) => a + c.supply, 0);
    const totalVat = items.reduce((a, c) => a + c.vat, 0);
    const totalTotal = items.reduce((a, c) => a + c.total, 0);
    const totalCardFee = items.reduce((a, c) => a + c.card_fee, 0);
    const totalNet = items.reduce((a, c) => a + netCommission(c), 0);
    data.push({
      마감일자: "",
      고객: "합계",
      품번: "",
      품명: "",
      수량: items.reduce((a, c) => a + c.quantity, 0),
      공급가: totalSupply,
      부가세: totalVat,
      합계: totalTotal,
      결제: "" as unknown as string,
      카드수수료: totalCardFee,
      정산수수료: totalNet,
    });

    const ws = XLSX.utils.json_to_sheet(data);
    // 컬럼 너비 자동 (대략)
    ws["!cols"] = [
      { wch: 12 },
      { wch: 24 },
      { wch: 16 },
      { wch: 22 },
      { wch: 6 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 6 },
      { wch: 12 },
      { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, month);
    XLSX.writeFile(wb, `정산_${repName}_${month}.xlsx`);
  }

  return (
    <div className="space-y-6">
      {/* 셀렉트 */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-3 text-sm">
        <label className="flex flex-col">
          <span className="mb-1 text-xs font-medium text-gray-600">조회 기간</span>
          <select
            value={view}
            onChange={(e) => setView(e.target.value)}
            className="rounded-md border px-2 py-1.5"
          >
            <option value={DEFAULT_VIEW}>이번달({currentMonth}) + 다음달({nextMonth})</option>
            <option value="__all__">전체 정산월</option>
            <option disabled>──────────</option>
            {allMonths.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <div className="text-xs text-gray-500">
          총 정산월: {allMonths.length}개
        </div>
      </div>

      {/* 카드 */}
      {cards.length === 0 ? (
        <div className="rounded-lg border bg-white p-10 text-center text-sm text-gray-500">
          정산 내역이 없습니다.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <div
              key={c.month}
              className={`rounded-lg border bg-white p-4 ${
                c.has_data ? "" : "opacity-60"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-gray-500">정산월</div>
                  <div className="font-mono text-lg font-semibold">{c.month}</div>
                </div>
                {c.has_data && (
                  <button
                    type="button"
                    onClick={() => downloadExcel(c.month)}
                    className="rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-100"
                  >
                    📥 엑셀
                  </button>
                )}
              </div>
              <div className="mt-2 text-sm text-gray-500">
                {c.sales_count}건 · 공급가 {formatKRW(c.total_supply)}
              </div>
              <div className="mt-1 text-xs text-gray-400">정산수수료</div>
              <div className="text-xl font-bold text-blue-700">
                {formatKRW(c.total_commission)}
              </div>
              {c.total_card_fee > 0 && (
                <div className="mt-0.5 text-xs text-gray-400">
                  카드수수료 {formatKRW(c.total_card_fee)} 차감 후
                </div>
              )}
              {!c.has_data && (
                <div className="mt-1 text-xs text-gray-400">정산 없음</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 세부 매출 — 선택된 월(들) */}
      {displayMonths.map((month) => {
        const items = allSales.filter((s) => s.settlement_month === month);
        if (items.length === 0) return null;
        const totalSupply = items.reduce((a, c) => a + c.supply, 0);
        const totalVat = items.reduce((a, c) => a + c.vat, 0);
        const totalCardFee = items.reduce((a, c) => a + c.card_fee, 0);
        const totalNet = items.reduce((a, c) => a + netCommission(c), 0);
        return (
          <section key={month} id={`m-${month}`} className="space-y-2">
            <div className="flex items-end justify-between">
              <h2 className="text-lg font-semibold">
                <span className="rounded bg-blue-100 px-2 py-0.5 font-mono text-blue-700">
                  {month}
                </span>{" "}
                정산 세부
              </h2>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>
                  {items.length}건 · 공급가 {formatKRW(totalSupply)} · 부가세{" "}
                  {formatKRW(totalVat)}
                  {totalCardFee > 0 && <> · 카드수수료 {formatKRW(totalCardFee)}</>}{" "}
                  · 정산수수료{" "}
                  <b className="text-blue-700">{formatKRW(totalNet)}</b>
                </span>
                <button
                  type="button"
                  onClick={() => downloadExcel(month)}
                  className="rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1 text-blue-700 hover:bg-blue-100"
                >
                  📥 엑셀 다운로드
                </button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-left font-medium uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-2 py-2">마감일자</th>
                    <th className="px-2 py-2">고객</th>
                    <th className="px-2 py-2">품번</th>
                    <th className="px-2 py-2">품명</th>
                    <th className="px-2 py-2 text-right">수량</th>
                    <th className="px-2 py-2 text-right">공급가</th>
                    <th className="px-2 py-2 text-right">부가세</th>
                    <th className="px-2 py-2 text-right">합계</th>
                    <th className="px-2 py-2 text-center">결제</th>
                    <th className="px-2 py-2 text-right">카드수수료</th>
                    <th className="px-2 py-2 text-right">정산수수료</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td className="px-2 py-1 font-mono">{i.closing_date}</td>
                      <td
                        className="px-2 py-1 max-w-[16rem] truncate"
                        title={i.customer}
                      >
                        {i.customer}
                      </td>
                      <td className="px-2 py-1 font-mono">{i.product_code}</td>
                      <td className="px-2 py-1">{i.product_name}</td>
                      <td className="px-2 py-1 text-right">{i.quantity}</td>
                      <td className="px-2 py-1 text-right">
                        {formatKRW(i.supply)}
                      </td>
                      <td className="px-2 py-1 text-right text-gray-500">
                        {formatKRW(i.vat)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatKRW(i.total)}
                      </td>
                      <td className="px-2 py-1 text-center">
                        {i.payment_method === "card" ? (
                          <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-700">
                            카드
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                            현금
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right text-gray-500">
                        {i.card_fee > 0 ? `-${formatKRW(i.card_fee)}` : "-"}
                      </td>
                      <td className="px-2 py-1 text-right font-medium text-blue-700">
                        {formatKRW(netCommission(i))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
