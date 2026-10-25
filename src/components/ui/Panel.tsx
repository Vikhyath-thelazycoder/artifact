import type { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "aside" | "article" };

export function Panel({ as: Tag = "section", className = "", ...rest }: Props) {
  return <Tag className={`rounded-lg border border-line bg-surface p-5 ${className}`} {...rest} />;
}

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted ${className}`}>{children}</p>;
}
