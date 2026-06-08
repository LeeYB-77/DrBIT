import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { formatKRW } from "@/lib/fmt";

export const dynamic = "force-dynamic";

export default async function MySettlementsPage() {
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  // 1. 본인의 settlements 월별
  const { data: settlements } = await supabase
    .from("settlements")
    .select(
      "id, settlement_month, total_supply_amount, total_commission, sales_count, finalized_at",
    )
    .eq("rep_id", profile.id)
    .order("settlement_month", { ascending: false });

  // 2. 본인의 정산된 매출 전체 (월별로 묶을 수 있게)
  const { data: settledSales } = await supabase
    .from("sales")
    .select(
      `
      id, settlement_month, closing_date, customer, product_code, product_name,
      quantity, supply_amount, commission_rate_snapshot, commission_amount
    `,
    )
    .eq("rep_id", profile.id)
    .not("settlement_month", "is", null)
    .order("settlement_month", { ascending: false })
    .order("closing_date", { ascending: false });

  const salesByMonth = new Map<
    string,
    {
      month: string;
      items: {
        id: string;
        closing_date: string;
        customer: string;
        product_code: string;
        product_name: string;
        quantity: number;
        supply: number;
        rate: number;
        commission: number;
      }[];
    }
  >();
  for (const s of settledSales ?? []) {
    const m = s.settlement_month!;
    let g = salesByMonth.get(m);
    if (!g) {
      g = { month: m, items: [] };
      salesByMonth.set(m, g);
    }
    g.items.push({
      id: s.id,
      closing_date: s.closing_date,
      customer: s.customer,
      product_code: s.product_code,
      product_name: s.product_name,
      quantity: s.quantity,
      supply: Number(s.supply_amount),
      rate: Number(s.commission_rate_snapshot ?? 0),
      commission: Number(s.commission_amount ?? 0),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">내 정산 내역</h1>
        <p className="mt-1 text-sm text-gray-500">
          {profile.name}님의 월별 정산 수수료 내역입니다.
        </p>
      </div>

      {(!settlements || settlements.length === 0) && (
        <div className="rounded-lg border bg-white p-10 text-center text-sm text-gray-500">
          아직 정산된 내역이 없습니다.
        </div>
      )}

      {/* 월별 요약 카드 */}
      {settlements && settlements.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {settlements.map((s) => (
            <a
              key={s.id}
              href={`#m-${s.settlement_month}`}
              className="rounded-lg border bg-white p-4 hover:border-blue-300"
            >
              <div className="text-xs text-gray-500">정산월</div>
              <div className="font-mono text-lg font-semibold">
                {s.settlement_month}
              </div>
              <div className="mt-2 text-sm text-gray-500">
                {s.sales_count}건 · 공급가 {formatKRW(s.total_supply_amount)}
              </div>
              <div className="mt-1 text-lg font-bold text-blue-700">
                {formatKRW(s.total_commission)}
              </div>
            </a>
          ))}
        </div>
      )}

      {/* 월별 세부 매출 */}
      {Array.from(salesByMonth.values()).map((g) => {
        const totalSupply = g.items.reduce((a, i) => a + i.supply, 0);
        const totalCommission = g.items.reduce((a, i) => a + i.commission, 0);
        return (
          <section key={g.month} id={`m-${g.month}`} className="space-y-2">
            <div className="flex items-end justify-between">
              <h2 className="text-lg font-semibold">
                <span className="rounded bg-blue-100 px-2 py-0.5 font-mono text-blue-700">
                  {g.month}
                </span>{" "}
                정산 세부
              </h2>
              <div className="text-xs text-gray-500">
                {g.items.length}건 · 공급가 {formatKRW(totalSupply)} · 수수료{" "}
                <b className="text-blue-700">{formatKRW(totalCommission)}</b>
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
                    <th className="px-2 py-2 text-right">수수료율</th>
                    <th className="px-2 py-2 text-right">수수료</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {g.items.map((i) => (
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
                        {(i.rate * 100).toFixed(1)}%
                      </td>
                      <td className="px-2 py-1 text-right font-medium text-blue-700">
                        {formatKRW(i.commission)}
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
