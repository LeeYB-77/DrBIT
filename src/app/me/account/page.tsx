import { getCurrentProfile } from "@/lib/auth";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const profile = await getCurrentProfile();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">내 정보</h1>
        <p className="mt-1 text-sm text-gray-500">
          계정 정보와 비밀번호를 관리합니다.
        </p>
      </div>

      <section className="rounded-lg border bg-white p-5 space-y-2">
        <div className="text-sm font-medium">기본 정보</div>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <div className="text-gray-500">이름</div>
          <div className="font-medium">{profile.name}</div>
          <div className="text-gray-500">이메일</div>
          <div className="font-mono text-xs">{profile.email ?? "-"}</div>
          <div className="text-gray-500">역할</div>
          <div>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">
              {profile.role === "admin" ? "관리자" : "담당자"}
            </span>
          </div>
        </div>
        <div className="pt-2 text-xs text-gray-500">
          이름·이메일·역할 변경은 관리자에게 문의하세요.
        </div>
      </section>

      <section className="rounded-lg border bg-white p-5 space-y-3">
        <div className="text-sm font-medium">비밀번호 변경</div>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
