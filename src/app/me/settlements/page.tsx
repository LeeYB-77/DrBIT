import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { MySettlementsClient, type SettlementSummary, type SaleItem } from "./MySettlementsClient";

export const dynamic = "force-dynamic";

function monthsAroundToday() {
  // server-side current date. Vercel은 UTC 기준이지만 한국 시간으로 보정
  // KST 보정: UTC+9
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1~12
  function fmt(yy: number, mm: number) {
    return `${yy}-${String(mm).padStart(2, "0")}`;
  }
  const current = fmt(y, m);
  const next = m === 12 ? fmt(y + 1, 1) : fmt(y, m + 1);
  return { current, next };
}

export default async function MySettlementsPage() {
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  const [summaryRes, salesRes] = await Promise.all([
    supabase
      .from("settlements")
      .select(
        "id, settlement_month, total_supply_amount, total_commission, total_card_fee, sales_count, finalized_at",
      )
      .eq("rep_id", profile.id)
      .order("settlement_month", { ascending: false }),
    supabase
      .from("sales")
      .select(
        `
        id, settlement_month, closing_date, customer, product_code, product_name,
        quantity, supply_amount, vat, total_amount,
        payment_method, card_fee, commission_amount
      `,
      )
      .eq("rep_id", profile.id)
      .not("settlement_month", "is", null)
      .order("settlement_month", { ascending: false })
      .order("closing_date", { ascending: false }),
  ]);

  const summaries: SettlementSummary[] = (summaryRes.data ?? []).map((s) => ({
    id: s.id,
    settlement_month: s.settlement_month,
    total_supply: Number(s.total_supply_amount),
    total_commission: Number(s.total_commission),
    total_card_fee: Number(s.total_card_fee ?? 0),
    sales_count: s.sales_count,
    finalized_at: s.finalized_at,
  }));

  const allSales: SaleItem[] = (salesRes.data ?? []).map((s) => ({
    id: s.id,
    settlement_month: s.settlement_month!,
    closing_date: s.closing_date,
    customer: s.customer,
    product_code: s.product_code,
    product_name: s.product_name,
    quantity: s.quantity,
    supply: Number(s.supply_amount),
    vat: Number(s.vat ?? 0),
    total: Number(s.total_amount ?? 0),
    payment_method: (s.payment_method ?? "cash") as "cash" | "card",
    card_fee: Number(s.card_fee ?? 0),
    commission: Number(s.commission_amount ?? 0),
  }));

  const { current, next } = monthsAroundToday();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">내 정산 내역</h1>
        <p className="mt-1 text-sm text-gray-500">
          {(profile as { agency_name?: string | null }).agency_name ?? profile.name}님의 월별 정산 수수료. 기본은 이번 달({current})과 다음
          달({next}) 정산 내역을 표시합니다.
        </p>
      </div>

      <MySettlementsClient
        summaries={summaries}
        allSales={allSales}
        currentMonth={current}
        nextMonth={next}
        repName={(profile as { agency_name?: string | null }).agency_name ?? profile.name}
      />
    </div>
  );
}
