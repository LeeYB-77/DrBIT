import { getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const profile = await getCurrentProfile();
  if (profile.role === "admin") redirect("/admin");
  redirect("/me/settlements");
}
