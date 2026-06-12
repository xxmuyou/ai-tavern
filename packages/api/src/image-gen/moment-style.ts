import type { RelationshipStage } from "../life/types";

/**
 * Scene/stage driven styling for chat moment images (spec-027).
 *
 * The visual action extractor and the moment prompt builder both need to know
 * what kind of place a scene is (venue), how private it is, and how bold the
 * styling may get for the current relationship stage. Everything here is
 * derived from the existing scene catalog tags (0051/0052) — no DB changes.
 *
 * Every preset string must stay short (<= 120 chars, the parse truncation
 * limit) and must never trip RISKY_MULTI_SUBJECT_PATTERN in moment-action.ts;
 * both invariants are locked by moment-style.test.ts.
 */

export type MomentScenePrivacy = "public" | "private";

export type MomentVenue =
  | "nightlife"
  | "bedroom"
  | "home_private"
  | "dining"
  | "beach"
  | "active"
  | "outdoor_public"
  | "indoor_quiet";

export type StyleTier = "reserved" | "warm" | "romantic" | "intimate";

export type MomentStylePreset = {
  outfit: string;
  hairstyle: string;
  makeup?: string;
};

const PRIVATE_TAGS = new Set(["intimate", "bedroom", "hotel", "home"]);

export function classifyMomentPrivacy(
  scene: { tags: string[] } | null,
): MomentScenePrivacy {
  // No scene context means a "Private chat" moment — treat as private.
  if (!scene) return "private";
  return scene.tags.some((tag) => PRIVATE_TAGS.has(tag.toLowerCase()))
    ? "private"
    : "public";
}

const BEACH_KEYWORDS = /beach|pool|swim|seaside|hot spring|onsen/i;
const NIGHTLIFE_KEYWORDS = /\b(bar|club|livehouse|pub|lounge bar|karaoke)\b/i;
const OUTDOOR_TAGS = new Set([
  "outdoor",
  "park",
  "riverside",
  "rooftop",
  "transit",
  "city",
  "market",
  "harbor",
  "waterfront",
  "balcony",
]);
const DINING_TAGS = new Set(["cafe", "restaurant", "dessert", "dinner"]);
const ACTIVE_TAGS = new Set(["gym", "active", "arcade", "sport"]);

export function classifyMomentVenue(
  sceneName: string,
  tags: string[],
  privacy: MomentScenePrivacy,
): MomentVenue {
  const lower = tags.map((tag) => tag.toLowerCase());
  const has = (tag: string) => lower.includes(tag);

  if (has("bedroom") || has("hotel")) return "bedroom";
  if (privacy === "private" && (has("intimate") || has("home"))) return "home_private";
  if (BEACH_KEYWORDS.test(sceneName) || lower.some((tag) => BEACH_KEYWORDS.test(tag))) {
    return "beach";
  }
  if (has("stage") || NIGHTLIFE_KEYWORDS.test(sceneName)) return "nightlife";
  if (lower.some((tag) => ACTIVE_TAGS.has(tag))) return "active";
  if (lower.some((tag) => DINING_TAGS.has(tag))) return "dining";
  if (lower.some((tag) => OUTDOOR_TAGS.has(tag))) return "outdoor_public";
  return privacy === "private" ? "home_private" : "indoor_quiet";
}

export function classifyMomentScene(
  scene: { name: string; tags: string[] } | null,
): { venue: MomentVenue; privacy: MomentScenePrivacy } {
  const privacy = classifyMomentPrivacy(scene);
  if (!scene) return { privacy, venue: "home_private" };
  return { privacy, venue: classifyMomentVenue(scene.name, scene.tags, privacy) };
}

// Negative stages always fall back to reserved styling regardless of history.
const STAGE_TIERS: Record<RelationshipStage, StyleTier> = {
  close_friend: "warm",
  committed: "intimate",
  dating: "romantic",
  estranged: "reserved",
  familiar: "reserved",
  first_contact: "reserved",
  hostile: "reserved",
  romantic_tension: "romantic",
  strained: "reserved",
  trusted: "warm",
};

export function stageStyleTier(stage: RelationshipStage): StyleTier {
  return STAGE_TIERS[stage] ?? "reserved";
}

