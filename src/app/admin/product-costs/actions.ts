"use server";

import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { parsePct } from "@/lib/fmt";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createOrUpdateCost(args: {
  product_code: string;
  product_name?: string;
  cost: number;
  commission_rate_override?: number | null;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const code = args.product_code.trim();
  if (!code) return { ok: false, error: "품번을 입력하세요." };
  if (!Number.isFinite(args.cost) || args.cost < 0)
    return { ok: false, error: "원가는 0 이상이어야 합니다." };

  let override: number | null = null;
  if (args.commission_rate_override !== null && args.commission_rate_override !== undefined) {
    if (
      !Number.isFinite(args.commission_rate_override) ||
      args.commission_rate_override < 0 ||
      args.commission_rate_override > 1
    ) {
      return {
        ok: false,
        error: "별도 수수료율은 0~100% 사이여야 합니다.",
      };
    }
    override = args.commission_rate_override;
  }

  const { error } = await supabase
    .from("product_costs")
    .upsert(
      {
        product_code: code,
        product_name: args.product_name?.trim() || null,
        cost: args.cost,
        commission_rate_override: override,
        active: true,
      },
      { onConflict: "product_code" },
    );

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/product-costs");
  revalidatePath("/admin/sales");
  return { ok: true };
}

export async function updateCostOverride(
  id: string,
  rateInput: string | null,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  let override: number | null = null;
  if (rateInput !== null && rateInput.trim() !== "") {
    const v = parsePct(rateInput);
    if (v === null || v < 0 || v > 1)
      return {
        ok: false,
        error: "별도 수수료율은 0~100% 사이여야 합니다.",
      };
    override = v;
  }

  const { error } = await supabase
    .from("product_costs")
    .update({ commission_rate_override: override })
    .eq("id", id);
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

export type UploadConflict = {
  product_code: string;
  chosen_cost: number;
  other_costs: number[];
};

export type UploadResult =
  | {
      ok: true;
      total_rows: number;
      processed: number;
      skipped: number;
      conflicts: UploadConflict[];
      samples: { code: string; cost: number }[];
    }
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
      const i = header.findIndex((h) => h.toLowerCase() === n.toLowerCase());
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
    return { ok: false, error: "'원가' / '단가' 컬럼이 필요합니다." };

  // 1차 파싱: 모든 행을 순회
  let totalRows = 0;
  let skipped = 0;
  const codeToBest = new Map<
    string,
    { product_name: string | null; cost: number; allCosts: number[] }
  >();

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r) continue;
    totalRows += 1;

    const code = String(r[codeIdx] ?? "").trim();
    if (!code) {
      skipped += 1;
      continue;
    }
    const costRaw = r[costIdx];
    const cost = Number(costRaw);
    if (!Number.isFinite(cost) || cost < 0) {
      skipped += 1;
      continue;
    }
    const name =
      nameIdx >= 0 ? String(r[nameIdx] ?? "").trim() || null : null;

    const existing = codeToBest.get(code);
    if (!existing) {
      codeToBest.set(code, {
        product_name: name,
        cost,
        allCosts: [cost],
      });
    } else {
      existing.allCosts.push(cost);
      // 같은 품번 중 최고가를 채택 (사용자 정책)
      if (cost > existing.cost) {
        existing.cost = cost;
        // 품명은 최고가 행의 것 또는 비어있지 않은 첫 값 우선
        if (name) existing.product_name = name;
      }
    }
  }

  if (codeToBest.size === 0) {
    return { ok: false, error: "유효 데이터가 없습니다." };
  }

  // 중복(다른 가격)이 있는 품번 추출
  const conflicts: UploadConflict[] = [];
  for (const [code, v] of codeToBest) {
    const uniqueCosts = Array.from(new Set(v.allCosts));
    if (uniqueCosts.length > 1) {
      conflicts.push({
        product_code: code,
        chosen_cost: v.cost,
        other_costs: uniqueCosts.filter((c) => c !== v.cost).sort((a, b) => b - a),
      });
    }
  }

  // upsert용 행 배열
  const rows = Array.from(codeToBest.entries()).map(([code, v]) => ({
    product_code: code,
    product_name: v.product_name,
    cost: v.cost,
    active: true,
  }));

  const supabase = await createClient();
  const { error } = await supabase
    .from("product_costs")
    .upsert(rows, { onConflict: "product_code" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/product-costs");
  revalidatePath("/admin/sales");

  return {
    ok: true,
    total_rows: totalRows,
    processed: rows.length,
    skipped,
    conflicts: conflicts.sort((a, b) =>
      a.product_code.localeCompare(b.product_code),
    ),
    samples: rows.slice(0, 5).map((r) => ({
      code: r.product_code,
      cost: r.cost,
    })),
  };
}
