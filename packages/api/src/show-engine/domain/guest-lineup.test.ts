import { describe, expect, it } from "vitest";

import {
  normalizeSelectedGuestKeys,
  resolveSelectedGuestLineup,
  type GuestLineupCharacter,
  type GuestLineupResult,
} from "./guest-lineup";

describe("guest lineup", () => {
  const characters = [
    { characterKey: "host", name: "Host", role: "host" },
    { characterKey: "mia", name: "Mia", role: "guest" },
    { characterKey: "ivy", name: "Ivy", role: "guest" },
    { characterKey: "community-a", name: "Community A", role: "guest" },
  ];

  it("keeps selected guests in user order", () => {
    const result = resolveSelectedGuestLineup(characters, ["community-a", "mia"]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.guests.map((guest) => guest.characterKey)).toEqual(["community-a", "mia"]);
    }
  });

  it("rejects duplicate, missing, non-guest, and oversized lineups", () => {
    expect(lineupError(resolveSelectedGuestLineup(characters, []))).toBe("selected_guest_required");
    expect(lineupError(resolveSelectedGuestLineup(characters, ["mia", "mia"]))).toBe("selected_guest_duplicate");
    expect(lineupError(resolveSelectedGuestLineup(characters, ["missing"]))).toBe("selected_guest_not_found");
    expect(lineupError(resolveSelectedGuestLineup(characters, ["host"]))).toBe("selected_guest_invalid_role");
    expect(lineupError(resolveSelectedGuestLineup(characters, ["mia", "ivy"], 1))).toBe("selected_guest_limit_exceeded");
  });

  it("normalizes optional request payloads", () => {
    expect(normalizeSelectedGuestKeys(undefined)).toBeNull();
    expect(normalizeSelectedGuestKeys([" mia ", "", 42, "ivy"])).toEqual(["mia", "ivy"]);
    expect(normalizeSelectedGuestKeys("mia")).toEqual([]);
  });
});

function lineupError<T extends GuestLineupCharacter>(result: GuestLineupResult<T>): string | null {
  return result.ok ? null : result.error;
}
