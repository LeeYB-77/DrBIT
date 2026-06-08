import { login } from "./actions";

const REASONS: Record<string, string> = {
  no_profile: "프로필이 등록되지 않은 계정입니다. 관리자에게 문의하세요.",
  inactive: "비활성화된 계정입니다.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; error?: string }>;
}) {
  const { reason, error } = await searchParams;
  const message = error ?? (reason ? REASONS[reason] : null);

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">DrBit 정산</h1>
          <p className="mt-1 text-sm text-gray-500">
            로그인하여 정산 시스템에 접속하세요
          </p>
        </div>

        {message && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {message}
          </div>
        )}

        <form action={login} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">
              이메일
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium">
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            로그인
          </button>
        </form>
      </div>
    </div>
  );
}
