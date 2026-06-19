"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type PaymentMethod = "cash" | "card";

export async function toggleSaleCollected(
  id: string,
  collected: boolean,
  paymentMethod: PaymentMethod = "cash",
): Promise<ActionResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();

  // 정산된 매출은 수금 상태 변경 불가
  const { data: row, error: getErr } = await supabase
    .from("sales")
    .select("settlement_month, is_collected")
    .eq("id", id)
    .single();
  if (getErr) return { ok: false, error: getErr.message };
  if (row.settlement_month) {
    return {
      ok: false,
      error: "이미 정산 확정된 매출은 수금 상태를 변경할 수 없습니다.",
    };
  }

  const { error } = await supabase
    .from("sales")
    .update({
      is_collected: collected,
      collected_at: collected ? new Date().toISOString() : null,
      collected_by: collected ? profile.id : null,
      // 수금 취소 시 결제수단을 현금으로 되돌려 카드수수료를 0으로 재계산
      payment_method: collected ? paymentMethod : "cash",
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/sales");
  return { ok: true };
}

export async function bulkToggleCollected(
  ids: string[],
  collected: boolean,
  paymentMethod: PaymentMethod = "cash",
): Promise<{ ok: true; affected: number } | { ok: false; error: string }> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  if (ids.length === 0) return { ok: true, affected: 0 };

  // 정산되지 않은 행만 업데이트
  const { error, count } = await supabase
    .from("sales")
    .update(
      {
        is_collected: collected,
        collected_at: collected ? new Date().toISOString() : null,
        collected_by: collected ? profile.id : null,
        payment_method: collected ? paymentMethod : "cash",
      },
      { count: "exact" },
    )
    .in("id", ids)
    .is("settlement_month", null);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/sales");
  return { ok: true, affected: count ?? 0 };
}
