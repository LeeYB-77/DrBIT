"use client";

import { useState, useTransition } from "react";
import { formatPct, parsePct } from "@/lib/fmt";
import { updateCategoryRate } from "./actions";

type Category = {
  id: string;
  code: string;
  name: string;
  prefix_pattern: string;
  commission_rate: number | string;
  updated_at: string | null;
};

export function CategoriesTable({ categories }: { categories: Category[] }) {
  if (categories.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-10 text-center text-sm text-gray-500">
        등록된 카테고리가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3 w-32">카테고리</th>
            <th className="px-4 py-3">이름</th>
            <th className="px-4 py-3 w-40">Prefix 패턴</th>
            <th className="px-4 py-3 w-40">수수료율</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {categories.map((c) => (
            <CategoryRow key={c.id} category={c} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoryRow({ category }: { category: Category }) {
  const rateNum = Number(category.commission_rate);
  const [rateInput, setRateInput] = useState(formatPct(rateNum));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function saveRate() {
    const newPct = parsePct(rateInput);
    if (newPct === null || newPct === rateNum) {
      setRateInput(formatPct(rateNum));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateCategoryRate(category.id, rateInput);
      if (!result.ok) {
        setError(result.error);
        setRateInput(formatPct(rateNum));
      }
    });
  }

  return (
    <tr className={pending ? "opacity-50" : ""}>
      <td className="px-4 py-2">
        <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs">
          {category.code}
        </span>
      </td>
      <td className="px-4 py-2 font-medium">{category.name}</td>
      <td className="px-4 py-2 text-gray-600">
        <span className="font-mono text-xs">{category.prefix_pattern}</span>
        <span className="ml-1 text-xs text-gray-400">로 시작하는 품번</span>
      </td>
      <td className="px-4 py-2">
        <input
          value={rateInput}
          onChange={(e) => setRateInput(e.target.value)}
          onBlur={saveRate}
          className="w-32 rounded-md border border-transparent px-2 py-1 text-right hover:border-gray-300 focus:border-blue-500 focus:outline-none"
        />
        {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
      </td>
    </tr>
  );
}
