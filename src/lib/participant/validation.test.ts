import { describe, expect, it } from "vitest";
import { loginSchema, participantEmail, registrationSchema } from "./validation";

describe("participant validation", () => {
  it("normalises the USN and maps it to the account email", () => {
    const r = registrationSchema.parse({ name: "  Asha   Rao ", usn: "1sv 22cs001", branch: "CSE", pin: "123456" });
    expect(r).toMatchObject({ name: "Asha Rao", usn: "1SV22CS001" });
    expect(participantEmail("1sv22cs001")).toBe("1sv22cs001@participants.artifex.app");
  });

  it("rejects script in names, bad USNs and non-numeric PINs (T-09)", () => {
    expect(registrationSchema.safeParse({ name: "<script>", usn: "1SV22CS001", branch: "", pin: "123456" }).success).toBe(false);
    expect(loginSchema.safeParse({ usn: "12", pin: "123456" }).success).toBe(false);
    expect(loginSchema.safeParse({ usn: "1SV22CS001", pin: "12ab56" }).success).toBe(false);
  });
});
