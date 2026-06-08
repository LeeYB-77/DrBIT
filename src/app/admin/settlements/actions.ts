"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type ProcessResult =
  | {
      ok: true;
      settlementMonth: string;
      processedCount: number;
      affectedReps: { rep_id: string; name: string; commission: number }[];
    }
  | { ok: false; error: string };

export type CancelResult =
  | { ok: true; canceledCount: number }
  | { ok: false; error: string };

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * 정산 확정.
 * - sale_ids 의 매출에 settlement_month, settled_at, settled_by, commission_rate_snapshot 박제
 * - commission_amount 는 트리거가 snapshot 으로 재계산
 * - 정산월의 settlements 행은 전체 재계산 (안전한 멱등 방식)
 */
export async function processSettlement(args: {
  saleIds: string[];
  settlementMonth: string;
}): Promise<ProcessResult> {
  const profile = await requireAdmin();

  if (!MONTH_PATTERN.test(args.settlementMonth)) {
    return {
      ok: false,
      error: "정산월은 YYYY-MM 형식이어야 합니다 (예: 2026-06).",
    };
  }
  if (!args.saleIds || args.saleIds.length === 0) {
    return { ok: false, error: "정산할 매출을 선택하세요." };
  }

  const supabase = await createClient();
  const adminCli = createAdminClient(); // settlements 갱신 시 RLS 우회 없이 사용 가능하지만 안전하게

  // 1. 대상 매출 조회 (이미 정산된 행 / 미수금 행 거부)
  const { data: salesRows, error: sErr } = await supabase
    .from("sales")
    .select(
      "id, product_code, supply_amount, rep_id, is_collected, settlement_month",
    )
    .in("id", args.saleIds);
  if (sErr) return { ok: false, error: `매출 조회 실패: ${sErr.message}` };

  const invalid = (salesRows ?? []).filter(
    (s) => !s.is_collected || s.settlement_month !== null,
  );
  if (invalid.length > 0) {
    return {
      ok: false,
      error: `선택한 ${invalid.length}건은 수금되지 않았거나 이미 정산된 매출입니다.`,
    };
  }

  // 2. 카테고리 → rate 매핑
  const { data: cats, error: cErr } = await supabase
    .from("commission_categories")
    .select("code, prefix_pattern, commission_rate")
    .eq("active", true);
  if (cErr)
    return { ok: false, error: `카테고리 조회 실패: ${cErr.message}` };

  const prefixToRate = new Map<string, number>();
  for (const c of cats ?? []) {
    const rate = Number(c.commission_rate);
    for (const p of String(c.prefix_pattern).toUpperCase().split(",")) {
      const t = p.trim();
      if (t) prefixToRate.set(t, rate);
    }
  }
  function rateOf(code: string): number {
    const first = code.charAt(0).toUpperCase();
    return prefixToRate.get(first) ?? 0;
  }

  // 3. rate별로 묶어서 bulk UPDATE
  const idsByRate = new Map<number, string[]>();
  for (const s of salesRows ?? []) {
    const r = rateOf(s.product_code);
    idsByRate.set(r, [...(idsByRate.get(r) ?? []), s.id]);
  }

  const now = new Date().toISOString();
  for (const [rate, ids] of idsByRate) {
    const { error: uErr } = await supabase
      .from("sales")
      .update({
        settlement_month: args.settlementMonth,
        settled_at: now,
        settled_by: profile.id,
        commission_rate_snapshot: rate,
      })
      .in("id", ids);
    if (uErr)
      return { ok: false, error: `정산 처리 실패: ${uErr.message}` };
  }

  // 4. 정산월의 settlements 행 전체 재계산
  await recalcSettlementsForMonth(args.settlementMonth, profile.id, adminCli);

  // 5. 담당자별 결과 집계
  const { data: results } = await supabase
    .from("sales")
    .select("rep_id, commission_amount, profiles:rep_id ( name )")
    .in("id", args.saleIds);

  const byRep = new Map<string, { name: string; commission: number }>();
  for (const r of results ?? []) {
    if (!r.rep_id) continue;
    const name = (r.profiles as { name?: string } | null)?.name ?? "(미상)";
    const prev = byRep.get(r.rep_id) ?? { name, commission: 0 };
    prev.commission += Number(r.commission_amount ?? 0);
    byRep.set(r.rep_id, prev);
  }

  // 6. audit log
  await supabase.from("audit_logs").insert({
    actor_id: profile.id,
    action: "settle",
    target_table: "sales",
    target_id: null,
    after: {
      settlement_month: args.settlementMonth,
      sale_ids: args.saleIds,
      count: args.saleIds.length,
    },
  });

  revalidatePath("/admin/settlements");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/reports");

  return {
    ok: true,
    settlementMonth: args.settlementMonth,
    processedCount: args.saleIds.length,
    affectedReps: Array.from(byRep.entries()).map(([rep_id, v]) => ({
      rep_id,
      name: v.name,
      commission: v.commission,
    })),
  };
}

