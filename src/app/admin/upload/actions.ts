"use server";

import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type {
  CommitResult,
  ParseResult,
  ParsedRow,
  PreviewResult,
} from "./types";

const EXPECTED_HEADERS = [
  "No",
  "고객",
  "마감일자",
  "고객코드",
  "품번",
  "품명",
  "마감수량",
  "단가",
  "공급가",
  "부가세",
  "합계",
  "프로젝트",
  "담당자",
];

function parseDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return null;
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

export async function parsePreview(formData: FormData): Promise<ParseResult> {
  await requireAdmin();

  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "파일이 첨부되지 않았습니다." };

  const filename = file.name;
  const buffer = Buffer.from(await file.arrayBuffer());

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { cellDates: true });
  } catch (e) {
    return {
      ok: false,
      error: `엑셀 파싱 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"}`,
    };
  }

  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { ok: false, error: "시트가 없는 엑셀입니다." };

  const sheet = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
  });

  if (data.length < 2) return { ok: false, error: "데이터가 없습니다." };

  // 헤더 검증
  const header = data[0];
  for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
    const got = str(header[i]);
    if (got !== EXPECTED_HEADERS[i]) {
      return {
        ok: false,
        error: `엑셀 헤더 불일치: ${i + 1}번째 열은 '${EXPECTED_HEADERS[i]}' 여야 합니다. (현재: '${got}')`,
      };
    }
  }

  const warnings: string[] = [];
  const rows: ParsedRow[] = [];
  let lastCustomer = "";

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r || r.length === 0) continue;

    const no = r[0];
    const customerCell = r[1];
    const closing = r[2];
    const code = str(r[4]);
    const unitPrice = r[7];

    // No가 숫자가 아니면 합계 행 등 → 스킵
    if (typeof no !== "number") continue;
    // 품번이 없으면 소계 행 → 스킵
    if (!code) continue;
    // 단가가 비어있으면 소계 행 → 스킵
    if (unitPrice === undefined || unitPrice === null || unitPrice === "")
      continue;

    // 고객명 forward-fill
    let customer = "";
    const cellCustomer = str(customerCell);
    if (cellCustomer) {
      customer = cellCustomer;
      lastCustomer = customer;
    } else if (lastCustomer) {
      customer = lastCustomer;
    } else {
      warnings.push(`행 ${no}: 고객명을 결정할 수 없어 스킵`);
      continue;
    }

    const date = parseDate(closing);
    if (!date) {
      warnings.push(`행 ${no}: 마감일자가 올바르지 않음 (${String(closing)})`);
      continue;
    }

    rows.push({
      rowIndex: no,
      customer,
      closing_date: date,
      sales_month: date.slice(0, 7),
      customer_code: str(r[3]) || null,
      product_code: code,
      product_name: str(r[5]),
      quantity: num(r[6]),
      unit_price: num(r[7]),
      supply_amount: num(r[8]),
      vat: num(r[9]),
      total_amount: num(r[10]),
      project: str(r[11]) || null,
      rep_name_raw: str(r[12]),
      rep_id: null,
    });
  }

  if (rows.length === 0)
    return { ok: false, error: "유효한 매출 데이터가 없습니다." };

  // 매칭 — profiles, products 조회
  const supabase = await createClient();
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, name, active");
  if (pErr) return { ok: false, error: `담당자 조회 실패: ${pErr.message}` };

  const profileMap = new Map(
    (profiles ?? []).filter((p) => p.active).map((p) => [p.name, p.id]),
  );

  // 카테고리 prefix 매핑 (commission_categories에서 가져와 동적 분류)
  const { data: cats, error: catErr } = await supabase
    .from("commission_categories")
    .select("code, prefix_pattern, active");
  if (catErr)
    return { ok: false, error: `카테고리 조회 실패: ${catErr.message}` };

  // 첫 글자 → category code 맵
  const prefixToCategory = new Map<string, string>();
  for (const c of cats ?? []) {
    if (!c.active) continue;
    for (const p of String(c.prefix_pattern).toUpperCase().split(",")) {
      const trimmed = p.trim();
      if (trimmed) prefixToCategory.set(trimmed, c.code);
    }
  }

  function classify(code: string): string | null {
    const first = code.charAt(0).toUpperCase();
    return prefixToCategory.get(first) ?? null;
  }

  const unmatchedReps = new Set<string>();
  const unclassifiedCodes = new Set<string>();
  for (const row of rows) {
    if (row.rep_name_raw) {
      const id = profileMap.get(row.rep_name_raw);
      row.rep_id = id ?? null;
      if (!id) unmatchedReps.add(row.rep_name_raw);
    }
    if (!classify(row.product_code)) unclassifiedCodes.add(row.product_code);
  }

  // sales_month 결정 — 가장 많은 월
  const monthCounts = new Map<string, number>();
  for (const r of rows) {
    monthCounts.set(r.sales_month, (monthCounts.get(r.sales_month) ?? 0) + 1);
  }
  const sortedMonths = Array.from(monthCounts.entries()).sort(
    (a, b) => b[1] - a[1],
  );
  const sales_month = sortedMonths[0]?.[0] ?? "";

  if (sortedMonths.length > 1) {
    warnings.push(
      `여러 월이 섞여 있습니다 (${sortedMonths.map(([m, c]) => `${m}:${c}건`).join(", ")}). 가장 많은 ${sales_month}로 처리됩니다.`,
    );
  }

  const totals = rows.reduce(
    (acc, r) => ({
      count: acc.count + 1,
      supply: acc.supply + r.supply_amount,
      vat: acc.vat + r.vat,
      total: acc.total + r.total_amount,
    }),
    { count: 0, supply: 0, vat: 0, total: 0 },
  );

  const preview: PreviewResult = {
    filename,
    sales_month,
    rows,
    unmatched_reps: Array.from(unmatchedReps).sort(),
    missing_products: Array.from(unclassifiedCodes).sort(),
    warnings,
    totals,
  };

  return { ok: true, preview };
}

