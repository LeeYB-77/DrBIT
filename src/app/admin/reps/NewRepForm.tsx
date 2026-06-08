"use client";

import { useState, useTransition } from "react";
import { createRep } from "./actions";

export function NewRepForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    email: string;
    tempPassword: string;
  } | null>(null);

  async function onSubmit(formData: FormData) {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const r = await createRep(formData);
      if (!r.ok) {
        setError(r.error);
      } else {
        setResult({ email: r.email, tempPassword: r.tempPassword });
        const form = document.getElementById("new-rep-form") as HTMLFormElement;
        form?.reset();
      }
    });
  }

  function copyTempPassword() {
    if (!result) return;
    navigator.clipboard.writeText(result.tempPassword);
  }

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="text-sm font-medium">신규 담당자 등록</div>

      <form id="new-rep-form" action={onSubmit}>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto_auto]">
          <input
            name="name"
            required
            placeholder="이름 (예: 박상수)"
            className="rounded-md border px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <input
            name="email"
            type="email"
            required
            placeholder="이메일"
            className="rounded-md border px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <select
            name="role"
            defaultValue="rep"
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="rep">담당자</option>
            <option value="admin">관리자</option>
          </select>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "등록 중..." : "등록"}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <div className="font-medium">
            ✓ 등록 완료 — 아래 정보를 담당자에게 전달하세요.
          </div>
          <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <div className="text-gray-600">이메일:</div>
            <div className="font-mono">{result.email}</div>
            <div className="text-gray-600">임시 비밀번호:</div>
            <div className="font-mono">
              {result.tempPassword}{" "}
              <button
                onClick={copyTempPassword}
                className="ml-2 rounded border border-green-300 bg-white px-2 py-0.5 text-xs hover:bg-green-100"
              >
                복사
              </button>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-600">
            첫 로그인 후 비밀번호 변경을 안내해 주세요. (이 메시지는 새로고침하면 사라집니다)
          </div>
        </div>
      )}
    </div>
  );
}
