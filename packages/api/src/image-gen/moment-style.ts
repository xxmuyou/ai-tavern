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

export type MomentStyleProfileKey =
  | "elegant_minimalist"
  | "soft_romantic"
  | "sharp_urban"
  | "relaxed_premium";

export type MomentStyleProfile = {
  key: MomentStyleProfileKey;
  label: string;
  styleIdentity: string;
  colorPalette: string;
  silhouette: string;
  bodyAesthetic: string;
};

export const MOMENT_POSE_BODY_QUALITY =
  "flattering natural proportions, elegant posture, relaxed shoulders, natural hands, clean waistline, graceful three-quarter body angle, balanced anatomy";

const STYLE_PROFILES: readonly MomentStyleProfile[] = [
  {
    bodyAesthetic: "graceful proportions, refined posture, clean body line",
    colorPalette: "black, ivory, charcoal, pearl, muted metallic accents",
    key: "elegant_minimalist",
    label: "elegant minimalist",
    silhouette: "tailored fit, defined waist, clean long lines",
    styleIdentity: "polished minimalist styling with premium fabrics and no costume-like details",
  },
  {
    bodyAesthetic: "soft curves, poised shoulders, gentle flattering angles",
    colorPalette: "ivory, rose, warm beige, soft blue, delicate gold accents",
    key: "soft_romantic",
    label: "soft romantic",
    silhouette: "fitted waist, flowing hems, delicate but intentional styling",
    styleIdentity: "soft feminine styling with graceful fabrics and romantic detail",
  },
  {
    bodyAesthetic: "confident stance, athletic poise, sharp body line",
    colorPalette: "black, white, denim blue, wine red, cool silver accents",
    key: "sharp_urban",
    label: "sharp urban",
    silhouette: "sleek fitted shapes, cropped layers, strong street-fashion lines",
    styleIdentity: "modern urban styling with crisp contrast and refined edge",
  },
  {
    bodyAesthetic: "natural attractive proportions, relaxed confidence, easy posture",
    colorPalette: "cream, olive, slate, soft brown, warm neutral accents",
    key: "relaxed_premium",
    label: "relaxed premium",
    silhouette: "comfortable fitted layers, visible waistline, premium casual polish",
    styleIdentity: "quiet luxury casual styling with soft texture and no shapeless bulk",
  },
];

