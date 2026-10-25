import type { ButtonHTMLAttributes } from "react";

const variants = {
  primary: "bg-signal text-ink hover:brightness-110",
  ok: "bg-ok text-ink hover:brightness-110",
  danger: "bg-danger text-ink hover:brightness-110",
  ghost: "border border-line bg-surface text-paper hover:border-muted",
  quiet: "text-muted hover:text-paper",
} as const;

const sizes = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-14 px-6 text-base",
} as const;

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; size?: keyof typeof sizes };

export function Button({ variant = "primary", size = "md", className = "", type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-semibold tracking-tight transition disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    />
  );
}
