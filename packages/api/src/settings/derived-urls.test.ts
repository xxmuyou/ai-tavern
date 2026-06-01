import { describe, expect, it } from "vitest";

import { derivedSettingDefault } from "./derived-urls";
import { getSetting } from "./store";

const dev = { APP_BASE_URL: "https://dev.aiappsbox.com", APP_ENV: "dev" } as unknown as Env;
const prod = { APP_BASE_URL: "https://aiappsbox.com", APP_ENV: "prod" } as unknown as Env;

describe("derivedSettingDefault", () => {
  it("derives auth/billing/image URLs from the base origin", () => {
    expect(derivedSettingDefault(prod, "auth.success_url")).toBe("https://aiappsbox.com/auth/success");
    expect(derivedSettingDefault(prod, "image_gen.public_base_url")).toBe("https://aiappsbox.com/api");
    expect(derivedSettingDefault(prod, "image_gen.webhook_url")).toBe(
      "https://aiappsbox.com/api/webhooks/runninghub",
    );
    expect(derivedSettingDefault(prod, "billing.success_url")).toBe("https://aiappsbox.com/?billing=success");
    expect(derivedSettingDefault(prod, "billing.cancel_url")).toBe("https://aiappsbox.com/?billing=cancelled");
    expect(derivedSettingDefault(prod, "billing.portal_return_url")).toBe("https://aiappsbox.com/?billing=portal");
    expect(derivedSettingDefault(prod, "billing.credits_success_url")).toBe(
      "https://aiappsbox.com/?credits=success",
    );
    expect(derivedSettingDefault(prod, "billing.credits_cancel_url")).toBe(
      "https://aiappsbox.com/?credits=cancelled",
    );
  });

  it("prod allowed_origins is strict (own origin only)", () => {
    expect(derivedSettingDefault(prod, "auth.allowed_origins")).toBe("https://aiappsbox.com");
  });

  it("non-prod allowed_origins also includes localhost dev origins", () => {
    expect(derivedSettingDefault(dev, "auth.allowed_origins")).toBe(
      "https://dev.aiappsbox.com,http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,http://127.0.0.1:19006",
    );
  });

  it("returns null when APP_BASE_URL is unset or invalid", () => {
    expect(derivedSettingDefault({} as unknown as Env, "auth.success_url")).toBeNull();
    expect(
      derivedSettingDefault({ APP_BASE_URL: "not a url" } as unknown as Env, "auth.success_url"),
    ).toBeNull();
  });

  it("returns null for keys that are not URL-derivable", () => {
    expect(derivedSettingDefault(prod, "billing.stripe_secret_key")).toBeNull();
    expect(derivedSettingDefault(prod, "image_gen.runninghub_base_url")).toBeNull();
  });
});

describe("getSetting derivation fallback", () => {
  it("falls back to the derived value when no DB/env override exists", async () => {
    // No env.DB → loadSettings treats the store as empty.
    expect(await getSetting(prod, "auth.success_url")).toBe("https://aiappsbox.com/auth/success");
  });

  it("an explicit env var (escape hatch) wins over derivation", async () => {
    const overridden = {
      APP_BASE_URL: "https://aiappsbox.com",
      APP_ENV: "prod",
      AUTH_SUCCESS_URL: "https://custom.example.com/welcome",
    } as unknown as Env;
    expect(await getSetting(overridden, "auth.success_url")).toBe("https://custom.example.com/welcome");
  });
});
