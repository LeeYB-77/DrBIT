/**
 * 원가 인상률 — 등록원가(base_cost) → 적용원가(cost) 변환에 사용.
 *
 * 적용원가 = round(등록원가 × COST_MARKUP).
 * 적용원가가 매출 수수료 계산((공급가 − 적용원가×수량) × 수수료율)에 쓰인다.
 *
 * 엑셀 업로드 / 수동 키인 모두 동일하게 적용된다.
 */
export const COST_MARKUP = 1.05;
export const COST_MARKUP_PCT = Math.round((COST_MARKUP - 1) * 100); // 5

/** 등록원가 → 적용원가 (반올림) */
export function appliedCost(baseCost: number): number {
  return Math.round(baseCost * COST_MARKUP);
}

/** 적용원가 → 등록원가 (역산, 표시/백필용) */
export function baseFromApplied(applied: number): number {
  return Math.round(applied / COST_MARKUP);
}
