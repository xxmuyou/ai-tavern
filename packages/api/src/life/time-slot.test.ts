import { describe, expect, it } from "vitest";

import { computeDateLocal, computeTimeSlot } from "./time-slot";

// Helper: build a Date that, when interpreted in UTC, matches a given
// wall-clock time. Tests use UTC to keep things deterministic.
function utc(y: number, m: number, d: number, h: number, mi = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h, mi));
}

describe("computeTimeSlot (UTC)", () => {
  it("04:59 is still night", () => {
    expect(computeTimeSlot(utc(2026, 5, 26, 4, 59), "UTC")).toBe("night");
  });

  it("05:00 flips to morning", () => {
    expect(computeTimeSlot(utc(2026, 5, 26, 5, 0), "UTC")).toBe("morning");
  });

  it("11:59 is still morning", () => {
    expect(computeTimeSlot(utc(2026, 5, 26, 11, 59), "UTC")).toBe("morning");
  });

  it("12:00 flips to afternoon", () => {
    expect(computeTimeSlot(utc(2026, 5, 26, 12, 0), "UTC")).toBe("afternoon");
  });

  it("16:59 is still afternoon", () => {
    expect(computeTimeSlot(utc(2026, 5, 26, 16, 59), "UTC")).toBe("afternoon");
  });

  it("17:00 flips to evening", () => {
    expect(computeTimeSlot(utc(2026, 5, 26, 17, 0), "UTC")).toBe("evening");
  });

  it("21:59 is still evening", () => {
    expect(computeTimeSlot(utc(2026, 5, 26, 21, 59), "UTC")).toBe("evening");
  });

  it("22:00 flips to night", () => {
    expect(computeTimeSlot(utc(2026, 5, 26, 22, 0), "UTC")).toBe("night");
  });

  it("falls back to UTC for unknown timezone", () => {
    expect(computeTimeSlot(utc(2026, 5, 26, 12, 0), "Not/A_Zone")).toBe("afternoon");
  });

  it("respects non-UTC zone", () => {
    // 2026-05-26T20:00Z is 2026-05-27 04:00 in Asia/Shanghai (UTC+8) -> still night
    expect(computeTimeSlot(utc(2026, 5, 26, 20, 0), "Asia/Shanghai")).toBe("night");
    // 2026-05-26T21:00Z is 2026-05-27 05:00 in Asia/Shanghai -> morning
    expect(computeTimeSlot(utc(2026, 5, 26, 21, 0), "Asia/Shanghai")).toBe("morning");
  });
});

describe("computeDateLocal (UTC)", () => {
  it("after 05:00 local belongs to that calendar day", () => {
    expect(computeDateLocal(utc(2026, 5, 26, 5, 0), "UTC")).toBe("2026-05-26");
    expect(computeDateLocal(utc(2026, 5, 26, 23, 59), "UTC")).toBe("2026-05-26");
  });

  it("02:00 local still belongs to the previous story day", () => {
    expect(computeDateLocal(utc(2026, 5, 26, 2, 0), "UTC")).toBe("2026-05-25");
  });

  it("04:59 local still belongs to the previous story day", () => {
    expect(computeDateLocal(utc(2026, 5, 26, 4, 59), "UTC")).toBe("2026-05-25");
  });

  it("05:00 exactly rolls over to the new story day", () => {
    expect(computeDateLocal(utc(2026, 5, 26, 5, 0), "UTC")).toBe("2026-05-26");
  });

  it("handles zone offset", () => {
    // 2026-05-26 18:00Z = 2026-05-27 02:00 Asia/Shanghai -> still 2026-05-26
    expect(computeDateLocal(utc(2026, 5, 26, 18, 0), "Asia/Shanghai")).toBe("2026-05-26");
    // 2026-05-26 21:00Z = 2026-05-27 05:00 Asia/Shanghai -> rolls to 2026-05-27
    expect(computeDateLocal(utc(2026, 5, 26, 21, 0), "Asia/Shanghai")).toBe("2026-05-27");
  });
});
