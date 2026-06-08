"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: string };

export async function changePassword(args: {
  currentPassword: string;
  newPassword: string;
}): Promise<ChangePasswordResult> {
  // 로그인 확인 (인증되지 않으면 redirect)
  await getCurrentProfile();

  if (!args.currentPassword)
    return { ok: false, error: "현재 비밀번호를 입력하세요." };
  if (!args.newPassword)
    return { ok: false, error: "새 비밀번호를 입력하세요." };
  if (args.newPassword.length < 8)
    return {
      ok: false,
      error: "새 비밀번호는 8자 이상이어야 합니다.",
    };
  if (args.currentPassword === args.newPassword)
    return { ok: false, error: "새 비밀번호가 현재 비밀번호와 같습니다." };

  const supabase = await createClient();

  // 현재 사용자의 이메일 확보
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email)
    return { ok: false, error: "사용자 정보를 가져올 수 없습니다." };

  // 1. 현재 비밀번호 재인증
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: args.currentPassword,
  });
  if (reauthError) {
    return { ok: false, error: "현재 비밀번호가 일치하지 않습니다." };
  }

  // 2. 새 비밀번호 설정
  const { error: updateError } = await supabase.auth.updateUser({
    password: args.newPassword,
  });
  if (updateError) {
    if (
      updateError.message.toLowerCase().includes("new password should be different")
    ) {
      return {
        ok: false,
        error: "새 비밀번호가 현재 비밀번호와 같습니다.",
      };
    }
    if (updateError.message.toLowerCase().includes("pwned")) {
      return {
        ok: false,
        error: "유출된 적이 있는 비밀번호는 사용할 수 없습니다. 다른 비밀번호를 사용하세요.",
      };
    }
    return { ok: false, error: `변경 실패: ${updateError.message}` };
  }

  return { ok: true };
}
