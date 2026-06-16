"use client";

import { useRouter, usePathname } from "next/navigation";

type Rep = { id: string; name: string };

export function SalesFilter({
  currentMonth,
  currentRep,
  currentCollected,
  currentSettled,
  months,
  reps,
}: {
  currentMonth: string;
  currentRep: string;
  currentCollected: string;
  currentSettled: string;
  months: string[];
  reps: Rep[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  function go(updates: Record<string, string>) {
    const params = new URLSearchParams();
    const next = { month: currentMonth, rep: currentRep, collected: currentCollected, settled: currentSettled, ...updates };
    // 기본값(매출월 all, 수금 no)과 다를 수 있으므로 값이 있으면 항상 직렬화한다.
    // ("all" 을 생략하면 기본값으로 되돌아가 버려 '전체' 선택이 무력화됨)
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-3 text-sm">
      <Field label="매출월">
        <select
          value={currentMonth}
          onChange={(e) => go({ month: e.target.value })}
          className="rounded-md border px-2 py-1.5"
        >
          <option value="all">전체</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>
      <Field label="담당자">
        <select
          value={currentRep}
          onChange={(e) => go({ rep: e.target.value })}
          className="rounded-md border px-2 py-1.5"
        >
          <option value="all">전체</option>
          <option value="unmatched">⚠ 미매칭</option>
          {reps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="수금">
        <select
          value={currentCollected}
          onChange={(e) => go({ collected: e.target.value })}
          className="rounded-md border px-2 py-1.5"
        >
          <option value="all">전체</option>
          <option value="yes">수금완료</option>
          <option value="no">미수금</option>
        </select>
      </Field>
      <Field label="정산">
        <select
          value={currentSettled}
          onChange={(e) => go({ settled: e.target.value })}
          className="rounded-md border px-2 py-1.5"
        >
          <option value="all">전체</option>
          <option value="yes">정산완료</option>
          <option value="no">미정산</option>
        </select>
      </Field>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <label className="mb-1 text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}
