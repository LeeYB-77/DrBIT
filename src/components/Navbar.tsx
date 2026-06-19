import Link from "next/link";
import type { Profile } from "@/lib/auth";

export function Navbar({ profile }: { profile: Profile }) {
  const isAdmin = profile.role === "admin";
  const links = isAdmin
    ? [
        { href: "/admin", label: "대시보드" },
        { href: "/admin/sales", label: "매출/수금" },
        { href: "/admin/settlements", label: "정산" },
        { href: "/admin/reports", label: "리포트" },
        { href: "/admin/settings", label: "설정" },
      ]
    : [
        { href: "/me/settlements", label: "내 정산" },
        { href: "/me/account", label: "비밀번호 변경" },
      ];

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href={isAdmin ? "/admin" : "/me/settlements"} className="font-bold">
            DrBit 정산
          </Link>
          <nav className="flex gap-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-gray-600 hover:text-blue-600">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/me/account"
            className="text-gray-600 hover:text-blue-600"
            title="내 정보 / 비밀번호 변경"
          >
            {profile.name}{" "}
            <span className="text-xs text-gray-400">
              ({isAdmin ? "관리자" : "담당자"})
            </span>
          </Link>
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              className="rounded-md border px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
            >
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
