import Link from "next/link";

export function Wordmark({ href = "/", size = "md" }: { href?: string; size?: "md" | "lg" }) {
  return (
    <Link href={href} className="group inline-flex items-baseline gap-2" aria-label="ARTIFEX home">
      <span className={`font-display italic leading-none tracking-tight ${size === "lg" ? "text-4xl" : "text-2xl"}`}>Artifex</span>
      <span className="h-2 w-2 translate-y-[-2px] rounded-full bg-signal transition group-hover:scale-125" aria-hidden />
    </Link>
  );
}

export function SiteHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
      <Wordmark />
      <nav className="flex items-center gap-4 text-sm text-muted">
        <Link href="/rules" className="hover:text-paper">Rules</Link>
        <Link href="/leaderboard" className="hover:text-paper">Leaderboard</Link>
        {right}
      </nav>
    </header>
  );
}
