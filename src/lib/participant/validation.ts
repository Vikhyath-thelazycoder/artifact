import { z } from "zod";

// Same rules as register_participant (0003_rpc.sql) so the form catches mistakes before the server does.
export const EMAIL_DOMAIN = "participants.artifex.app";

export const normalizeUsn = (usn: string) => usn.replace(/\s/g, "").toUpperCase();
export const participantEmail = (usn: string) => `${normalizeUsn(usn).toLowerCase()}@${EMAIL_DOMAIN}`;

const usn = z.string().transform(normalizeUsn).pipe(z.string().regex(/^[0-9A-Z]{6,12}$/, "6–12 letters and digits, e.g. 1SV22CS001"));
const pin = z.string().regex(/^[0-9]{6}$/, "Exactly 6 digits");

export const registrationSchema = z.object({
  name: z
    .string()
    .transform((s) => s.trim().replace(/\s+/g, " "))
    .pipe(z.string().regex(/^[A-Za-z][A-Za-z .'-]{1,59}$/, "2–60 letters (spaces, . ' - allowed)")),
  usn,
  branch: z
    .string()
    .transform((s) => s.trim().replace(/\s+/g, " "))
    .pipe(z.string().max(40, "At most 40 characters").regex(/^[A-Za-z0-9 &.,()/-]*$/, "Letters, digits and & . , ( ) / - only")),
  pin,
});

export const loginSchema = z.object({ usn, pin });

export type Registration = z.infer<typeof registrationSchema>;
export type Login = z.infer<typeof loginSchema>;

/** Field → first error message, for inline display next to each input. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
