"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Wordmark } from "@/components/ui/Wordmark";
import { getBrowserSupabase } from "@/lib/supabase/client";

const links = [
  { href: "/admin", label: "Control room", admin: true },
  { href: "/admin/settings", label: "Settings", admin: true },
  { href: "/admin/submissions", label: "Submissions", admin: true },
  { href: "/admin/judging", label: "Judging", admin: false },
  { href: "/admin/audit", label: "Audit log", admin: true },
];

export function AdminNav({ role, email }: { role: "admin" | "judge"; email: string }) {
  const path = usePathname();
  const router = useRouter();
  async function logout() {
    await getBrowserSupabase().auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  }
  return (
    <header className="border-b border-line bg-surface/60">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Wordmark href={role === "admin" ? "/admin" : "/admin/judging"} />
        <nav className="flex flex-1 flex-wrap gap-1 text-sm">
          {links
            .filter((l) => role === "admin" || !l.admin)
            .map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded px-3 py-1.5 ${path === l.href ? "bg-raised text-paper" : "text-muted hover:text-paper"}`}
              >
                {l.label}
              </Link>
            ))}
          <a href="/screen" target="_blank" rel="noreferrer" className="rounded px-3 py-1.5 text-muted hover:text-paper">
            Projector ↗
          </a>
        </nav>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="hidden sm:inline">
            {email} · {role}
          </span>
          <button onClick={logout} className="hover:text-paper">
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
