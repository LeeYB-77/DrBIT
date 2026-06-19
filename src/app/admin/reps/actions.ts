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
  const agencyName = String(formData.get("agency_name") ?? "").trim() || null;
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
    agency_name: agencyName,
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

export async function updateRepAgencyName(
  id: string,
  agencyName: string,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const trimmed = agencyName.trim() || null;

  const { error } = await supabase
    .from("profiles")
    .update({ agency_name: trimmed })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/reps");
  return { ok: true };
}

export async function updateRepEmail(
  id: string,
  email: string,
): Promise<ActionResult> {
  await requireAdmin();
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@"))
    return { ok: false, error: "올바른 이메일을 입력하세요." };

  const admin = createAdminClient();
  const { error: authErr } = await admin.auth.admin.updateUserById(id, {
    email: trimmed,
    email_confirm: true,
  });
  if (authErr) return { ok: false, error: `Auth 수정 실패: ${authErr.message}` };

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ email: trimmed })
    .eq("id", id);
  if (profileErr) return { ok: false, error: profileErr.message };

  revalidatePath("/admin/reps");
  return { ok: true };
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

export type DeleteRepResult =
  | { ok: true }
  | { ok: false; error: string; details?: { sales: number; settlements: number } };

/**
 * 담당자 계정 완전 삭제.
 * - 본인 삭제 차단
 * - 매출/정산 이력 있으면 거부 (비활성화 사용 안내)
 * - 가능하면 auth.users 삭제 → profiles CASCADE 자동 삭제
 */
export async function deleteRep(id: string): Promise<DeleteRepResult> {
  const profile = await requireAdmin();

  if (id === profile.id) {
    return { ok: false, error: "본인 계정은 삭제할 수 없습니다." };
  }

  const supabase = await createClient();
  const adminCli = createAdminClient();

  // 매출 이력 확인
  const { count: salesCount, error: salesErr } = await supabase
    .from("sales")
    .select("id", { count: "exact", head: true })
    .eq("rep_id", id);
  if (salesErr) return { ok: false, error: salesErr.message };

  // 정산 이력 확인
  const { count: setCount, error: setErr } = await supabase
    .from("settlements")
    .select("id", { count: "exact", head: true })
    .eq("rep_id", id);
  if (setErr) return { ok: false, error: setErr.message };

  if ((salesCount ?? 0) > 0 || (setCount ?? 0) > 0) {
    return {
      ok: false,
      error:
        `이 담당자의 매출 ${salesCount ?? 0}건, 정산 이력 ${setCount ?? 0}건이 있어 삭제할 수 없습니다. ` +
        `대신 '활성' 토글을 꺼서 비활성화하세요.`,
      details: { sales: salesCount ?? 0, settlements: setCount ?? 0 },
    };
  }

  // Auth 사용자 삭제 → profiles는 CASCADE
  const { error: delErr } = await adminCli.auth.admin.deleteUser(id);
  if (delErr) return { ok: false, error: `Auth 삭제 실패: ${delErr.message}` };

  revalidatePath("/admin/reps");
  return { ok: true };
}
