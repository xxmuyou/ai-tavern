import { describe, expect, it } from "vitest";

import { parseVariants } from "./variants";

describe("parseVariants", () => {
  it("treats a NULL variants column as a single-variant list of the content", () => {
    expect(parseVariants(null, "hello")).toEqual(["hello"]);
  });

  it("parses a JSON array of strings", () => {
    expect(parseVariants(JSON.stringify(["a", "b", "c"]), "a")).toEqual(["a", "b", "c"]);
  });

  it("falls back to content on malformed or empty arrays", () => {
    expect(parseVariants("not json", "fallback")).toEqual(["fallback"]);
    expect(parseVariants(JSON.stringify([]), "fallback")).toEqual(["fallback"]);
    expect(parseVariants(JSON.stringify([1, 2]), "fallback")).toEqual(["fallback"]);
  });
});
