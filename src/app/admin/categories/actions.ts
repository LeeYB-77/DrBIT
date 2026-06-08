"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { parsePct } from "@/lib/fmt";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateCategoryRate(
  id: string,
  rateInput: string,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const rate = parsePct(rateInput);
  if (rate === null || rate < 0 || rate > 1)
    return { ok: false, error: "수수료율은 0~100% 사이여야 합니다." };

  // 트리거가 미정산 매출 commission_amount 자동 재계산
  const { error } = await supabase
    .from("commission_categories")
    .update({ commission_rate: rate })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/categories");
  return { ok: true };
}
