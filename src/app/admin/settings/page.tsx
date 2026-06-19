import Link from "next/link";

const SETTINGS_CARDS = [
  {
    href: "/admin/categories",
    title: "수수료 카테고리",
    desc: "프로그램(P) / 상품(M·H·S) 카테고리별 기본 수수료율",
    icon: "💼",
  },
  {
    href: "/admin/product-costs",
    title: "상품 원가 / 별도 수수료율",
    desc: "상품 품번별 등록원가 (적용원가 = 등록원가 + 5% 자동 계산), 별도 수수료율",
    icon: "🏷",
  },
  {
    href: "/admin/card-fee",
    title: "카드수수료율",
    desc: "카드 수금분의 카드수수료율(결제총액 × 율). 정산수수료에서 차감",
    icon: "💳",
  },
  {
    href: "/admin/reps",
    title: "담당자 관리",
    desc: "담당자 등록, 역할·활성, 삭제",
    icon: "👤",
  },
  {
    href: "/admin/upload",
    title: "매출 엑셀 업로드",
    desc: "매출현황.xlsx 업로드 → 파싱 → 미리보기 → 확정",
    icon: "📥",
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">설정</h1>
        <p className="mt-1 text-sm text-gray-500">
          마스터 데이터와 운영 환경을 설정합니다.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SETTINGS_CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="flex gap-3 rounded-lg border bg-white p-5 transition-colors hover:border-blue-300 hover:bg-blue-50/30"
          >
            <div className="text-2xl">{c.icon}</div>
            <div>
              <div className="text-base font-semibold">{c.title}</div>
              <div className="mt-1 text-sm text-gray-500">{c.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
