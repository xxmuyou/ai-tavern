import { describe, expect, it } from "vitest";

import { handleCompanionEmotionArtRequest } from "./emotion-art-routes";

describe("companion emotion-art routes", () => {
  it("returns 410 for retired generate endpoint", async () => {
    const res = await handleCompanionEmotionArtRequest(
      new Request("https://api.test/companions/maya/emotion-art/warm/generate", { method: "POST" }),
      {} as Env,
      "/companions/maya/emotion-art/warm/generate",
    );

    expect(res?.status).toBe(410);
    await expect(res?.json()).resolves.toMatchObject({ error: "feature_retired" });
  });

  it("returns 410 for retired jobs endpoint", async () => {
    const res = await handleCompanionEmotionArtRequest(
      new Request("https://api.test/companions/maya/emotion-art/jobs", { method: "GET" }),
      {} as Env,
      "/companions/maya/emotion-art/jobs",
    );

    expect(res?.status).toBe(410);
    await expect(res?.json()).resolves.toMatchObject({ error: "feature_retired" });
  });

  it("ignores unrelated paths", async () => {
    const res = await handleCompanionEmotionArtRequest(
      new Request("https://api.test/companions/maya"),
      {} as Env,
      "/companions/maya",
    );

    expect(res).toBeNull();
  });
});
