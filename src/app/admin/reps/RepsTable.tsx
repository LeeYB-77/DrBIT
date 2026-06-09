"use client";

import { useState, useTransition } from "react";
import {
  deleteRep,
  toggleRepActive,
  updateRepName,
  updateRepRole,
} from "./actions";

type Rep = {
  id: string;
  name: string;
  email: string | null;
  role: "admin" | "rep";
  active: boolean;
  created_at: string;
};

export function RepsTable({ reps }: { reps: Rep[] }) {
  if (reps.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-10 text-center text-sm text-gray-500">
        등록된 담당자가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3">이름 (엑셀 매칭 키)</th>
            <th className="px-4 py-3">이메일</th>
            <th className="px-4 py-3 w-32">역할</th>
            <th className="px-4 py-3 w-24">상태</th>
            <th className="px-4 py-3 w-20">삭제</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {reps.map((r) => (
            <RepRow key={r.id} rep={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RepRow({ rep }: { rep: Rep }) {
  const [name, setName] = useState(rep.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function saveName() {
    if (name === rep.name) return;
    setError(null);
    startTransition(async () => {
      const result = await updateRepName(rep.id, name);
      if (!result.ok) {
        setError(result.error);
        setName(rep.name);
      }
    });
  }

  function toggleActive() {
    setError(null);
    startTransition(async () => {
      const result = await toggleRepActive(rep.id, !rep.active);
      if (!result.ok) setError(result.error);
    });
  }

  function changeRole(role: "admin" | "rep") {
    if (role === rep.role) return;
    setError(null);
    startTransition(async () => {
      const result = await updateRepRole(rep.id, role);
      if (!result.ok) setError(result.error);
    });
  }

  function onDelete() {
    if (
      !window.confirm(
        `${rep.name}님의 계정을 완전히 삭제하시겠어요?\n\n매출/정산 이력이 있으면 거부됩니다. 그 경우 '비활성' 토글을 사용하세요.`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await deleteRep(rep.id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <tr className={pending ? "opacity-50" : ""}>
      <td className="px-4 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          className="w-full rounded-md border border-transparent px-2 py-1 hover:border-gray-300 focus:border-blue-500 focus:outline-none"
        />
        {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
      </td>
      <td className="px-4 py-2 text-gray-600">{rep.email ?? "-"}</td>
      <td className="px-4 py-2">
        <select
          value={rep.role}
          onChange={(e) => changeRole(e.target.value as "admin" | "rep")}
          disabled={pending}
          className="rounded-md border px-2 py-1 text-sm"
        >
          <option value="admin">관리자</option>
          <option value="rep">담당자</option>
        </select>
      </td>
      <td className="px-4 py-2">
        <button
          onClick={toggleActive}
          disabled={pending}
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            rep.active
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {rep.active ? "활성" : "비활성"}
        </button>
      </td>
      <td className="px-4 py-2">
        <button
          onClick={onDelete}
          disabled={pending}
          className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          title="auth.users + profiles 완전 삭제. 매출/정산 이력 있으면 거부됨."
        >
          삭제
        </button>
      </td>
    </tr>
  );
}
