// After `npm run build`: fails if a secret value or a secret-shaped token appears in any client file
// (SECURITY.md T-10). Secret values are read from the environment (.env.local) and never printed.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const secrets = ["GEMINI_API_KEY", "TEST_SUPABASE_SERVICE_ROLE_KEY", "STAFF_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]
  .map((k) => [k, process.env[k]])
  .filter(([, v]) => v && v.length >= 12);
const patterns = [/sb_secret_[A-Za-z0-9_-]{10,}/, /AIza[0-9A-Za-z_-]{30,}/, /"role"\s*:\s*"service_role"/];

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const roots = [".next/static"].filter(existsSync);
if (roots.length === 0) {
  console.error("No build found: run `npm run build` first.");
  process.exit(1);
}
let bad = 0;
const report = (msg) => {
  bad++;
  console.error(`✗ ${msg}`);
};
for (const file of roots.flatMap(walk)) {
  const text = readFileSync(file, "utf8");
  for (const [name, value] of secrets) if (text.includes(value)) report(`${file} contains the value of ${name}`);
  for (const p of patterns) if (p.test(text)) report(`${file} matches secret pattern ${p}`);
  // A JWT in the bundle is fine only if it's the anon key.
  for (const jwt of text.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? []) {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
    if (payload.role !== "anon") report(`${file} contains a ${payload.role} JWT`);
  }
}
console.log(bad ? `${bad} problem(s) found.` : `✓ No secrets in ${roots.join(", ")}.`);
process.exit(bad ? 1 : 0);
