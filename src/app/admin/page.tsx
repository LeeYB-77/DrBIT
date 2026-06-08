import Link from "next/link";

const CARDS = [
  { href: "/admin/categories", title: "수수료 카테고리", desc: "프로그램(P) / 상품(M,H,S) 수수료율" },
  { href: "/admin/reps", title: "담당자 관리", desc: "담당자 등록 / 활성·비활성" },
  { href: "/admin/upload", title: "매출 엑셀 업로드", desc: "매출현황.xlsx 업로드 + 미리보기" },
  { href: "/admin/sales", title: "매출/수금 관리", desc: "매출 한 건씩 수금 체크" },
  { href: "/admin/settlements", title: "정산 처리", desc: "수금된 매출의 월별 정산 확정" },
  { href: "/admin/reports", title: "리포트", desc: "담당자별 월 정산 합계" },
];

export default function AdminHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">관리자 대시보드</h1>
        <p className="mt-1 text-sm text-gray-500">담당자별 매출·수금·정산 관리</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-lg border bg-white p-5 transition-colors hover:border-blue-300 hover:bg-blue-50/30"
          >
            <div className="text-base font-semibold">{c.title}</div>
            <div className="mt-1 text-sm text-gray-500">{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
