import { createClient } from "@/lib/supabase/server";
import { CategoriesTable } from "./CategoriesTable";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const supabase = await createClient();
  const { data: categories, error } = await supabase
    .from("commission_categories")
    .select("id, code, name, prefix_pattern, commission_rate, updated_at")
    .order("code", { ascending: true });

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        조회 실패: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">수수료 카테고리</h1>
        <p className="mt-1 text-sm text-gray-500">
          품번 첫 글자(prefix)에 따라 분류된 두 카테고리의 수수료율을 관리합니다.
          변경 시 해당 카테고리의 미정산 매출이 즉시 재계산됩니다.
        </p>
      </div>

      <CategoriesTable categories={categories ?? []} />

      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <div className="font-medium">분류 규칙</div>
        <ul className="mt-1 list-disc pl-5">
          <li>
            품번 첫 글자가 <span className="font-mono">P</span> → <b>프로그램</b>
          </li>
          <li>
            품번 첫 글자가 <span className="font-mono">M / H / S</span> →{" "}
            <b>상품</b>
          </li>
          <li>그 외 prefix → 미분류 (수수료율 0% 적용)</li>
        </ul>
      </div>
    </div>
  );
}
