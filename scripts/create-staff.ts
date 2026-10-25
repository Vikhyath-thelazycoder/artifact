// Creates (or promotes) an organiser or judge account.
//
//   npx tsx --env-file=.env.local scripts/create-staff.ts --email host@college.edu --role admin [--name "Host"]
//
// Needs STAFF_SUPABASE_URL + STAFF_SUPABASE_SERVICE_ROLE_KEY (falls back to TEST_*). The service key is only ever
// used from a trusted machine like this, never in the website (SECURITY.md › Secrets). Prints a generated
// password once if the account is new.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const email = args.get("email")?.trim().toLowerCase();
const role = args.get("role") ?? "admin";
const name = args.get("name") ?? "";
const url = process.env.STAFF_SUPABASE_URL ?? process.env.TEST_SUPABASE_URL;
const key = process.env.STAFF_SUPABASE_SERVICE_ROLE_KEY ?? process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  if (!email || !["admin", "judge"].includes(role)) throw new Error("Usage: --email <email> --role admin|judge [--name <name>]");
  if (!url || !key) throw new Error("Set STAFF_SUPABASE_URL and STAFF_SUPABASE_SERVICE_ROLE_KEY (or TEST_*)");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let userId: string | undefined;
  let password: string | undefined;
  for (let page = 1; !userId; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (data.users.length < 200) break;
  }
  if (!userId) {
    password = randomBytes(12).toString("base64url");
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("createUser failed");
    userId = data.user.id;
  }
  const { error } = await sb.from("staff").upsert({ user_id: userId, role, display_name: name });
  if (error) throw error;
  console.log(`${email} is now ${role}.`);
  if (password) console.log(`New account. Password (shown once, change it after first login): ${password}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
