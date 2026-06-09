"use client";

import { useRef, useState, useTransition } from "react";
import { formatKRW, formatPct, parsePct } from "@/lib/fmt";
import {
  createOrUpdateCost,
  deleteCost,
  updateCost,
  updateCostName,
  updateCostOverride,
  uploadCosts,
  type UploadConflict,
} from "./actions";

export type Cost = {
  id: string;
  product_code: string;
  product_name: string | null;
  cost: number;
  commission_rate_override: number | null;
  active: boolean;
  updated_at: string | null;
};

export type SalesProduct = {
  product_code: string;
  product_name: string;
  count: number;
  total_supply: number;
  total_quantity: number;
  registered: boolean;
};

export function ProductCostsClient({
  costs,
  salesProducts,
  missing,
}: {
  costs: Cost[];
  salesProducts: SalesProduct[];
  missing: SalesProduct[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadReport, setUploadReport] = useState<{
    total: number;
    processed: number;
    skipped: number;
    conflicts: UploadConflict[];
  } | null>(null);
  const [draftCode, setDraftCode] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftCost, setDraftCost] = useState("");
  const [draftOverride, setDraftOverride] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function notice(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 4000);
  }

  function onCreate() {
    setError(null);
    setSuccess(null);
    const cost = Number(draftCost.replaceAll(",", ""));
    const override = draftOverride.trim() === "" ? null : parsePct(draftOverride);
    if (draftOverride.trim() !== "" && (override === null || override < 0 || override > 1)) {
      setError("별도 수수료율은 0~100% 사이여야 합니다.");
      return;
    }
    startTransition(async () => {
      const r = await createOrUpdateCost({
        product_code: draftCode,
        product_name: draftName || undefined,
        cost,
        commission_rate_override: override,
      });
      if (!r.ok) setError(r.error);
      else {
        notice(`${draftCode} 등록/업데이트 완료`);
        setDraftCode("");
        setDraftName("");
        setDraftCost("");
        setDraftOverride("");
      }
    });
  }

  function fillFromMissing(p: SalesProduct) {
    setDraftCode(p.product_code);
    setDraftName(p.product_name);
    setDraftCost("");
    setError(null);
    setSuccess(null);
    document.getElementById("draft-cost")?.focus();
  }

  function onUpload(file: File) {
    setError(null);
    setSuccess(null);
    setUploadReport(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const r = await uploadCosts(fd);
      if (!r.ok) {
        setError(r.error);
      } else {
        setUploadReport({
          total: r.total_rows,
          processed: r.processed,
          skipped: r.skipped,
          conflicts: r.conflicts,
        });
        notice(
          `엑셀 ${r.total_rows}행 처리 → 유니크 ${r.processed}품번 등록/업데이트${
            r.conflicts.length > 0
              ? ` (중복 ${r.conflicts.length}건은 최고가 채택)`
              : ""
          }`,
        );
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  return (
    <div className="space-y-6">
      {/* 1. 수동 등록 / 빠른 입력 */}
      <section className="rounded-lg border bg-white p-4 space-y-3">
        <div className="text-sm font-medium">새 원가 등록 / 수정</div>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr_1fr_auto]">
          <input
            value={draftCode}
            onChange={(e) => setDraftCode(e.target.value)}
            placeholder="품번 (예: MH0103-AT003)"
            className="rounded-md border px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="품명 (선택)"
            className="rounded-md border px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <input
            id="draft-cost"
            value={draftCost}
            onChange={(e) => setDraftCost(e.target.value)}
            placeholder="원가"
            className="rounded-md border px-3 py-2 text-sm text-right outline-none focus:border-blue-500"
          />
          <input
            value={draftOverride}
            onChange={(e) => setDraftOverride(e.target.value)}
            placeholder="별도 수수료율(선택)"
            className="rounded-md border px-3 py-2 text-sm text-right outline-none focus:border-blue-500"
          />
          <button
            onClick={onCreate}
            disabled={pending || !draftCode || !draftCost}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "처리 중..." : "저장"}
          </button>
        </div>
        <div className="text-xs text-gray-500">
          별도 수수료율을 입력하면 카테고리율 대신 이 값이 적용됩니다 (예:{" "}
          <code>15</code> 또는 <code>15%</code>). 비우면 카테고리율 사용.
        </div>
      </section>

      {/* 2. 엑셀 업로드 */}
      <section className="rounded-lg border bg-white p-4 space-y-2">
        <div className="text-sm font-medium">엑셀로 일괄 업로드</div>
        <div className="text-xs text-gray-500">
          엑셀 컬럼: <b>품번</b>, <b>품명</b>(선택), <b>원가</b> (또는{" "}
          <b>단가</b>). 같은 품번이 여러 번 등장하면{" "}
          <b>가장 비싼 가격</b>이 채택됩니다.
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          disabled={pending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
          }}
          className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-700 disabled:opacity-50"
        />
      </section>

      {/* 업로드 결과 상세 */}
      {uploadReport && (
        <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-medium text-blue-900">📥 업로드 결과</div>
            <button
              onClick={() => setUploadReport(null)}
              className="text-xs text-blue-700 hover:underline"
            >
              닫기
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-md bg-white p-2">
              <div className="text-gray-500">엑셀 전체 행</div>
              <div className="text-lg font-semibold">{uploadReport.total}</div>
            </div>
            <div className="rounded-md bg-white p-2">
              <div className="text-gray-500">유니크 품번</div>
              <div className="text-lg font-semibold text-blue-700">
                {uploadReport.processed}
              </div>
            </div>
            <div className="rounded-md bg-white p-2">
              <div className="text-gray-500">스킵 (잘못된 행)</div>
              <div className="text-lg font-semibold text-gray-600">
                {uploadReport.skipped}
              </div>
            </div>
          </div>

          {uploadReport.conflicts.length > 0 && (
            <div>
              <div className="font-medium text-blue-900 mb-1">
                ⚖ 같은 품번에 다른 가격 발견: {uploadReport.conflicts.length}건
                <span className="ml-1 text-xs font-normal text-gray-600">
                  (최고가가 등록됨)
                </span>
              </div>
              <div className="overflow-x-auto rounded-md border bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-left font-medium uppercase text-gray-500">
                    <tr>
                      <th className="px-2 py-1">품번</th>
                      <th className="px-2 py-1 text-right">채택된 가격</th>
                      <th className="px-2 py-1">대안 가격(들)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {uploadReport.conflicts.map((c) => (
                      <tr key={c.product_code}>
                        <td className="px-2 py-1 font-mono">
                          {c.product_code}
                        </td>
                        <td className="px-2 py-1 text-right font-semibold text-blue-700">
                          {formatKRW(c.chosen_cost)}
                        </td>
                        <td className="px-2 py-1 text-gray-500">
                          {c.other_costs.map((v) => formatKRW(v)).join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 p-2 text-sm text-green-700">
          ✓ {success}
        </div>
      )}

      {/* 3. 미등록 알림 */}
      {missing.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
          <div className="text-sm font-medium text-amber-900">
            ⚠ 매출에 있지만 원가가 등록되지 않은 상품 품번: {missing.length}개
          </div>
          <div className="text-xs text-amber-800">
            원가 미등록 시 해당 매출의 수수료는 공급가 전체 × 수수료율로
            계산됩니다.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left font-medium text-amber-900">
                <tr>
                  <th className="px-2 py-1">품번</th>
                  <th className="px-2 py-1">품명</th>
                  <th className="px-2 py-1 text-right">매출 건수</th>
                  <th className="px-2 py-1 text-right">공급가 합</th>
                  <th className="px-2 py-1 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-200">
                {missing.map((p) => (
                  <tr key={p.product_code}>
                    <td className="px-2 py-1 font-mono">{p.product_code}</td>
                    <td className="px-2 py-1">{p.product_name}</td>
                    <td className="px-2 py-1 text-right">{p.count}</td>
                    <td className="px-2 py-1 text-right">
                      {formatKRW(p.total_supply)}
                    </td>
                    <td className="px-2 py-1">
                      <button
                        onClick={() => fillFromMissing(p)}
                        className="rounded-md bg-amber-200 px-2 py-0.5 text-xs hover:bg-amber-300"
                      >
                        등록
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 4. 등록된 원가 테이블 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">등록된 원가 ({costs.length})</h2>
        </div>
        {costs.length === 0 ? (
          <div className="rounded-lg border bg-white p-10 text-center text-sm text-gray-500">
            아직 등록된 원가가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">품번</th>
                  <th className="px-3 py-2">품명</th>
                  <th className="px-3 py-2 text-right w-40">원가</th>
                  <th className="px-3 py-2 text-right w-40">별도 수수료율</th>
                  <th className="px-3 py-2 w-20">삭제</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {costs.map((c) => (
                  <CostRow key={c.id} cost={c} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-xs text-gray-500">
          원가 수정 시 해당 품번의 미정산 매출이 자동 재계산됩니다. 정산된
          매출은 영향 없음.
        </div>
      </section>
    </div>
  );
}

function CostRow({ cost }: { cost: Cost }) {
  const [name, setName] = useState(cost.product_name ?? "");
  const [costInput, setCostInput] = useState(formatKRW(cost.cost));
  const [overrideInput, setOverrideInput] = useState(
    cost.commission_rate_override === null
      ? ""
      : formatPct(cost.commission_rate_override),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function saveName() {
    if ((name || null) === (cost.product_name ?? null)) return;
    startTransition(async () => {
      const r = await updateCostName(cost.id, name);
      if (!r.ok) {
        setError(r.error);
        setName(cost.product_name ?? "");
      }
    });
  }

  function saveCost() {
    const n = Number(costInput.replaceAll(",", "").trim());
    if (!Number.isFinite(n) || n === cost.cost) {
      setCostInput(formatKRW(cost.cost));
      return;
    }
    startTransition(async () => {
      const r = await updateCost(cost.id, n);
      if (!r.ok) {
        setError(r.error);
        setCostInput(formatKRW(cost.cost));
      }
    });
  }

  function saveOverride() {
    const trimmed = overrideInput.trim();
    const newVal = trimmed === "" ? null : parsePct(trimmed);
    if (newVal === cost.commission_rate_override) return;
    startTransition(async () => {
      const r = await updateCostOverride(cost.id, trimmed || null);
      if (!r.ok) {
        setError(r.error);
        setOverrideInput(
          cost.commission_rate_override === null
            ? ""
            : formatPct(cost.commission_rate_override),
        );
      }
    });
  }

  function onDelete() {
    if (!window.confirm(`${cost.product_code} 원가를 삭제하시겠어요?`)) return;
    startTransition(async () => {
      const r = await deleteCost(cost.id);
      if (!r.ok) setError(r.error);
    });
  }

  const hasOverride = cost.commission_rate_override !== null;

  return (
    <tr className={pending ? "opacity-50" : ""}>
      <td className="px-3 py-2 font-mono text-xs">{cost.product_code}</td>
      <td className="px-3 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          className="w-full rounded-md border border-transparent px-2 py-1 hover:border-gray-300 focus:border-blue-500 focus:outline-none"
        />
        {error && <div className="text-xs text-red-600">{error}</div>}
      </td>
      <td className="px-3 py-2 text-right">
        <input
          value={costInput}
          onChange={(e) => setCostInput(e.target.value)}
          onBlur={saveCost}
          className="w-32 rounded-md border border-transparent px-2 py-1 text-right hover:border-gray-300 focus:border-blue-500 focus:outline-none"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <input
          value={overrideInput}
          onChange={(e) => setOverrideInput(e.target.value)}
          onBlur={saveOverride}
          placeholder="(카테고리율)"
          className={`w-32 rounded-md border border-transparent px-2 py-1 text-right hover:border-gray-300 focus:border-blue-500 focus:outline-none ${
            hasOverride ? "font-semibold text-purple-700" : "text-gray-400"
          }`}
          title={
            hasOverride
              ? "별도 수수료율 적용 중"
              : "비어있으면 카테고리율 사용"
          }
        />
      </td>
      <td className="px-3 py-2">
        <button
          onClick={onDelete}
          disabled={pending}
          className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          삭제
        </button>
      </td>
    </tr>
  );
}
