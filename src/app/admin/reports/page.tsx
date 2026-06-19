import { createClient } from "@/lib/supabase/server";
import { formatKRW } from "@/lib/fmt";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const supabase = await createClient();

  const { data: settlements, error } = await supabase
    .from("settlements")
    .select(
      "settlement_month, rep_id, total_supply_amount, total_commission, total_card_fee, sales_count, finalized_at, profiles:rep_id ( name )",
    )
    .order("settlement_month", { ascending: false });

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        조회 실패: {error.message}
      </div>
    );
  }

  // 월별 그룹핑
  const byMonth = new Map<
    string,
    {
      month: string;
      rows: {
        rep_id: string;
        rep_name: string;
        sales_count: number;
        supply: number;
        commission: number;
      }[];
      totalSupply: number;
      totalCommission: number;
      totalCount: number;
    }
  >();

  for (const s of settlements ?? []) {
    const m = s.settlement_month;
    let g = byMonth.get(m);
    if (!g) {
      g = {
        month: m,
        rows: [],
        totalSupply: 0,
        totalCommission: 0,
        totalCount: 0,
      };
      byMonth.set(m, g);
    }
    const repName =
      (s.profiles as { name?: string } | null)?.name ?? "(미상)";
    const supply = Number(s.total_supply_amount);
    // 정산수수료(순액) = 수수료 − 카드수수료
    const commission = Number(s.total_commission) - Number(s.total_card_fee ?? 0);
    g.rows.push({
      rep_id: s.rep_id!,
      rep_name: repName,
      sales_count: s.sales_count,
      supply,
      commission,
    });
    g.totalSupply += supply;
    g.totalCommission += commission;
    g.totalCount += s.sales_count;
  }

  // 정산월 내 담당자 정렬
  for (const g of byMonth.values()) {
    g.rows.sort((a, b) => b.commission - a.commission);
  }

  const months = Array.from(byMonth.values());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">정산 리포트</h1>
        <p className="mt-1 text-sm text-gray-500">
          정산월별 담당자 수수료 합계
        </p>
      </div>

      {months.length === 0 ? (
        <div className="rounded-lg border bg-white p-10 text-center text-sm text-gray-500">
          아직 정산 내역이 없습니다.
        </div>
      ) : (
        <div className="space-y-6">
          {months.map((g) => (
            <section key={g.month} className="space-y-2">
              <div className="flex items-end justify-between">
                <h2 className="text-lg font-semibold">
                  <span className="rounded bg-blue-100 px-2 py-0.5 font-mono text-blue-700">
                    {g.month}
                  </span>
                </h2>
                <div className="text-xs text-gray-500">
                  {g.rows.length}명 · {g.totalCount}건 · 공급가{" "}
                  {formatKRW(g.totalSupply)} · 정산수수료{" "}
                  <b className="text-blue-700">{formatKRW(g.totalCommission)}</b>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2">담당자</th>
                      <th className="px-3 py-2 text-right w-24">건수</th>
                      <th className="px-3 py-2 text-right w-36">공급가 합</th>
                      <th className="px-3 py-2 text-right w-36">정산수수료</th>
                      <th className="px-3 py-2 text-right w-24">비율</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {g.rows.map((r) => {
                      const pct =
                        g.totalCommission > 0
                          ? (r.commission / g.totalCommission) * 100
                          : 0;
                      return (
                        <tr key={r.rep_id}>
                          <td className="px-3 py-2 font-medium">
                            {r.rep_name}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {r.sales_count}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {formatKRW(r.supply)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-blue-700">
                            {formatKRW(r.commission)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-gray-500">
                            {pct.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 text-sm font-semibold">
                    <tr>
                      <td className="px-3 py-2">합계</td>
                      <td className="px-3 py-2 text-right">{g.totalCount}</td>
                      <td className="px-3 py-2 text-right">
                        {formatKRW(g.totalSupply)}
                      </td>
                      <td className="px-3 py-2 text-right text-blue-700">
                        {formatKRW(g.totalCommission)}
                      </td>
                      <td className="px-3 py-2 text-right">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
