import { describe, expect, it } from "vitest";

import { computeLevel, ZERO_DIMENSIONS } from "./level";
import { deriveStage } from "./stage";
import {
  RELATIONSHIP_SEEDS,
  normalizeRole,
  parseInitialDims,
  resolveSeedDimensions,
  seedDimensionsForRole,
} from "./seed";

describe("normalizeRole", () => {
  it("passes canonical enums through", () => {
    for (const role of ["stranger", "neighbor", "colleague", "friend", "family", "crush"]) {
      expect(normalizeRole(role)).toBe(role);
    }
  });

  it("lowercases and trims", () => {
    expect(normalizeRole("  CRUSH ")).toBe("crush");
  });

  it("maps known synonyms to canonical enums", () => {
    expect(normalizeRole("best friend")).toBe("friend");
    expect(normalizeRole("love interest")).toBe("crush");
    expect(normalizeRole("mentor")).toBe("colleague");
    expect(normalizeRole("sibling")).toBe("family");
  });

  it("returns null for unknown / empty / non-string", () => {
    expect(normalizeRole("rival")).toBeNull();
    expect(normalizeRole("")).toBeNull();
    expect(normalizeRole("   ")).toBeNull();
    expect(normalizeRole(null)).toBeNull();
    expect(normalizeRole(undefined)).toBeNull();
  });
});

describe("seedDimensionsForRole — conservative on-the-cusp design", () => {
  it("stranger seeds all zeros and reads as Stranger / first_contact", () => {
    const dims = seedDimensionsForRole("stranger");
    expect(dims).toEqual(ZERO_DIMENSIONS);
    expect(computeLevel(dims)).toBe("Stranger");
    expect(deriveStage(dims).stage).toBe("first_contact");
  });

  it("every non-stranger preset clears Stranger but stays at Acquaintance / familiar", () => {
    for (const role of ["neighbor", "colleague", "friend", "family", "crush"]) {
      const dims = seedDimensionsForRole(role);
      expect(computeLevel(dims)).toBe("Acquaintance");
      expect(deriveStage(dims).stage).toBe("familiar");
    }
  });

  it("no preset crosses the trusted / romantic_tension / Friend gates (stays earnable)", () => {
    for (const d of Object.values(RELATIONSHIP_SEEDS)) {
      expect(d.closeness).toBeLessThan(40); // never auto-promote to Friend level
      expect(d.trust).toBeLessThan(30); // never auto-enter trusted (secret)
      expect(d.romance).toBeLessThan(30); // never auto-enter romantic_tension
      expect(d.hostility).toBe(0);
      expect(d.tension).toBe(0);
      expect(d.distance).toBe(0);
    }
  });

  it("crush carries visible romance just below the romantic gate", () => {
    const dims = seedDimensionsForRole("crush");
    expect(dims.romance).toBe(14);
    expect(dims.romance).toBeLessThan(30);
  });

  it("falls back to zeros for unknown / null roles", () => {
    expect(seedDimensionsForRole("rival")).toEqual(ZERO_DIMENSIONS);
    expect(seedDimensionsForRole(null)).toEqual(ZERO_DIMENSIONS);
  });

  it("returns a copy, not the shared constant", () => {
    const a = seedDimensionsForRole("friend");
    a.closeness = 99;
    expect(seedDimensionsForRole("friend").closeness).toBe(24);
  });
});

describe("parseInitialDims", () => {
  it("parses a valid 7-dim JSON object", () => {
    const dims = parseInitialDims(
      '{"closeness":30,"trust":5,"romance":35,"friendship":10,"hostility":0,"tension":0,"distance":0}',
    );
    expect(dims).not.toBeNull();
    expect(dims?.closeness).toBe(30);
    expect(dims?.romance).toBe(35);
  });

  it("clamps out-of-range values to [0,100] and floors floats", () => {
    const dims = parseInitialDims('{"closeness":150,"trust":-20,"romance":12.9}');
    expect(dims?.closeness).toBe(100);
    expect(dims?.trust).toBe(0);
    expect(dims?.romance).toBe(12);
  });

  it("treats missing dims as 0 but keeps the object when at least one is present", () => {
    const dims = parseInitialDims('{"romance":10}');
    expect(dims).not.toBeNull();
    expect(dims?.romance).toBe(10);
    expect(dims?.closeness).toBe(0);
  });

  it("returns null for null / empty / malformed / non-object / dimensionless JSON", () => {
    expect(parseInitialDims(null)).toBeNull();
    expect(parseInitialDims("")).toBeNull();
    expect(parseInitialDims("   ")).toBeNull();
    expect(parseInitialDims("not json")).toBeNull();
    expect(parseInitialDims("[1,2,3]")).toBeNull();
    expect(parseInitialDims('{"foo":1}')).toBeNull();
  });
});

describe("resolveSeedDimensions — precedence chain", () => {
  it("prefers initial_dims over role", () => {
    const dims = resolveSeedDimensions('{"closeness":50}', "crush");
    expect(dims.closeness).toBe(50);
    expect(dims.romance).toBe(0); // came from initial_dims, not crush default
  });

  it("falls back to role default when initial_dims is absent", () => {
    const dims = resolveSeedDimensions(null, "crush");
    expect(dims.romance).toBe(14);
  });

  it("falls back to zeros when both are absent", () => {
    expect(resolveSeedDimensions(null, null)).toEqual(ZERO_DIMENSIONS);
    expect(resolveSeedDimensions("garbage", "rival")).toEqual(ZERO_DIMENSIONS);
  });
});
