// Creates the admin account on the production Supabase project, or updates its password, from .env.local:
//
//   ADMIN_EMAIL=...            the login email for /admin/login
//   ADMIN_PASSWORD=...         at least 10 characters; change it here, then run this again
//   PROD_SUPABASE_URL=...      PROD_SUPABASE_SERVICE_ROLE_KEY=...
//
//   npm run admin:sync
//
// The website never reads ADMIN_PASSWORD: Supabase Auth stores the password (hashed). This script only copies it
// there. The service key stays on this machine (SECURITY.md › Secrets).
import { createClient } from "@supabase/supabase-js";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";
const url = process.env.PROD_SUPABASE_URL;
const key = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Set ADMIN_EMAIL in .env.local");
  if (password.length < 10) throw new Error("ADMIN_PASSWORD in .env.local must be at least 10 characters");
  if (!url || !key) throw new Error("Set PROD_SUPABASE_URL and PROD_SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let userId: string | undefined;
  for (let page = 1; !userId; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (data.users.length < 200) break;
  }
  if (userId) {
    const { error } = await sb.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (error) throw error;
  } else {
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("createUser failed");
    userId = data.user.id;
  }
  const { error } = await sb.from("staff").upsert({ user_id: userId, role: "admin", display_name: "Admin" });
  if (error) throw error;
  console.log(`✓ ${email} is an admin on ${new URL(url).host}, with the password from ADMIN_PASSWORD.`);
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
