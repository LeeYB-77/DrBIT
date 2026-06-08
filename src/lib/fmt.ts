/**
 * 숫자 포맷터들.
 */

export const krw = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

export function formatKRW(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return "-";
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return "-";
  return krw.format(v);
}

/** 0.10 → "10.00%" */
export function formatPct(rate: number | string | null | undefined): string {
  if (rate === null || rate === undefined) return "-";
  const v = typeof rate === "string" ? Number(rate) : rate;
  if (!Number.isFinite(v)) return "-";
  return `${(v * 100).toFixed(2)}%`;
}

/** "10" / "10%" / "0.1" / "10.00%" 모두 → 0.10 (소수) */
export function parsePct(input: string): number | null {
  const cleaned = input.replace(/[%\s]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  // 1 초과면 백분율로 입력한 것으로 간주
  return n > 1 ? n / 100 : n;
}
