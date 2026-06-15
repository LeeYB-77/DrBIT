import { createClient } from "@/lib/supabase/server";
import { ProductCostsClient, type Cost, type SalesProduct } from "./ProductCostsClient";

export const dynamic = "force-dynamic";

function classify(code: string): "program" | "product" | null {
  const f = code.charAt(0).toUpperCase();
  if (f === "P") return "program";
  if (f === "M" || f === "H" || f === "S") return "product";
  return null;
}

export default async function ProductCostsPage() {
  const supabase = await createClient();

  const [costsRes, salesRes] = await Promise.all([
    supabase
      .from("product_costs")
      .select(
        "id, product_code, product_name, base_cost, cost, commission_rate_override, active, updated_at",
      )
      .order("product_code"),
    supabase
      .from("sales")
      .select("product_code, product_name, quantity, supply_amount"),
  ]);

  if (costsRes.error)
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        원가 조회 실패: {costsRes.error.message}
      </div>
    );

  const costs: Cost[] = (costsRes.data ?? []).map((c) => ({
    id: c.id,
    product_code: c.product_code,
    product_name: c.product_name,
    base_cost: c.base_cost === null ? Number(c.cost) : Number(c.base_cost),
    cost: Number(c.cost),
    commission_rate_override:
      c.commission_rate_override === null
        ? null
        : Number(c.commission_rate_override),
    active: c.active,
    updated_at: c.updated_at,
  }));

  // 매출에 등장한 상품(M/H/S) 품번 집계
  const productMap = new Map<
    string,
    {
      product_code: string;
      product_name: string;
      count: number;
      total_supply: number;
      total_quantity: number;
    }
  >();
  for (const s of salesRes.data ?? []) {
    if (classify(s.product_code) !== "product") continue;
    const v = productMap.get(s.product_code) ?? {
      product_code: s.product_code,
      product_name: s.product_name ?? "",
      count: 0,
      total_supply: 0,
      total_quantity: 0,
    };
    v.count += 1;
    v.total_supply += Number(s.supply_amount);
    v.total_quantity += s.quantity;
    if (!v.product_name && s.product_name) v.product_name = s.product_name;
    productMap.set(s.product_code, v);
  }

  const registered = new Set(costs.map((c) => c.product_code));
  const salesProducts: SalesProduct[] = Array.from(productMap.values())
    .map((p) => ({ ...p, registered: registered.has(p.product_code) }))
    .sort((a, b) => a.product_code.localeCompare(b.product_code));

  const missing = salesProducts.filter((p) => !p.registered);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">상품 원가 관리</h1>
        <p className="mt-1 text-sm text-gray-500">
          상품(M·H·S 시작) 품번의 단위당 원가를 관리합니다. <b>등록원가</b>를 입력하면
          <b> 적용원가 = 등록원가 + 5%</b>가 자동 계산되고, 수수료는{" "}
          <b>(공급가 − 적용원가) × 수수료율</b>로 산정됩니다. 프로그램(P)은 원가 영향 없음.{" "}
          <b>별도 수수료율</b>을 입력하면 카테고리율 대신 그 값이 우선 적용됩니다.
        </p>
      </div>

      <ProductCostsClient
        costs={costs}
        salesProducts={salesProducts}
        missing={missing}
      />
    </div>
  );
}
