"use client";

import { useState, useTransition } from "react";
import { changePassword } from "./actions";

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (next !== confirm) {
      setError("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    startTransition(async () => {
      const r = await changePassword({
        currentPassword: current,
        newPassword: next,
      });
      if (!r.ok) {
        setError(r.error);
      } else {
        setSuccess(true);
        reset();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="cur-pw" className="text-xs font-medium text-gray-700">
          현재 비밀번호
        </label>
        <input
          id="cur-pw"
          type="password"
          required
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="new-pw" className="text-xs font-medium text-gray-700">
          새 비밀번호 <span className="text-gray-400">(8자 이상)</span>
        </label>
        <input
          id="new-pw"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="cf-pw" className="text-xs font-medium text-gray-700">
          새 비밀번호 확인
        </label>
        <input
          id="cf-pw"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-blue-500 ${
            confirm && next !== confirm ? "border-red-300" : ""
          }`}
        />
        {confirm && next !== confirm && (
          <div className="text-xs text-red-600">일치하지 않습니다.</div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          ✓ 비밀번호가 변경되었습니다.
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={pending || !current || !next || !confirm}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "변경 중..." : "비밀번호 변경"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
        >
          취소
        </button>
      </div>
    </form>
  );
}