// One sentence of boldness guidance for the visual action LLM. This only goes
// into the planner input, never into the final image prompt.
const TIER_GUIDANCE: Record<StyleTier, string> = {
  intimate:
    "boldest allowed: in private rooms a bath towel wrap or a lace-trimmed silk slip is good; in public venues glamorous and sexy. Still never nude, never topless, nothing see-through over the chest.",
  reserved:
    "playful and tasteful; cute or chic outfits only; no revealing necklines, no sleepwear, no towels, no swimwear except at a beach or pool.",
  romantic:
    "alluring but covered; off-shoulder tops, short dresses, and elegant silk nightwear in private rooms are good.",
  warm: "stylish and charming; fitted dresses and light makeup are good; no lingerie-style sleepwear, no towels.",
};

export function stageStyleGuidance(tier: StyleTier): string {
  return TIER_GUIDANCE[tier];
}

const FEMALE_PRESETS: Record<MomentVenue, Record<StyleTier, MomentStylePreset>> = {
  active: {
    intimate: {
      hairstyle: "high ponytail with loose strands",
      makeup: "fresh dewy look",
      outfit: "form-hugging workout set with a bare midriff",
    },
    reserved: {
      hairstyle: "sporty high ponytail",
      makeup: "fresh-faced natural look",
      outfit: "sporty cropped hoodie and leggings",
    },
    romantic: {
      hairstyle: "braided ponytail",
      makeup: "light natural makeup",
      outfit: "stylish cropped sports top and leggings",
    },
    warm: {
      hairstyle: "sleek high ponytail",
      outfit: "fitted athletic top and yoga pants",
    },
  },
  beach: {
    intimate: {
      hairstyle: "wet swept-back hair",
      makeup: "glossy bronzed makeup",
      outfit: "daring strappy bikini",
    },
    reserved: {
      hairstyle: "playful high ponytail",
      makeup: "fresh sunny glow look",
      outfit: "playful sundress over a modest swimsuit",
    },
    romantic: {
      hairstyle: "wind-blown beach waves",
      makeup: "radiant beach glow makeup",
      outfit: "fashionable bikini with a sheer sarong",
    },
    warm: {
      hairstyle: "loose beach waves",
      outfit: "stylish one-piece swimsuit with a wrap skirt",
    },
  },
  bedroom: {
    intimate: {
      hairstyle: "damp tousled hair",
      outfit: "white bath towel wrapped around the body",
    },
    reserved: {
      hairstyle: "relaxed loose hair",
      outfit: "cozy oversized knit loungewear",
    },
    romantic: {
      hairstyle: "soft tousled hair",
      makeup: "bare-faced soft glow",
      outfit: "elegant silk slip nightdress",
    },
    warm: {
      hairstyle: "loosely tied low bun",
      outfit: "soft camisole pajama set",
    },
  },
  dining: {
    intimate: {
      hairstyle: "glamorous waves",
      makeup: "refined evening makeup",
      outfit: "form-fitting cocktail dress",
    },
    reserved: {
      hairstyle: "neat half-up hairstyle",
      makeup: "fresh light makeup",
      outfit: "cute knit dress with a collared blouse",
    },
    romantic: {
      hairstyle: "romantic loose curls",
      makeup: "soft glam makeup",
      outfit: "elegant slip dress with delicate jewelry",
    },
    warm: {
      hairstyle: "soft curled hair",
      makeup: "natural date makeup",
      outfit: "stylish fitted midi dress",
    },
  },
  home_private: {
    intimate: {
      hairstyle: "messy just-woke-up hair",
      outfit: "oversized shirt worn as loungewear with bare legs",
    },
    reserved: {
      hairstyle: "casual messy bun",
      outfit: "comfortable knit cardigan and lounge pants",
    },
    romantic: {
      hairstyle: "soft tousled hair",
      makeup: "bare-faced soft glow",
      outfit: "silk robe over a camisole",
    },
    warm: {
      hairstyle: "loose relaxed waves",
      outfit: "soft off-shoulder lounge top and shorts",
    },
  },
  indoor_quiet: {
    intimate: {
      hairstyle: "loose romantic waves",
      makeup: "soft glam makeup",
      outfit: "chic fitted slip dress under a long open cardigan",
    },
    reserved: {
      hairstyle: "neatly brushed hair with a side part",
      makeup: "minimal fresh makeup",
      outfit: "preppy cardigan over a pleated skirt",
    },
    romantic: {
      hairstyle: "soft curled hair",
      makeup: "soft rosy makeup",
      outfit: "fitted knit dress with a delicate necklace",
    },
    warm: {
      hairstyle: "loose half-up hair",
      makeup: "subtle warm makeup",
      outfit: "soft fitted turtleneck dress",
    },
  },
  nightlife: {
    intimate: {
      hairstyle: "sleek updo with loose face-framing strands",
      makeup: "bold evening makeup with red lips",
      outfit: "backless high-slit evening dress",
    },
    reserved: {
      hairstyle: "loosely curled hair",
      makeup: "light evening makeup",
      outfit: "chic black mini dress with a modest neckline",
    },
    romantic: {
      hairstyle: "glamorous styled curls",
      makeup: "smoky eyes with red lips",
      outfit: "off-shoulder bodycon party dress",
    },
    warm: {
      hairstyle: "voluminous side-swept waves",
      makeup: "soft smoky eye makeup",
      outfit: "fitted satin party dress",
    },
  },
  outdoor_public: {
    intimate: {
      hairstyle: "glamorous loose waves",
      makeup: "striking polished makeup",
      outfit: "bold bodycon mini dress with a light jacket",
    },
    reserved: {
      hairstyle: "high ponytail with a ribbon",
      makeup: "fresh light makeup",
      outfit: "playful sundress with sneakers",
    },
    romantic: {
      hairstyle: "soft romantic curls",
      makeup: "polished daytime makeup",
      outfit: "chic short skirt with a fitted crop top",
    },
    warm: {
      hairstyle: "loose curled hair",
      makeup: "natural daytime makeup",
      outfit: "flowy short dress with a denim jacket",
    },
  },
};

