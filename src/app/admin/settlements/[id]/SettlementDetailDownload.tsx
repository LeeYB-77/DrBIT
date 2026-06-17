"use client";

// 스타일(폰트·색·테두리) 저장을 위해 SheetJS 스타일 지원 포크 사용.
// 무료판 "xlsx"는 셀 스타일을 기록하지 못한다.
import * as XLSX from "xlsx-js-style";

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

const HEADERS = [
  "마감일자",
  "고객",
  "고객코드",
  "품번",
  "품명",
  "수량",
  "단가",
  "공급가",
  "부가세",
  "합계",
  "단위당 원가",
  "원가 합계",
  "수익",
  "수수료율(%)",
  "수수료",
] as const;

const COL_WIDTHS = [12, 24, 10, 16, 22, 6, 12, 12, 12, 14, 12, 12, 12, 10, 12];

// 천 단위 콤마를 적용할 숫자 컬럼 인덱스 (수량 + 금액들). 수수료율(13)은 제외.
const NUMERIC_COLS = new Set([5, 6, 7, 8, 9, 10, 11, 12, 14]);
const NUM_FMT = "#,##0";

// ── 스타일 정의 ─────────────────────────────────────────────
const FONT = "맑은 고딕";
const BORDER_COLOR = "D0D7DE";
const thin = { style: "thin", color: { rgb: BORDER_COLOR } };
const ALL_BORDER = { top: thin, bottom: thin, left: thin, right: thin };

const headerStyle = {
  font: { name: FONT, sz: 11, bold: true, color: { rgb: "FFFFFF" } },
  fill: { patternType: "solid", fgColor: { rgb: "2563EB" } }, // blue-600
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: ALL_BORDER,
};

const cellTextStyle = {
  font: { name: FONT, sz: 10 },
  alignment: { vertical: "center" },
  border: ALL_BORDER,
};

const cellNumStyle = {
  font: { name: FONT, sz: 10 },
  alignment: { horizontal: "right", vertical: "center" },
  border: ALL_BORDER,
};

const totalTextStyle = {
  font: { name: FONT, sz: 10, bold: true },
  fill: { patternType: "solid", fgColor: { rgb: "DBEAFE" } }, // blue-100
  alignment: { vertical: "center" },
  border: ALL_BORDER,
};

const totalNumStyle = {
  font: { name: FONT, sz: 10, bold: true },
  fill: { patternType: "solid", fgColor: { rgb: "DBEAFE" } },
  alignment: { horizontal: "right", vertical: "center" },
  border: ALL_BORDER,
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

    // 본문 행 (헤더 순서와 동일)
    const dataRows = items.map((i) => [
      i.closing_date,
      i.customer,
      i.customer_code ?? "",
      i.product_code,
      i.product_name,
      i.quantity,
      i.unit_price,
      i.supply,
      i.vat,
      i.total,
      i.cost_per_unit,
      i.cost_amount,
      i.profit,
      Number((i.rate * 100).toFixed(2)),
      i.commission,
    ]);

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

    // 합계행: 단가/단위당 원가/수수료율은 빈칸
    const totalRow = [
      "",
      "합계",
      "",
      "",
      "",
      totals.qty,
      "",
      totals.supply,
      totals.vat,
      totals.total,
      "",
      totals.cost,
      totals.profit,
      "",
      totals.comm,
    ];

    const aoa = [HEADERS as unknown as (string | number)[], ...dataRows, totalRow];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = COL_WIDTHS.map((wch) => ({ wch }));

    const lastRow = aoa.length - 1; // 합계행 인덱스
    const lastCol = HEADERS.length - 1;

    // 행 높이: 헤더 살짝 높게
    ws["!rows"] = [{ hpt: 22 }];

    // 셀별 스타일/서식 적용
    for (let r = 0; r <= lastRow; r++) {
      const isHeader = r === 0;
      const isTotal = r === lastRow;
      for (let c = 0; c <= lastCol; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell) continue;
        const numeric = NUMERIC_COLS.has(c);

        if (isHeader) {
          cell.s = headerStyle;
        } else if (isTotal) {
          cell.s = numeric ? totalNumStyle : totalTextStyle;
        } else {
          cell.s = numeric ? cellNumStyle : cellTextStyle;
        }

        // 천 단위 콤마 (헤더 제외, 숫자 컬럼)
        if (!isHeader && numeric && cell.t === "n") {
          cell.z = NUM_FMT;
        }
      }
    }

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
