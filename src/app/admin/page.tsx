import Link from "next/link";

const OPS_CARDS = [
  {
    href: "/admin/sales",
    title: "매출 / 수금 관리",
    desc: "거래 단위로 수금 체크",
    icon: "💰",
  },
  {
    href: "/admin/settlements",
    title: "정산 처리",
    desc: "수금 완료 매출의 월별 정산 확정 / 취소 / 상세",
    icon: "📊",
  },
  {
    href: "/admin/reports",
    title: "리포트",
    desc: "담당자별 월 정산 합계",
    icon: "📈",
  },
  {
    href: "/admin/settings",
    title: "설정",
    desc: "수수료 카테고리 / 상품 원가 / 담당자 / 매출 엑셀 업로드",
    icon: "⚙️",
  },
];

export default function AdminHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">관리자 대시보드</h1>
        <p className="mt-1 text-sm text-gray-500">
          담당자별 매출·수금·정산을 관리합니다.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {OPS_CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="flex flex-col gap-2 rounded-lg border bg-white p-5 transition-colors hover:border-blue-300 hover:bg-blue-50/30"
          >
            <div className="text-2xl">{c.icon}</div>
            <div className="text-base font-semibold">{c.title}</div>
            <div className="text-sm text-gray-500">{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
