"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { parsePct } from "@/lib/fmt";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateCardFeeRate(
  rateInput: string,
): Promise<ActionResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const rate = parsePct(rateInput);
  if (rate === null || rate < 0 || rate > 1)
    return { ok: false, error: "카드수수료율은 0~100% 사이여야 합니다." };

  // 트리거가 미정산 카드 매출의 card_fee 를 자동 재계산
  const { error } = await supabase
    .from("app_settings")
    .update({ value: rate, updated_at: new Date().toISOString(), updated_by: profile.id })
    .eq("key", "card_fee_rate");

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/card-fee");
  revalidatePath("/admin/sales");
  return { ok: true };
}