export function resolveMomentStyleProfile(
  companionId: string | null | undefined,
  gender: string | null | undefined,
): MomentStyleProfile {
  const seed = `${companionId?.trim() || "companion"}:${gender?.trim() || "unspecified"}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return STYLE_PROFILES[hash % STYLE_PROFILES.length] ?? STYLE_PROFILES[0]!;
}

export function formatMomentStyleProfile(profile: MomentStyleProfile): string {
  return [
    `Style profile: ${profile.label}`,
    profile.styleIdentity,
    `palette: ${profile.colorPalette}`,
    `silhouette: ${profile.silhouette}`,
    `body aesthetic: ${profile.bodyAesthetic}`,
  ].join("; ");
}

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
      outfit: "white spa bath towel wrap with a clean fitted silhouette",
    },
    reserved: {
      hairstyle: "relaxed loose hair",
      outfit: "soft ribbed knit lounge set with a defined waist",
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
      outfit: "crisp long shirt worn as polished loungewear with bare legs",
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

const FEMALE_OUTFIT_OPTIONS: Record<MomentVenue, Record<StyleTier, readonly string[]>> = {
  active: {
    intimate: [
      "premium matching workout set with a sculpted waist and bare midriff",
      "sleek zip-front training top with high-waisted leggings",
      "fitted racerback athletic top with tailored running shorts",
    ],
    reserved: [
      "cropped technical hoodie with high-waisted leggings",
      "fitted tennis dress with clean white sneakers",
      "sleek athletic jacket over a shaped training set",
    ],
    romantic: [
      "stylish cropped sports top with high-waisted leggings",
      "fitted dance-studio wrap top with sculpting leggings",
      "sleek tennis skirt with a fitted athletic tank",
    ],
    warm: [
      "fitted athletic top with yoga pants and clean lines",
      "soft zip-up training jacket with sculpting leggings",
      "premium cropped sweatshirt with a shaped tennis skirt",
    ],
  },
  beach: {
    intimate: [
      "daring strappy bikini with an elegant sheer sarong",
      "sleek cutout one-piece swimsuit with a light wrap skirt",
      "minimal black bikini with a polished linen cover-up",
    ],
    reserved: [
      "playful sundress over a modest swimsuit",
      "linen wrap dress over a clean one-piece swimsuit",
      "soft cropped resort shirt with a high-waisted beach skirt",
    ],
    romantic: [
      "fashionable bikini with a sheer sarong",
      "romantic halter sundress with delicate sandals",
      "sleek one-piece swimsuit with a gauzy wrap skirt",
    ],
    warm: [
      "stylish one-piece swimsuit with a wrap skirt",
      "soft linen sundress with a defined waist",
      "fitted resort tank with a flowing beach skirt",
    ],
  },
  bedroom: {
    intimate: [
      "white spa bath towel wrap with a clean fitted silhouette",
      "lace-trimmed silk slip with an elegant robe",
      "soft satin wrap dress styled as refined nightwear",
    ],
    reserved: [
      "soft ribbed knit lounge set with a defined waist",
      "fitted cotton pajama set with delicate piping",
      "premium lounge cardigan over a shaped camisole set",
    ],
    romantic: [
      "elegant silk slip nightdress",
      "satin camisole set with a soft robe",
      "lace-trimmed silk nightdress with a clean silhouette",
    ],
    warm: [
      "soft camisole pajama set",
      "ribbed lounge top with fitted knit shorts",
      "silky pajama shirt with tailored lounge shorts",
    ],
  },
  dining: {
    intimate: [
      "form-fitting cocktail dress with refined jewelry",
      "sleek satin midi dress with a defined waist",
      "tailored off-shoulder dinner dress with delicate heels",
    ],
    reserved: [
      "cute knit dress with a collared blouse",
      "soft wrap blouse with a high-waisted midi skirt",
      "tailored cardigan over a silk camisole and pleated skirt",
    ],
    romantic: [
      "elegant slip dress with delicate jewelry",
      "soft off-shoulder midi dress with refined heels",
      "fitted satin blouse with a flowing high-waisted skirt",
    ],
    warm: [
      "stylish fitted midi dress",
      "ribbed knit top with a tailored A-line skirt",
      "silk camisole under a cropped cardigan with a midi skirt",
    ],
  },
  home_private: {
    intimate: [
      "crisp long shirt worn as polished loungewear with bare legs",
      "silk robe over a fitted camisole set",
      "soft satin wrap top with tailored lounge shorts",
    ],
    reserved: [
      "comfortable knit cardigan and lounge pants with a defined waist",
      "soft fitted lounge top with premium knit pants",
      "ribbed cardigan over a camisole with tailored lounge shorts",
    ],
    romantic: [
      "silk robe over a camisole",
      "soft off-shoulder lounge top with fitted shorts",
      "delicate satin lounge set with a clean waistline",
    ],
    warm: [
      "soft off-shoulder lounge top and shorts",
      "fitted ribbed lounge dress with a cozy cardigan",
      "silky camisole with premium knit lounge pants",
    ],
  },
  indoor_quiet: {
    intimate: [
      "chic fitted slip dress under a long open cardigan",
      "sleek knit dress with a deep but covered neckline",
      "tailored satin blouse with a fitted long skirt",
    ],
    reserved: [
      "preppy cardigan over a pleated skirt",
      "soft fitted turtleneck with a high-waisted skirt",
      "tailored blouse with a clean midi skirt",
    ],
    romantic: [
      "fitted knit dress with a delicate necklace",
      "soft wrap dress with a refined cardigan",
      "silk blouse with a flowing high-waisted skirt",
    ],
    warm: [
      "soft fitted turtleneck dress",
      "ribbed knit top with a tailored midi skirt",
      "cropped cardigan over a satin camisole and skirt",
    ],
  },
  nightlife: {
    intimate: [
      "backless high-slit evening dress",
      "sleek satin club dress with refined metallic jewelry",
      "sharp black mini dress with an elegant waist cutout",
    ],
    reserved: [
      "chic black mini dress with a modest neckline",
      "tailored satin party dress with clean heels",
      "sleek fitted top with a high-waisted leather skirt",
    ],
    romantic: [
      "off-shoulder bodycon party dress",
      "glamorous satin slip dress with delicate jewelry",
      "sleek halter mini dress with polished heels",
    ],
    warm: [
      "fitted satin party dress",
      "sleek wrap mini dress with refined jewelry",
      "tailored party top with a high-waisted skirt",
    ],
  },
  outdoor_public: {
    intimate: [
      "bold bodycon mini dress with a light jacket",
      "sleek fitted crop top with a tailored short skirt",
      "polished wrap mini dress with a cropped jacket",
    ],
    reserved: [
      "playful sundress with sneakers",
      "soft wrap blouse with a high-waisted skirt and clean sneakers",
      "tailored cropped jacket over a fitted dress",
    ],
    romantic: [
      "chic short skirt with a fitted crop top",
      "soft romantic mini dress with a light jacket",
      "silky blouse with a tailored short skirt",
    ],
    warm: [
      "flowy short dress with a denim jacket",
      "fitted ribbed top with a high-waisted skirt",
      "soft cropped cardigan over a clean day dress",
    ],
  },
};

const MALE_OUTFIT_OPTIONS: Record<MomentVenue, { modest: readonly string[]; bold: readonly string[] }> = {
  active: {
    bold: [
      "fitted sleeveless training top and athletic shorts",
      "sculpted compression top with tailored training shorts",
      "sleek zip training vest over a fitted athletic top",
    ],
    modest: [
      "athletic t-shirt and training shorts",
      "fitted technical hoodie with slim joggers",
      "clean training jacket over a fitted sports tee",
    ],
  },
  beach: {
    bold: [
      "swim trunks with an unbuttoned linen shirt",
      "tailored swim shorts with a lightweight resort shirt",
      "open summer shirt with clean swim trunks",
    ],
    modest: [
      "swim trunks and an open summer shirt",
      "linen resort shirt with tailored shorts",
      "lightweight knit polo with clean swim shorts",
    ],
  },
  bedroom: {
    bold: [
      "loose half-buttoned linen shirt and lounge pants",
      "soft open-collar pajama shirt with tailored lounge pants",
      "fitted lounge tee with premium drawstring pants",
    ],
    modest: [
      "soft knit loungewear",
      "premium lounge henley with slim knit pants",
      "clean cotton pajama shirt with tailored lounge pants",
    ],
  },
  dining: {
    bold: [
      "fitted dress shirt with rolled-up sleeves",
      "open-collar satin shirt with tailored trousers",
      "slim dark shirt with polished dress trousers",
    ],
    modest: [
      "smart-casual blazer over a plain t-shirt",
      "tailored knit polo with slim trousers",
      "clean button-up shirt with a fitted casual jacket",
    ],
  },
  home_private: {
    bold: [
      "fitted t-shirt and lounge pants",
      "soft open-collar knit shirt with tailored lounge pants",
      "premium fitted henley with relaxed slim joggers",
    ],
    modest: [
      "comfortable hoodie and joggers",
      "soft knit pullover with slim lounge pants",
      "clean lounge cardigan over a fitted tee",
    ],
  },
  indoor_quiet: {
    bold: [
      "fitted dark turtleneck and slim trousers",
      "sleek knit shirt with tailored trousers",
      "sharp fitted cardigan over a clean tee",
    ],
    modest: [
      "soft sweater over a collared shirt",
      "tailored overshirt with a fitted knit tee",
      "clean turtleneck with relaxed slim trousers",
    ],
  },
  nightlife: {
    bold: [
      "open-collar fitted black shirt with sleeves rolled up",
      "sleek satin shirt with slim black trousers",
      "sharp dark jacket over a fitted open-collar shirt",
    ],
    modest: [
      "smart black shirt with slim trousers",
      "tailored black jacket over a fitted tee",
      "clean open-collar shirt with polished trousers",
    ],
  },
  outdoor_public: {
    bold: [
      "fitted henley with chinos",
      "sharp cropped jacket over a fitted tee and chinos",
      "sleek knit polo with tailored trousers",
    ],
    modest: [
      "casual denim jacket over a t-shirt",
      "clean overshirt with a fitted tee and chinos",
      "soft bomber jacket with tailored casual trousers",
    ],
  },
};

function profileOrder(profile?: MomentStyleProfile | null): readonly number[] {
  switch (profile?.key) {
    case "soft_romantic":
      return [1, 0, 2];
    case "sharp_urban":
      return [2, 0, 1];
    case "relaxed_premium":
      return [1, 2, 0];
    case "elegant_minimalist":
    default:
      return [0, 1, 2];
  }
}

export function suggestMomentOutfitOptions(
  venue: MomentVenue,
  tier: StyleTier,
  gender: string | null,
  profile?: MomentStyleProfile | null,
): MomentStylePreset[] {
  const isMale = gender?.trim().toLowerCase().startsWith("m");
  const base = presetBaseMomentStyle(venue, tier, gender);
  const outfits = isMale
    ? MALE_OUTFIT_OPTIONS[venue][tier === "romantic" || tier === "intimate" ? "bold" : "modest"]
    : FEMALE_OUTFIT_OPTIONS[venue][tier];
  return profileOrder(profile).map((index) => ({
    ...base,
    outfit: outfits[index] ?? outfits[0] ?? base.outfit,
  }));
}

function presetBaseMomentStyle(
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

export function presetMomentStyle(
  venue: MomentVenue,
  tier: StyleTier,
  gender: string | null,
  profile?: MomentStyleProfile | null,
): MomentStylePreset {
  return suggestMomentOutfitOptions(venue, tier, gender, profile)[0]!;
}
