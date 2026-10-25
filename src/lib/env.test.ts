import { describe, expect, it } from "vitest";
import { parsePublicEnv } from "./env";

const jwt = (role: string) => `x.${btoa(JSON.stringify({ role })).replace(/=+$/, "")}.y`;

describe("public env", () => {
  it("accepts the anon key and forgives quotes and spaces", () => {
    const env = parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: ' "https://a.supabase.co" ', NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon") });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://a.supabase.co");
  });

  it("refuses a service-role or secret key in the public slot (T-10)", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://a.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("service_role") })).toThrow(/never a secret/);
    expect(() => parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://a.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_abc" })).toThrow(/never a secret/);
  });

  it("names the missing variable", () => {
    expect(() => parsePublicEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