export async function commitUpload(
  preview: PreviewResult,
): Promise<CommitResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();

  if (!preview.rows || preview.rows.length === 0)
    return { ok: false, error: "업로드할 행이 없습니다." };
  if (!preview.sales_month)
    return { ok: false, error: "매출월이 결정되지 않았습니다." };

  // 1. 같은 sales_month의 미수금+미정산 행 삭제 (수금/정산 완료된 행은 보존)
  const { error: delError, count: deleted } = await supabase
    .from("sales")
    .delete({ count: "exact" })
    .eq("sales_month", preview.sales_month)
    .eq("is_collected", false)
    .is("settlement_month", null);

  if (delError) return { ok: false, error: `삭제 실패: ${delError.message}` };

  // 2. 보존된 행 수 (수금/정산된 행)
  const { count: preserved } = await supabase
    .from("sales")
    .select("*", { count: "exact", head: true })
    .eq("sales_month", preview.sales_month);

  // 3. upload_batches INSERT
  const { data: batch, error: batchError } = await supabase
    .from("upload_batches")
    .insert({
      sales_month: preview.sales_month,
      filename: preview.filename,
      row_count: preview.rows.length,
      uploaded_by: profile.id,
    })
    .select("id")
    .single();

  if (batchError)
    return { ok: false, error: `배치 생성 실패: ${batchError.message}` };

  // 4. sales bulk INSERT
  const insertData = preview.rows.map((r) => ({
    batch_id: batch.id,
    sales_month: r.sales_month,
    closing_date: r.closing_date,
    rep_id: r.rep_id,
    rep_name_raw: r.rep_name_raw || null,
    customer: r.customer,
    customer_code: r.customer_code,
    product_code: r.product_code,
    product_name: r.product_name,
    quantity: r.quantity,
    unit_price: r.unit_price,
    supply_amount: r.supply_amount,
    vat: r.vat,
    total_amount: r.total_amount,
    project: r.project,
  }));

  // upsert + ignoreDuplicates: 자연키 충돌 시 INSERT 안 함 (정산된 동일 매출 보호)
  // 자연키: closing_date,customer_code,product_code,quantity,unit_price
  const { data: insertedRows, error: insError } = await supabase
    .from("sales")
    .upsert(insertData, {
      onConflict: "closing_date,customer_code,product_code,quantity,unit_price",
      ignoreDuplicates: true,
    })
    .select("id");

  if (insError) {
    await supabase.from("upload_batches").delete().eq("id", batch.id);
    return { ok: false, error: `매출 INSERT 실패: ${insError.message}` };
  }

  const inserted = insertedRows?.length ?? 0;
  const skipped_duplicates = insertData.length - inserted;

  // 5. audit log
  await supabase.from("audit_logs").insert({
    actor_id: profile.id,
    action: "upload",
    target_table: "upload_batches",
    target_id: batch.id,
    after: {
      sales_month: preview.sales_month,
      filename: preview.filename,
      row_count: preview.rows.length,
      deleted: deleted ?? 0,
      inserted,
      skipped_duplicates,
      unmatched_reps: preview.unmatched_reps,
      unclassified_codes: preview.missing_products,
    },
  });

  revalidatePath("/admin/sales");
  revalidatePath("/admin/upload");

  return {
    ok: true,
    batch_id: batch.id,
    inserted,
    skipped_duplicates,
    deleted: deleted ?? 0,
    preserved: preserved ?? 0,
    missing_in_new_file: 0,
  };
}
