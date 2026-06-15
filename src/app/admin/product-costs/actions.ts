"use server";

import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { parsePct } from "@/lib/fmt";
import { COST_MARKUP_PCT, appliedCost } from "@/lib/cost";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * 원가 등록/수정.
 * - `cost` 인자는 등록원가(base_cost)다.
 * - 적용원가(cost 컬럼) = round(등록원가 × 1.05) 로 자동 계산해 함께 저장한다.
 */
export async function createOrUpdateCost(args: {
  product_code: string;
  product_name?: string;
  cost: number; // 등록원가
  commission_rate_override?: number | null;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const code = args.product_code.trim();
  if (!code) return { ok: false, error: "품번을 입력하세요." };
  if (!Number.isFinite(args.cost) || args.cost < 0)
    return { ok: false, error: "등록원가는 0 이상이어야 합니다." };

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
        base_cost: args.cost,
        cost: appliedCost(args.cost),
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

/**
 * 등록원가 인라인 수정. `baseCost` = 등록원가.
 * 적용원가(cost) = round(등록원가 × 1.05) 함께 갱신.
 */
export async function updateCost(
  id: string,
  baseCost: number,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  if (!Number.isFinite(baseCost) || baseCost < 0)
    return { ok: false, error: "등록원가는 0 이상이어야 합니다." };

  const { error } = await supabase
    .from("product_costs")
    .update({ base_cost: baseCost, cost: appliedCost(baseCost) })
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
  chosen_cost: number; // 인상 후 가격
  chosen_raw: number; // 엑셀 원본 가격 (인상 전)
  other_costs: number[]; // 엑셀 원본 다른 가격들 (인상 전)
};

export type UploadResult =
  | {
      ok: true;
      total_rows: number;
      processed: number;
      skipped: number;
      markup_pct: number;
      conflicts: UploadConflict[];
      samples: { code: string; cost: number; raw: number }[];
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

  // 1차 파싱: 모든 행을 순회 (raw cost = 인상 전 가격)
  let totalRows = 0;
  let skipped = 0;
  const codeToBest = new Map<
    string,
    { product_name: string | null; rawCost: number; allRawCosts: number[] }
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
        rawCost: cost,
        allRawCosts: [cost],
      });
    } else {
      existing.allRawCosts.push(cost);
      // 같은 품번 중 최고가(raw 기준)를 채택
      if (cost > existing.rawCost) {
        existing.rawCost = cost;
        if (name) existing.product_name = name;
      }
    }
  }

  if (codeToBest.size === 0) {
    return { ok: false, error: "유효 데이터가 없습니다." };
  }

  // 중복(다른 가격)이 있는 품번 추출 (등록원가 + 적용원가 모두 보고)
  const conflicts: UploadConflict[] = [];
  for (const [code, v] of codeToBest) {
    const uniqueRaws = Array.from(new Set(v.allRawCosts));
    if (uniqueRaws.length > 1) {
      conflicts.push({
        product_code: code,
        chosen_cost: appliedCost(v.rawCost),
        chosen_raw: v.rawCost,
        other_costs: uniqueRaws
          .filter((c) => c !== v.rawCost)
          .sort((a, b) => b - a),
      });
    }
  }

  // upsert용 행 배열 — 엑셀 원가는 등록원가, 적용원가 = round(등록원가 × 1.05)
  const rows = Array.from(codeToBest.entries()).map(([code, v]) => ({
    product_code: code,
    product_name: v.product_name,
    base_cost: v.rawCost,
    cost: appliedCost(v.rawCost),
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
    markup_pct: COST_MARKUP_PCT,
    conflicts: conflicts.sort((a, b) =>
      a.product_code.localeCompare(b.product_code),
    ),
    samples: rows.slice(0, 5).map((r) => {
      const code = r.product_code;
      const raw = codeToBest.get(code)!.rawCost;
      return { code, cost: r.cost, raw };
    }),
  };
}
