import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server Component / Route Handler / Server Action 에서 사용.
 * 호출할 때마다 새로 만들 것 (캐싱 금지).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component 에서 호출된 경우 무시 (middleware가 세션 갱신 담당)
          }
        },
      },
    },
  );
}
