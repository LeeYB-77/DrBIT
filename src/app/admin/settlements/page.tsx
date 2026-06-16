import { createClient } from "@/lib/supabase/server";
import { PendingPanel, type PendingGroup } from "./PendingPanel";
import { HistoryPanel, type HistoryRow } from "./HistoryPanel";

export const dynamic = "force-dynamic";

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; rep?: string }>;
}) {
  const { source, rep: repParam } = await searchParams;
  const supabase = await createClient();

  // 1. 매출월 / 담당자 옵션
  const [monthsRes, repsRes] = await Promise.all([
    supabase
      .from("sales")
      .select("sales_month")
      .order("sales_month", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, name, active")
      .eq("active", true)
      .order("name"),
  ]);
  const allMonths = Array.from(
    new Set((monthsRes.data ?? []).map((r) => r.sales_month)),
  );
  const allReps = (repsRes.data ?? []).map((r) => ({ id: r.id, name: r.name }));

  // 초기값: 매출월 전체(all). 월 상관없이 정산 대상 전체를 보여준다.
  const sourceMonth = source ?? "all";
  const rep = repParam ?? "all";

  // 2. "수금완료 + 미정산" 매출 조회 (정산 대상). 매출월/담당자 필터 선택 적용.
  let q = supabase
    .from("sales")
    .select(
      `
      id, sales_month, closing_date, customer, product_code, product_name,
      quantity, supply_amount, commission_amount,
      rep_id, rep_name_raw,
      profiles:rep_id ( name )
    `,
    )
    .eq("is_collected", true)
    .is("settlement_month", null)
    .order("closing_date", { ascending: false });

  if (sourceMonth !== "all") q = q.eq("sales_month", sourceMonth);
  if (rep === "unmatched") q = q.is("rep_id", null);
  else if (rep !== "all") q = q.eq("rep_id", rep);

  const { data: pending, error: pErr } = await q;
  if (pErr) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        조회 실패: {pErr.message}
      </div>
    );
  }

  // 거래(고객+마감일자) 단위 그룹핑
  const map = new Map<string, PendingGroup>();
  for (const r of pending ?? []) {
    const key = `${r.customer}__${r.closing_date}`;
    let g = map.get(key);
    const repName =
      (r.profiles as { name?: string } | null)?.name ?? r.rep_name_raw;
    if (!g) {
      g = {
        key,
        customer: r.customer,
        closing_date: r.closing_date,
        rep_id: r.rep_id,
        rep_name: repName,
        rep_matched: !!r.rep_id,
        item_count: 0,
        total_supply: 0,
        total_commission: 0,
        items: [],
      };
      map.set(key, g);
    }
    g.items.push({
      id: r.id,
      product_code: r.product_code,
      product_name: r.product_name,
      quantity: r.quantity,
      supply_amount: Number(r.supply_amount),
      commission_amount: Number(r.commission_amount ?? 0),
    });
    g.item_count += 1;
    g.total_supply += Number(r.supply_amount);
    g.total_commission += Number(r.commission_amount ?? 0);
  }
  const pendingGroups: PendingGroup[] = Array.from(map.values()).sort((a, b) => {
    if (a.closing_date !== b.closing_date)
      return a.closing_date < b.closing_date ? 1 : -1;
    return a.customer.localeCompare(b.customer);
  });

  // 3. 정산 이력 (settlements + profiles)
  const { data: history } = await supabase
    .from("settlements")
    .select(
      "id, settlement_month, rep_id, total_supply_amount, total_commission, sales_count, finalized_at, profiles:rep_id ( name )",
    )
    .order("settlement_month", { ascending: false })
    .order("finalized_at", { ascending: false });

  const historyRows: HistoryRow[] = (history ?? []).map((r) => ({
    id: r.id,
    settlement_month: r.settlement_month,
    rep_id: r.rep_id,
    rep_name: (r.profiles as { name?: string } | null)?.name ?? "(미상)",
    total_supply: Number(r.total_supply_amount),
    total_commission: Number(r.total_commission),
    sales_count: r.sales_count,
    finalized_at: r.finalized_at,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">정산 처리</h1>
        <p className="mt-1 text-sm text-gray-500">
          수금 완료된 미정산 매출을 선택하고 정산월(수수료 지급월)을 지정하여
          확정합니다.
        </p>
      </div>

      <PendingPanel
        sourceMonth={sourceMonth}
        availableMonths={allMonths}
        currentRep={rep}
        availableReps={allReps}
        groups={pendingGroups}
      />

      <HistoryPanel rows={historyRows} />
    </div>
  );
}