// Male presets only split modest (reserved/warm) vs bold (romantic/intimate);
// menswear does not vary enough across tiers to justify a full 8x4 table.
const MALE_PRESETS: Record<MomentVenue, { modest: MomentStylePreset; bold: MomentStylePreset }> = {
  active: {
    bold: {
      hairstyle: "damp swept-back hair",
      outfit: "fitted sleeveless training top and athletic shorts",
    },
    modest: { hairstyle: "short sporty hair", outfit: "athletic t-shirt and training shorts" },
  },
  beach: {
    bold: {
      hairstyle: "wet swept-back hair",
      outfit: "swim trunks with an unbuttoned linen shirt",
    },
    modest: { hairstyle: "breeze-tousled hair", outfit: "swim trunks and an open summer shirt" },
  },
  bedroom: {
    bold: {
      hairstyle: "damp tousled hair",
      outfit: "loose half-buttoned linen shirt and lounge pants",
    },
    modest: { hairstyle: "relaxed messy hair", outfit: "soft knit loungewear" },
  },
  dining: {
    bold: {
      hairstyle: "effortlessly styled hair",
      outfit: "fitted dress shirt with rolled-up sleeves",
    },
    modest: { hairstyle: "neatly styled hair", outfit: "smart-casual blazer over a plain t-shirt" },
  },
  home_private: {
    bold: { hairstyle: "messy relaxed hair", outfit: "fitted t-shirt and lounge pants" },
    modest: { hairstyle: "casual loose hair", outfit: "comfortable hoodie and joggers" },
  },
  indoor_quiet: {
    bold: { hairstyle: "softly styled hair", outfit: "fitted dark turtleneck and slim trousers" },
    modest: { hairstyle: "neatly brushed hair", outfit: "soft sweater over a collared shirt" },
  },
  nightlife: {
    bold: {
      hairstyle: "effortlessly tousled styled hair",
      outfit: "open-collar fitted black shirt with sleeves rolled up",
    },
    modest: { hairstyle: "neatly styled hair", outfit: "smart black shirt with slim trousers" },
  },
  outdoor_public: {
    bold: { hairstyle: "wind-tousled styled hair", outfit: "fitted henley with chinos" },
    modest: { hairstyle: "casual short hair", outfit: "casual denim jacket over a t-shirt" },
  },
};

export function presetMomentStyle(
  venue: MomentVenue,
  tier: StyleTier,
  gender: string | null,
): MomentStylePreset {
  if (gender?.trim().toLowerCase().startsWith("m")) {
    const presets = MALE_PRESETS[venue];
    return tier === "romantic" || tier === "intimate" ? presets.bold : presets.modest;
  }
  return FEMALE_PRESETS[venue][tier];
}
