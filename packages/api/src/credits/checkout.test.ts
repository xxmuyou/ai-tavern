import { describe, expect, it } from "vitest";

import { createCreditsCheckout } from "./checkout";
import type { CreditsEnv } from "./types";

const USER = { email: "player@example.com", id: "usr_1" };

describe("credits checkout", () => {
  it("rejects an unknown package before touching Stripe", async () => {
    await expect(createCreditsCheckout({} as CreditsEnv, USER, "huge")).rejects.toMatchObject({
      code: "invalid_credit_package",
      status: 400,
    });
  });

  it("rejects when the package price / Stripe config is missing", async () => {
    await expect(createCreditsCheckout({} as CreditsEnv, USER, "small")).rejects.toMatchObject({
      code: "billing_config_missing",
      status: 500,
    });
  });
});
