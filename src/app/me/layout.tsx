import { getCurrentProfile } from "@/lib/auth";
import { Navbar } from "@/components/Navbar";

export default async function MeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar profile={profile} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
