import { describe, expect, it } from "vitest";
import { clockOffset, formatClock, remainingMs, urgency } from "./time";

describe("countdown", () => {
  it("measures the server offset from the request midpoint", () => {
    expect(clockOffset(new Date(10_500).toISOString(), 1000, 2000)).toBe(9000);
  });

  it("uses the server deadline, so a wrong device clock doesn't change the time left", () => {
    const deadline = new Date(100_000).toISOString();
    // Device clock is 30 s fast; offset corrects it.
    expect(remainingMs(deadline, -30_000, 70_000 + 30_000)).toBe(30_000);
    expect(remainingMs(deadline, 0, 200_000)).toBe(0);
    expect(remainingMs(null, 0)).toBe(0);
  });

  it("formats MM:SS rounding up, so 00:00 only shows at the end", () => {
    expect(formatClock(600_000)).toBe("10:00");
    expect(formatClock(59_001)).toBe("01:00");
    expect(formatClock(1)).toBe("00:01");
    expect(formatClock(0)).toBe("00:00");
  });

  it("warns at 2 minutes and 30 seconds", () => {
    expect(urgency(121_000)).toBe("normal");
    expect(urgency(120_000)).toBe("two_minutes");
    expect(urgency(30_000)).toBe("thirty_seconds");
    expect(urgency(0)).toBe("over");
  });
});
