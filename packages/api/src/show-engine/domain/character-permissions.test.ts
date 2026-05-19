import { describe, expect, it } from "vitest";

import { canEditShowCharacter } from "./character-permissions";

describe("character permissions", () => {
  it("lets admins edit official and user guests", () => {
    expect(canEditShowCharacter({ owner_user_id: null, source: "official" }, { isAdmin: true, userId: "admin" })).toBe(true);
    expect(canEditShowCharacter({ owner_user_id: "user-1", source: "user" }, { isAdmin: true, userId: "admin" })).toBe(true);
  });

  it("only lets regular users edit their own user guests", () => {
    expect(canEditShowCharacter({ owner_user_id: "user-1", source: "user" }, { userId: "user-1" })).toBe(true);
    expect(canEditShowCharacter({ owner_user_id: "user-2", source: "user" }, { userId: "user-1" })).toBe(false);
    expect(canEditShowCharacter({ owner_user_id: null, source: "official" }, { userId: "user-1" })).toBe(false);
  });
});
