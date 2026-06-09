import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatKRW } from "@/lib/fmt";
import { SettlementDetailDownload, type DetailItem } from "./SettlementDetailDownload";

export const dynamic = "force-dynamic";

export default async function SettlementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: settlement, error } = await supabase
    .from("settlements")
    .select(
      `
      id, settlement_month, rep_id,
      total_supply_amount, total_commission, sales_count,
      finalized_at,
      profiles:rep_id ( name, email )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error)
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        조회 실패: {error.message}
      </div>
    );
  if (!settlement) notFound();

  const repName =
    (settlement.profiles as { name?: string } | null)?.name ?? "(미상)";
  const repEmail =
    (settlement.profiles as { email?: string } | null)?.email ?? "-";

  // 해당 정산월 + 담당자의 매출 매기 행 조회
  const { data: sales } = await supabase
    .from("sales")
    .select(
      `
      id, closing_date, customer, customer_code,
      product_code, product_name, quantity, unit_price, supply_amount,
      vat, total_amount,
      cost_per_unit, cost_amount, profit_amount,
      commission_rate_snapshot, commission_amount
    `,
    )
    .eq("settlement_month", settlement.settlement_month)
    .eq("rep_id", settlement.rep_id)
    .order("closing_date", { ascending: false })
    .order("customer");

  const items: DetailItem[] = (sales ?? []).map((s) => ({
    id: s.id,
    closing_date: s.closing_date,
    customer: s.customer,
    customer_code: s.customer_code,
    product_code: s.product_code,
    product_name: s.product_name,
    quantity: s.quantity,
    unit_price: Number(s.unit_price),
    supply: Number(s.supply_amount),
    vat: Number(s.vat),
    total: Number(s.total_amount),
    cost_per_unit: Number(s.cost_per_unit ?? 0),
    cost_amount: Number(s.cost_amount ?? 0),
    profit: Number(s.profit_amount ?? s.supply_amount),
    rate: Number(s.commission_rate_snapshot ?? 0),
    commission: Number(s.commission_amount ?? 0),
  }));

  // 거래(고객+마감일자) 단위 그룹핑
  type Group = {
    key: string;
    customer: string;
    closing_date: string;
    items: DetailItem[];
    totalSupply: number;
    totalProfit: number;
    totalCommission: number;
  };
  const groupMap = new Map<string, Group>();
  for (const i of items) {
    const k = `${i.customer}__${i.closing_date}`;
    let g = groupMap.get(k);
    if (!g) {
      g = {
        key: k,
        customer: i.customer,
        closing_date: i.closing_date,
        items: [],
        totalSupply: 0,
        totalProfit: 0,
        totalCommission: 0,
      };
      groupMap.set(k, g);
    }
    g.items.push(i);
    g.totalSupply += i.supply;
    g.totalProfit += i.profit;
    g.totalCommission += i.commission;
  }
  const groups = Array.from(groupMap.values()).sort((a, b) => {
    if (a.closing_date !== b.closing_date)
      return a.closing_date < b.closing_date ? 1 : -1;
    return a.customer.localeCompare(b.customer);
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/settlements"
          className="text-sm text-blue-600 hover:underline"
        >
          ← 정산 처리로
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          {repName} · {settlement.settlement_month} 정산 상세
        </h1>
        <div className="mt-1 text-sm text-gray-500">
          {repEmail} · 확정일{" "}
          {new Date(settlement.finalized_at).toLocaleString("ko-KR", {
            hour12: false,
          })}
        </div>
      </div>

      {/* 요약 + 다운로드 */}
      <div className="rounded-lg border bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <Stat label="매출 건수" value={`${items.length}건`} />
            <Stat label="공급가 합계" value={formatKRW(settlement.total_supply_amount)} />
            <Stat
              label="수익 합계"
              value={formatKRW(items.reduce((a, i) => a + i.profit, 0))}
            />
            <Stat
              label="수수료 합계"
              value={formatKRW(settlement.total_commission)}
              tone="blue"
            />
          </div>
          <SettlementDetailDownload
            repName={repName}
            month={settlement.settlement_month}
            items={items}
          />
        </div>
      </div>

      {/* 거래 단위 표 */}
      {groups.length === 0 ? (
        <div className="rounded-lg border bg-white p-10 text-center text-sm text-gray-500">
          매출 내역이 없습니다.
        </div>
      ) : (
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
                <th className="px-2 py-2 text-right">원가</th>
                <th className="px-2 py-2 text-right">수익</th>
                <th className="px-2 py-2 text-right">수수료율</th>
                <th className="px-2 py-2 text-right">수수료</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {groups.map((g) => (
                <GroupBlock key={g.key} group={g} />
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-semibold">
              <tr>
                <td className="px-2 py-2" colSpan={5}>
                  합계 ({items.length}건)
                </td>
                <td className="px-2 py-2 text-right">
                  {formatKRW(Number(settlement.total_supply_amount))}
                </td>
                <td className="px-2 py-2 text-right text-gray-600">
                  {formatKRW(items.reduce((a, i) => a + i.cost_amount, 0))}
                </td>
                <td className="px-2 py-2 text-right">
                  {formatKRW(items.reduce((a, i) => a + i.profit, 0))}
                </td>
                <td></td>
                <td className="px-2 py-2 text-right text-blue-700">
                  {formatKRW(Number(settlement.total_commission))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function GroupBlock({
  group: g,
}: {
  group: {
    key: string;
    customer: string;
    closing_date: string;
    items: DetailItem[];
    totalSupply: number;
    totalProfit: number;
    totalCommission: number;
  };
}) {
  return (
    <>
      {g.items.map((i, idx) => (
        <tr key={i.id} className={idx === 0 ? "" : "text-gray-500"}>
          <td className="px-2 py-1 font-mono">
            {idx === 0 ? i.closing_date : ""}
          </td>
          <td
            className="px-2 py-1 max-w-[16rem] truncate"
            title={g.customer}
          >
            {idx === 0 ? g.customer : ""}
            {idx === 0 && g.items.length > 1 && (
              <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                {g.items.length}품번
              </span>
            )}
          </td>
          <td className="px-2 py-1 font-mono">{i.product_code}</td>
          <td className="px-2 py-1">{i.product_name}</td>
          <td className="px-2 py-1 text-right">{i.quantity}</td>
          <td className="px-2 py-1 text-right">{formatKRW(i.supply)}</td>
          <td className="px-2 py-1 text-right text-gray-500">
            {i.cost_amount > 0 ? formatKRW(i.cost_amount) : "-"}
          </td>
          <td className="px-2 py-1 text-right">{formatKRW(i.profit)}</td>
          <td className="px-2 py-1 text-right text-gray-500">
            {(i.rate * 100).toFixed(2)}%
          </td>
          <td className="px-2 py-1 text-right font-medium text-blue-700">
            {formatKRW(i.commission)}
          </td>
        </tr>
      ))}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "blue";
}) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div
        className={`text-sm font-semibold ${tone === "blue" ? "text-blue-700" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