/**
 * 담당자×정산월 단위 정산 취소.
 * - 해당 행들의 settlement_month, settled_at, settled_by, commission_rate_snapshot → NULL
 * - 트리거가 commission_amount 를 현재 rate 기준으로 재계산
 * - settlements 의 해당 (settlement_month, rep_id) 행 삭제, 잔여 행 재계산
 */
export async function cancelSettlement(args: {
  settlementMonth: string;
  repId: string;
}): Promise<CancelResult> {
  const profile = await requireAdmin();

  if (!MONTH_PATTERN.test(args.settlementMonth)) {
    return { ok: false, error: "정산월 형식이 올바르지 않습니다." };
  }

  const supabase = await createClient();
  const adminCli = createAdminClient();

  // 1. 대상 매출 조회 (before snapshot)
  const { data: beforeSales, error: bErr } = await supabase
    .from("sales")
    .select("id, supply_amount, commission_amount, commission_rate_snapshot")
    .eq("settlement_month", args.settlementMonth)
    .eq("rep_id", args.repId);
  if (bErr) return { ok: false, error: `조회 실패: ${bErr.message}` };

  if (!beforeSales || beforeSales.length === 0) {
    return { ok: false, error: "해당 정산 내역이 없습니다." };
  }

  // 2. sales UPDATE → 정산 필드 NULL (트리거가 commission_amount 재계산)
  const { error: uErr, count } = await supabase
    .from("sales")
    .update(
      {
        settlement_month: null,
        settled_at: null,
        settled_by: null,
        commission_rate_snapshot: null,
      },
      { count: "exact" },
    )
    .eq("settlement_month", args.settlementMonth)
    .eq("rep_id", args.repId);
  if (uErr) return { ok: false, error: `취소 실패: ${uErr.message}` };

  // 3. settlements 의 해당 행 삭제
  await supabase
    .from("settlements")
    .delete()
    .eq("settlement_month", args.settlementMonth)
    .eq("rep_id", args.repId);

  // 4. 다른 담당자 행은 그대로 (별도 재계산 불필요)

  // 5. audit log
  await supabase.from("audit_logs").insert({
    actor_id: profile.id,
    action: "unsettle",
    target_table: "settlements",
    target_id: null,
    before: {
      settlement_month: args.settlementMonth,
      rep_id: args.repId,
      sale_ids: beforeSales.map((s) => s.id),
      total_commission: beforeSales.reduce(
        (a, s) => a + Number(s.commission_amount ?? 0),
        0,
      ),
    },
  });

  // adminCli 미사용 시점 lint 회피
  void adminCli;

  revalidatePath("/admin/settlements");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/reports");

  return { ok: true, canceledCount: count ?? 0 };
}

/**
 * 특정 정산월의 settlements 행을 sales 합계로 재계산 (멱등).
 */
async function recalcSettlementsForMonth(
  settlementMonth: string,
  finalizedBy: string,
  adminCli: ReturnType<typeof createAdminClient>,
) {
  // 해당 월의 모든 정산된 sales 집계
  const { data: rows } = await adminCli
    .from("sales")
    .select("rep_id, supply_amount, commission_amount")
    .eq("settlement_month", settlementMonth);

  // rep_id 별 집계 (rep_id null 제외)
  const byRep = new Map<
    string,
    { supply: number; commission: number; count: number }
  >();
  for (const r of rows ?? []) {
    if (!r.rep_id) continue;
    const v = byRep.get(r.rep_id) ?? { supply: 0, commission: 0, count: 0 };
    v.supply += Number(r.supply_amount ?? 0);
    v.commission += Number(r.commission_amount ?? 0);
    v.count += 1;
    byRep.set(r.rep_id, v);
  }

  // 기존 행 삭제 후 새로 INSERT
  await adminCli
    .from("settlements")
    .delete()
    .eq("settlement_month", settlementMonth);

  const inserts = Array.from(byRep.entries()).map(([rep_id, v]) => ({
    settlement_month: settlementMonth,
    rep_id,
    total_supply_amount: v.supply,
    total_commission: v.commission,
    sales_count: v.count,
    finalized_by: finalizedBy,
  }));

  if (inserts.length > 0) {
    await adminCli.from("settlements").insert(inserts);
  }
}
