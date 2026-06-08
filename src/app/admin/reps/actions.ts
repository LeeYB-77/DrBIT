"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type CreateRepResult =
  | { ok: true; email: string; tempPassword: string }
  | { ok: false; error: string };

/**
 * 신규 담당자 등록.
 * 1. auth.admin.createUser 로 Supabase Auth 사용자 생성 (email_confirm: true)
 * 2. profiles INSERT (name, role)
 * 3. 임시 비밀번호 반환 → 관리자가 담당자에게 전달
 */
export async function createRep(formData: FormData): Promise<CreateRepResult> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = (String(formData.get("role") ?? "rep") === "admin"
    ? "admin"
    : "rep") as "admin" | "rep";

  if (!name) return { ok: false, error: "이름을 입력하세요." };
  if (!email || !email.includes("@"))
    return { ok: false, error: "올바른 이메일을 입력하세요." };

  // 1. 임시 비밀번호 생성 (안전하게 12자)
  const tempPassword = generateTempPassword();

  const admin = createAdminClient();

  // 2. Auth 사용자 생성
  const { data: userData, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

  if (authError) {
    return { ok: false, error: `Auth 생성 실패: ${authError.message}` };
  }

  const userId = userData.user?.id;
  if (!userId) return { ok: false, error: "사용자 ID를 받지 못했습니다." };

  // 3. profiles INSERT (RLS 우회 admin client 사용)
  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    name,
    email,
    role,
    active: true,
  });

  if (profileError) {
    // 롤백: 방금 만든 auth user 삭제
    await admin.auth.admin.deleteUser(userId);
    if (profileError.code === "23505")
      return { ok: false, error: "이미 사용 중인 이름입니다." };
    return { ok: false, error: `프로필 생성 실패: ${profileError.message}` };
  }

  revalidatePath("/admin/reps");
  return { ok: true, email, tempPassword };
}

function generateTempPassword(): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  // crypto.randomUUID() 활용 — Edge runtime 호환
  const uuid = crypto.randomUUID().replace(/-/g, "");
  for (let i = 0; i < 12; i++) {
    const idx = parseInt(uuid.slice(i * 2, i * 2 + 2), 16) % chars.length;
    out += chars[idx];
  }
  return out;
}

export async function updateRepName(
  id: string,
  name: string,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "이름을 입력하세요." };

  const { error } = await supabase
    .from("profiles")
    .update({ name: trimmed })
    .eq("id", id);

  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "이미 사용 중인 이름입니다." };
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/reps");
  return { ok: true };
}

export async function toggleRepActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ active })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/reps");
  return { ok: true };
}

export async function updateRepRole(
  id: string,
  role: "admin" | "rep",
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/reps");
  return { ok: true };
}
