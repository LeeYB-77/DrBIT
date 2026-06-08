"use client";

import { useState, useTransition } from "react";
import { commitUpload, parsePreview } from "./actions";
import type { CommitResult, PreviewResult } from "./types";
import { formatKRW } from "@/lib/fmt";

export function UploadClient() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [committed, setCommitted] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setFile(null);
    setPreview(null);
    setCommitted(null);
    setError(null);
  }

  function onParse() {
    if (!file) return;
    setError(null);
    setCommitted(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const r = await parsePreview(fd);
      if (!r.ok) {
        setError(r.error);
        setPreview(null);
      } else {
        setPreview(r.preview);
      }
    });
  }

  function onCommit() {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const r = await commitUpload(preview);
      if (!r.ok) setError(r.error);
      else setCommitted(r);
    });
  }

  return (
    <div className="space-y-4">
      {/* 1. 파일 선택 */}
      <div className="rounded-lg border bg-white p-4">
        <label className="block text-sm font-medium mb-2">
          엑셀 파일 선택 (.xlsx)
        </label>
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setCommitted(null);
              setError(null);
            }}
            className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-700"
          />
          <button
            type="button"
            onClick={onParse}
            disabled={!file || pending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {pending && !preview ? "파싱 중..." : "미리보기"}
          </button>
        </div>
        {file && (
          <div className="mt-2 text-xs text-gray-500">
            선택: {file.name} ({(file.size / 1024).toFixed(1)} KB)
          </div>
        )}
      </div>

      {/* 에러 */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 2. 미리보기 */}
      {preview && !committed && (
        <PreviewPanel
          preview={preview}
          onCommit={onCommit}
          onCancel={reset}
          pending={pending}
        />
      )}

      {/* 3. 완료 */}
      {committed && (
        <CommitPanel committed={committed} onReset={reset} />
      )}
    </div>
  );
}

function PreviewPanel({
  preview,
  onCommit,
  onCancel,
  pending,
}: {
  preview: PreviewResult;
  onCommit: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const hasBlockers = preview.warnings.length > 0;
  const hasWarnings =
    preview.unmatched_reps.length > 0 || preview.missing_products.length > 0;

  return (
    <div className="space-y-4">
      {/* 요약 */}
      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium mb-3">미리보기 요약</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Stat label="매출월" value={preview.sales_month} />
          <Stat label="행 수" value={`${preview.totals.count}건`} />
          <Stat label="공급가 합계" value={formatKRW(preview.totals.supply)} />
          <Stat label="합계 (VAT 포함)" value={formatKRW(preview.totals.total)} />
        </div>
      </div>

      {/* 경고 */}
      {(hasWarnings || hasBlockers) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2 text-sm">
          <div className="font-medium text-amber-900">⚠ 확인 필요</div>
          {preview.unmatched_reps.length > 0 && (
            <div>
              <span className="font-medium">매칭 안 되는 담당자</span> (rep_id=NULL 로 등록됨, 담당자 등록 후 자동 매칭):
              <div className="mt-1 flex flex-wrap gap-1">
                {preview.unmatched_reps.map((n) => (
                  <span
                    key={n}
                    className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-mono"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}
          {preview.missing_products.length > 0 && (
            <div>
              <span className="font-medium">분류 안 되는 품번</span> (P / M·H·S 외 prefix, 수수료율 0% 적용):
              <div className="mt-1 flex flex-wrap gap-1">
                {preview.missing_products.map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-mono"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          {preview.warnings.length > 0 && (
            <div>
              <span className="font-medium">파싱 경고</span>:
              <ul className="mt-1 list-disc pl-5 text-xs">
                {preview.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 행 테이블 */}
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-2 py-2">No</th>
              <th className="px-2 py-2">담당자</th>
              <th className="px-2 py-2">고객</th>
              <th className="px-2 py-2">마감일자</th>
              <th className="px-2 py-2">품번</th>
              <th className="px-2 py-2 text-right">수량</th>
              <th className="px-2 py-2 text-right">단가</th>
              <th className="px-2 py-2 text-right">공급가</th>
              <th className="px-2 py-2 text-right">합계</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {preview.rows.map((r) => (
              <tr key={r.rowIndex}>
                <td className="px-2 py-1 text-gray-500">{r.rowIndex}</td>
                <td className="px-2 py-1">
                  {r.rep_id ? (
                    <span>{r.rep_name_raw}</span>
                  ) : (
                    <span className="text-amber-700">
                      {r.rep_name_raw || "(빈값)"} ⚠
                    </span>
                  )}
                </td>
                <td className="px-2 py-1 max-w-xs truncate" title={r.customer}>
                  {r.customer}
                </td>
                <td className="px-2 py-1 font-mono">{r.closing_date}</td>
                <td className="px-2 py-1 font-mono">{r.product_code}</td>
                <td className="px-2 py-1 text-right">{r.quantity}</td>
                <td className="px-2 py-1 text-right">
                  {formatKRW(r.unit_price)}
                </td>
                <td className="px-2 py-1 text-right">
                  {formatKRW(r.supply_amount)}
                </td>
                <td className="px-2 py-1 text-right font-medium">
                  {formatKRW(r.total_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 확정 / 취소 */}
      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm text-gray-600 mb-3">
          확정하면 <span className="font-semibold">{preview.sales_month}</span>{" "}
          월의 <span className="font-semibold">미수금/미정산</span> 행은 삭제되고
          새 데이터로 교체됩니다. (수금/정산 완료된 행은 보존)
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCommit}
            disabled={pending}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {pending ? "처리 중..." : `확정 (${preview.rows.length}건 등록)`}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

function CommitPanel({
  committed,
  onReset,
}: {
  committed: CommitResult;
  onReset: () => void;
}) {
  if (!committed.ok) return null;
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-2 text-sm">
      <div className="font-medium text-green-900">✓ 업로드 완료</div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <div className="text-gray-600">신규 등록:</div>
        <div>{committed.inserted}건</div>
        <div className="text-gray-600">기존 미수금/미정산 삭제:</div>
        <div>{committed.deleted}건</div>
        <div className="text-gray-600">보존된 수금/정산 완료:</div>
        <div>{committed.preserved}건</div>
      </div>
      <div className="pt-2">
        <button
          type="button"
          onClick={onReset}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          다른 파일 업로드
        </button>
        <a
          href="/admin/sales"
          className="ml-2 rounded-md border px-3 py-1.5 text-sm hover:bg-white"
        >
          매출 목록 보기 →
        </a>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
