import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { getServerSupabase } from "@/lib/supabase/server";

// Server-side guard: non-staff never receive the console. Every action is checked again in the RPCs (T-06).
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/admin/login");
  const { data: role } = await supabase.rpc("staff_role");
  if (role !== "admin" && role !== "judge") redirect("/admin/login");
  return (
    <div className="min-h-dvh">
      <AdminNav role={role} email={auth.user.email ?? ""} />
      <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6">{children}</main>
    </div>
  );
}
