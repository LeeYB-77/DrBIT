import { createClient } from "@/lib/supabase/server";
import { SalesFilter } from "./SalesFilter";
import { SalesTable, type SaleGroup, type SaleRow } from "./SalesTable";
import { formatKRW } from "@/lib/fmt";

export const dynamic = "force-dynamic";

type SearchParams = {
  month?: string;
  rep?: string;
  collected?: "yes" | "no" | "all";
  settled?: "yes" | "no" | "all";
};

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [monthsRes, repsRes] = await Promise.all([
    supabase
      .from("sales")
      .select("sales_month")
      .order("sales_month", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, name, role, active")
      .eq("active", true)
      .order("name"),
  ]);

  const allMonths = Array.from(
    new Set((monthsRes.data ?? []).map((r) => r.sales_month)),
  );
  const allReps = repsRes.data ?? [];

  const month = params.month ?? allMonths[0] ?? "";
  const rep = params.rep ?? "all";
  const collected = params.collected ?? "all";
  const settled = params.settled ?? "all";

  let q = supabase
    .from("sales")
    .select(
      `
      id, sales_month, closing_date, customer, customer_code,
      product_code, product_name, quantity, unit_price,
      supply_amount, vat, total_amount, project,
      rep_id, rep_name_raw,
      is_collected, collected_at,
      settlement_month, commission_amount,
      profiles:rep_id ( name )
    `,
    )
    .order("closing_date", { ascending: false })
    .order("customer")
    .order("product_code");

  if (month) q = q.eq("sales_month", month);
  if (rep === "unmatched") q = q.is("rep_id", null);
  else if (rep !== "all") q = q.eq("rep_id", rep);
  if (collected === "yes") q = q.eq("is_collected", true);
  if (collected === "no") q = q.eq("is_collected", false);
  if (settled === "yes") q = q.not("settlement_month", "is", null);
  if (settled === "no") q = q.is("settlement_month", null);

  const { data, error } = await q;
  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        조회 실패: {error.message}
      </div>
    );
  }

  // 행 정규화
  const rows: SaleRow[] = (data ?? []).map((r) => ({
    id: r.id,
    sales_month: r.sales_month,
    closing_date: r.closing_date,
    customer: r.customer,
    product_code: r.product_code,
    product_name: r.product_name,
    quantity: r.quantity,
    unit_price: Number(r.unit_price),
    supply_amount: Number(r.supply_amount),
    total_amount: Number(r.total_amount),
    rep_id: r.rep_id,
    rep_name:
      (r.profiles as { name?: string } | null)?.name ?? r.rep_name_raw ?? null,
    rep_matched: !!r.rep_id,
    is_collected: r.is_collected,
    collected_at: r.collected_at,
    settlement_month: r.settlement_month,
    commission_amount:
      r.commission_amount === null ? null : Number(r.commission_amount),
  }));

  // 그룹핑: customer + closing_date
  const groupMap = new Map<string, SaleGroup>();
  for (const r of rows) {
    const key = `${r.customer}__${r.closing_date}`;
    let g = groupMap.get(key);
    if (!g) {
      g = {
        key,
        customer: r.customer,
        closing_date: r.closing_date,
        sales_month: r.sales_month,
        rep_id: r.rep_id,
        rep_name: r.rep_name,
        rep_matched: r.rep_matched,
        total_quantity: 0,
        total_supply: 0,
        total_amount: 0,
        total_commission: 0,
        items: [],
        is_collected: "none",
        settlement_month: null,
      };
      groupMap.set(key, g);
    }
    g.items.push(r);
    g.total_quantity += r.quantity;
    g.total_supply += r.supply_amount;
    g.total_amount += r.total_amount;
    g.total_commission += r.commission_amount ?? 0;
  }

  // 그룹별 수금/정산 상태 결정
  for (const g of groupMap.values()) {
    const collectedCnt = g.items.filter((i) => i.is_collected).length;
    if (collectedCnt === g.items.length) g.is_collected = "all";
    else if (collectedCnt === 0) g.is_collected = "none";
    else g.is_collected = "partial";

    const months = new Set(g.items.map((i) => i.settlement_month));
    if (months.size === 1) g.settlement_month = g.items[0].settlement_month;
    else g.settlement_month = "partial";
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => {
    if (a.closing_date !== b.closing_date)
      return a.closing_date < b.closing_date ? 1 : -1;
    return a.customer.localeCompare(b.customer);
  });

  // 요약 (행 단위)
  const totals = rows.reduce(
    (acc, r) => ({
      count: acc.count + 1,
      supply: acc.supply + r.supply_amount,
      total: acc.total + r.total_amount,
      collected: acc.collected + (r.is_collected ? r.supply_amount : 0),
      uncollected: acc.uncollected + (r.is_collected ? 0 : r.supply_amount),
      commission: acc.commission + (r.commission_amount ?? 0),
    }),
    {
      count: 0,
      supply: 0,
      total: 0,
      collected: 0,
      uncollected: 0,
      commission: 0,
    },
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">매출 / 수금 관리</h1>
        <p className="mt-1 text-sm text-gray-500">
          같은 고객·같은 마감일자는 1건의 거래로 묶어 표시합니다. 수금 토글은
          거래 단위. 정산 확정된 매출은 수금 변경 불가.
        </p>
      </div>

      <SalesFilter
        currentMonth={month}
        currentRep={rep}
        currentCollected={collected}
        currentSettled={settled}
        months={allMonths}
        reps={allReps}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card
          label="거래 / 품번"
          value={`${groups.length} / ${totals.count}건`}
        />
        <Card label="공급가 합계" value={formatKRW(totals.supply)} />
        <Card
          label="수금 완료"
          value={formatKRW(totals.collected)}
          tone="green"
        />
        <Card
          label="미수금"
          value={formatKRW(totals.uncollected)}
          tone="amber"
        />
        <Card label="수수료 합계" value={formatKRW(totals.commission)} />
      </div>

      <SalesTable groups={groups} />
    </div>
  );
}

function Card({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "amber";
}) {
  const cls =
    tone === "green"
      ? "border-green-200 bg-green-50"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : "bg-white";
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}
