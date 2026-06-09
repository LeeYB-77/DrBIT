"use client";

import * as XLSX from "xlsx";

export type DetailItem = {
  id: string;
  closing_date: string;
  customer: string;
  customer_code: string | null;
  product_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  supply: number;
  vat: number;
  total: number;
  cost_per_unit: number;
  cost_amount: number;
  profit: number;
  rate: number;
  commission: number;
};

export function SettlementDetailDownload({
  repName,
  month,
  items,
}: {
  repName: string;
  month: string;
  items: DetailItem[];
}) {
  function download() {
    if (items.length === 0) {
      alert("매출 내역이 없습니다.");
      return;
    }
    const rows = items.map((i) => ({
      마감일자: i.closing_date,
      고객: i.customer,
      고객코드: i.customer_code ?? "",
      품번: i.product_code,
      품명: i.product_name,
      수량: i.quantity,
      단가: i.unit_price,
      공급가: i.supply,
      부가세: i.vat,
      합계: i.total,
      "단위당 원가": i.cost_per_unit,
      "원가 합계": i.cost_amount,
      수익: i.profit,
      "수수료율(%)": Number((i.rate * 100).toFixed(2)),
      수수료: i.commission,
    }));
    const totals = items.reduce(
      (acc, c) => ({
        qty: acc.qty + c.quantity,
        supply: acc.supply + c.supply,
        vat: acc.vat + c.vat,
        total: acc.total + c.total,
        cost: acc.cost + c.cost_amount,
        profit: acc.profit + c.profit,
        comm: acc.comm + c.commission,
      }),
      { qty: 0, supply: 0, vat: 0, total: 0, cost: 0, profit: 0, comm: 0 },
    );
    rows.push({
      마감일자: "",
      고객: "합계",
      고객코드: "",
      품번: "",
      품명: "",
      수량: totals.qty,
      단가: "" as unknown as number,
      공급가: totals.supply,
      부가세: totals.vat,
      합계: totals.total,
      "단위당 원가": "" as unknown as number,
      "원가 합계": totals.cost,
      수익: totals.profit,
      "수수료율(%)": "" as unknown as number,
      수수료: totals.comm,
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 12 },
      { wch: 24 },
      { wch: 10 },
      { wch: 16 },
      { wch: 22 },
      { wch: 6 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, month);
    XLSX.writeFile(wb, `정산_${repName}_${month}.xlsx`);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100"
    >
      📥 엑셀 다운로드
    </button>
  );
}
