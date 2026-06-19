import { createClient } from "@/lib/supabase/server";
import { RepsTable } from "./RepsTable";
import { NewRepForm } from "./NewRepForm";

export const dynamic = "force-dynamic";

export default async function RepsPage() {
  const supabase = await createClient();
  const { data: reps, error } = await supabase
    .from("profiles")
    .select("id, name, agency_name, email, role, active, created_at")
    .order("role", { ascending: true })
    .order("name", { ascending: true });

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
        <h1 className="text-2xl font-bold">담당자 관리</h1>
        <p className="mt-1 text-sm text-gray-500">
          담당자 등록 + 역할·활성 관리. 이름은 엑셀 업로드 시 매칭 키입니다.
        </p>
      </div>

      <NewRepForm />

      <RepsTable reps={reps ?? []} />
    </div>
  );
}
