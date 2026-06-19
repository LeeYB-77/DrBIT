import { createClient } from "@/lib/supabase/server";
import { CardFeeForm } from "./CardFeeForm";

export const dynamic = "force-dynamic";

export default async function CardFeePage() {
  const supabase = await createClient();

  const [{ data: setting, error }, { count }] = await Promise.all([
    supabase
      .from("app_settings")
      .select("value, updated_at")
      .eq("key", "card_fee_rate")
      .maybeSingle(),
    // 현재 적용 대상(미정산 카드 매출) 건수
    supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("payment_method", "card")
      .is("settlement_month", null),
  ]);

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        조회 실패: {error.message}
      </div>
    );
  }

  const rate = Number(setting?.value ?? 0.033);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">카드수수료율</h1>
        <p className="mt-1 text-sm text-gray-500">
          카드로 수금한 매출은 결제총액(공급가+부가세)에 이 비율을 곱한 금액을
          카드수수료로 정산수수료에서 차감합니다. 변경 시 미정산 카드 매출이 즉시
          재계산됩니다. (이미 정산 확정된 건은 당시 값으로 유지)
        </p>
      </div>

      <CardFeeForm
        rate={rate}
        updatedAt={setting?.updated_at ?? null}
        pendingCardCount={count ?? 0}
      />

      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <div className="font-medium">계산 예시</div>
        <ul className="mt-1 list-disc pl-5">
          <li>결제총액 1,430,000원 · 카드수수료율 3.3% → 카드수수료 47,190원</li>
          <li>정산수수료 = 수수료 − 카드수수료</li>
        </ul>
      </div>
    </div>
  );
}
