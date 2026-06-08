"use server";

import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createOrUpdateCost(args: {
  product_code: string;
  product_name?: string;
  cost: number;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const code = args.product_code.trim();
  if (!code) return { ok: false, error: "품번을 입력하세요." };
  if (!Number.isFinite(args.cost) || args.cost < 0)
    return { ok: false, error: "원가는 0 이상이어야 합니다." };

  const { error } = await supabase
    .from("product_costs")
    .upsert(
      {
        product_code: code,
        product_name: args.product_name?.trim() || null,
        cost: args.cost,
        active: true,
      },
      { onConflict: "product_code" },
    );

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/product-costs");
  revalidatePath("/admin/sales");
  return { ok: true };
}

export async function updateCost(
  id: string,
  cost: number,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  if (!Number.isFinite(cost) || cost < 0)
    return { ok: false, error: "원가는 0 이상이어야 합니다." };

  const { error } = await supabase
    .from("product_costs")
    .update({ cost })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/product-costs");
  revalidatePath("/admin/sales");
  return { ok: true };
}

export async function updateCostName(
  id: string,
  product_name: string,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("product_costs")
    .update({ product_name: product_name.trim() || null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/product-costs");
  return { ok: true };
}

export async function deleteCost(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("product_costs").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/product-costs");
  revalidatePath("/admin/sales");
  return { ok: true };
}

export type UploadResult =
  | { ok: true; processed: number; samples: { code: string; cost: number }[] }
  | { ok: false; error: string };

export async function uploadCosts(formData: FormData): Promise<UploadResult> {
  await requireAdmin();
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "파일이 없습니다." };

  let wb: XLSX.WorkBook;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    wb = XLSX.read(buffer);
  } catch (e) {
    return {
      ok: false,
      error: `파싱 실패: ${e instanceof Error ? e.message : "unknown"}`,
    };
  }

  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { ok: false, error: "시트가 없습니다." };

  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
  });
  if (data.length < 1) return { ok: false, error: "데이터가 없습니다." };

  // 헤더 매핑 (유연 매칭)
  const header = (data[0] ?? []).map((v) => String(v ?? "").trim());
  function findColumn(...names: string[]) {
    for (const n of names) {
      const i = header.findIndex(
        (h) => h.toLowerCase() === n.toLowerCase(),
      );
      if (i >= 0) return i;
    }
    return -1;
  }
  const codeIdx = findColumn("품번", "product_code", "code");
  const nameIdx = findColumn("품명", "product_name", "name");
  const costIdx = findColumn("원가", "cost", "단가");

  if (codeIdx === -1)
    return { ok: false, error: "'품번' 컬럼이 필요합니다." };
  if (costIdx === -1)
    return { ok: false, error: "'원가' 컬럼이 필요합니다." };

  const rows: {
    product_code: string;
    product_name: string | null;
    cost: number;
    active: boolean;
  }[] = [];
  const skipped: string[] = [];

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r) continue;
    const code = String(r[codeIdx] ?? "").trim();
    if (!code) continue;
    const name =
      nameIdx >= 0 ? String(r[nameIdx] ?? "").trim() || null : null;
    const costRaw = r[costIdx];
    const cost = Number(costRaw);
    if (!Number.isFinite(cost) || cost < 0) {
      skipped.push(`${code} (원가:${costRaw})`);
      continue;
    }
    rows.push({ product_code: code, product_name: name, cost, active: true });
  }

  if (rows.length === 0) {
    return {
      ok: false,
      error: `유효 데이터 없음.${skipped.length ? " 스킵: " + skipped.slice(0, 3).join(", ") : ""}`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("product_costs")
    .upsert(rows, { onConflict: "product_code" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/product-costs");
  revalidatePath("/admin/sales");

  return {
    ok: true,
    processed: rows.length,
    samples: rows.slice(0, 5).map((r) => ({
      code: r.product_code,
      cost: r.cost,
    })),
  };
}
