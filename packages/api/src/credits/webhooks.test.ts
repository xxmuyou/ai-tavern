import type Stripe from "stripe";
import { describe, expect, it } from "vitest";

import { getCreditBalance } from "./ledger";
import { createCreditsTestEnv } from "./test-fixtures";
import { handleCreditsCheckoutCompleted, isCreditsCheckoutSession } from "./webhooks";

function creditsSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    client_reference_id: "usr_1",
    id: "cs_1",
    metadata: { credit_package: "small", credits: "500", user_id: "usr_1" },
    payment_intent: "pi_1",
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

describe("credits webhook", () => {
  it("detects credits checkout sessions by metadata", () => {
    expect(isCreditsCheckoutSession(creditsSession())).toBe(true);
    expect(isCreditsCheckoutSession({ metadata: {} } as unknown as Stripe.Checkout.Session)).toBe(false);
  });

  it("records a purchase and is idempotent across redeliveries", async () => {
    const env = createCreditsTestEnv();
    expect(await handleCreditsCheckoutCompleted(env, creditsSession(), Date.now())).toBe(true);
    await handleCreditsCheckoutCompleted(env, creditsSession(), Date.now());
    expect((await getCreditBalance(env, "usr_1")).available_credits).toBe(500);
  });

  it("ignores non-credits sessions and sessions missing a user", async () => {
    const env = createCreditsTestEnv();
    expect(
      await handleCreditsCheckoutCompleted(
        env,
        { metadata: {} } as unknown as Stripe.Checkout.Session,
        Date.now(),
      ),
    ).toBe(false);
    expect(
      await handleCreditsCheckoutCompleted(
        env,
        creditsSession({ client_reference_id: null, metadata: { credit_package: "small", credits: "500" } }),
        Date.now(),
      ),
    ).toBe(false);
  });
});
