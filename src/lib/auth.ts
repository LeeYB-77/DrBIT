import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type Profile = {
  id: string;
  name: string;
  email: string | null;
  role: "admin" | "rep";
  active: boolean;
};

/**
 * 현재 로그인 사용자의 profiles 행을 반환.
 * 로그인 안 했거나 profiles에 없으면 /login 으로 리다이렉트.
 */
export async function getCurrentProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, name, email, role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (!profile) redirect("/login?reason=no_profile");
  if (!profile.active) redirect("/login?reason=inactive");

  return profile as Profile;
}

/**
 * admin 전용 페이지에서 사용. admin 아니면 /me로 보냄.
 */
export async function requireAdmin(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (profile.role !== "admin") redirect("/me/settlements");
  return profile;
}
