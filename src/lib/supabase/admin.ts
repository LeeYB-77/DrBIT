import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * 서버 전용 admin 클라이언트 (RLS 우회).
 * Secret key 사용. 절대 브라우저에 노출 금지.
 *
 * 용도:
 *  - auth.admin.createUser / inviteUserByEmail
 *  - 시스템 작업으로 RLS 우회 INSERT 필요할 때
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secretKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다. .env.local을 확인하세요.",
    );
  }

  return createSupabaseClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
