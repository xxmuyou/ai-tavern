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

export type MomentPoseCandidate = {
  bodyPose: string;
};

export type MomentCameraCandidate = {
  cameraView: string;
};

export type MomentExpressionCandidate = {
  expression: string;
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
    "boldest allowed: private bedrooms may use a bath towel wrap, lace-trim short nightdress, open robe, or thigh-high stockings; public venues stay glamorous and sexy but not explicit. Still never nude, never topless, nothing see-through over the chest.",
  reserved:
    "stylish and attractive; fitted silhouettes, short skirts or shorts, and sheer stockings are allowed when venue-appropriate; no sleepwear, towels, or swimwear except in matching private/beach venues.",
  romantic:
    "alluring but covered; off-shoulder tops, fitted dresses, camisoles, short skirts, and elegant private-room nightwear are good.",
  warm: "more fitted and charming; camisoles, cropped layers, short skirts, stockings, and sporty fitted cuts are good when they fit the venue.",
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
      "strappy athletic crop top with high-waisted training shorts",
      "sports-bra-style top under a cropped zip jacket with sculpting shorts",
      "sleek zip-front training top over a fitted athletic top with a short skirt",
    ],
    reserved: [
      "fitted training tee with high-waisted biker shorts",
      "cropped technical jacket over a fitted tank with an athletic skirt",
      "fitted tennis dress with clean sporty accessories",
    ],
    romantic: [
      "sleek cropped workout top with high-waisted biker shorts",
      "fitted dance wrap top with a short athletic skirt",
      "form-fitting racerback tank with sculpting leggings",
    ],
    warm: [
      "fitted athletic tank with high-waisted training shorts",
      "cropped sports top with sculpting leggings",
      "fitted zip-front training top with a short athletic skirt",
    ],
  },
  beach: {
    intimate: [
      "daring strappy bikini with an elegant sheer sarong",
      "minimal bikini under an open linen cover-up",
      "cutout one-piece swimsuit with an open wrap cover-up",
    ],
    reserved: [
      "fitted resort mini dress over a modest swimsuit",
      "cropped resort shirt over a fitted one-piece swimsuit with a wrap skirt",
      "fitted tank with high-waisted beach shorts and a sheer cover-up",
    ],
    romantic: [
      "strappy bikini with an elegant sheer sarong",
      "sleek one-piece swimsuit with a gauzy wrap skirt",
      "fitted resort camisole with a flowing beach mini skirt",
    ],
    warm: [
      "cutout one-piece swimsuit with a wrap skirt",
      "bikini top under an open resort shirt with a high-waisted beach skirt",
      "halter resort mini dress with a swimsuit underneath",
    ],
  },
  bedroom: {
    intimate: [
      "wrapped only in a bath towel, covered silhouette with a defined waist",
      "lace-trim short slip nightdress with thigh-high stockings",
      "strappy satin short nightdress under an open robe",
    ],
    reserved: [
      "fitted short nightdress with subtle lace trim and a soft robe",
      "fitted camisole pajama set with tailored short lounge shorts",
      "crisp short sleep shirt styled with a defined waist and bare-leg silhouette",
    ],
    romantic: [
      "short lace-trim slip nightdress with a sheer robe",
      "satin short nightdress with thigh-high stockings and delicate accessories",
      "silk robe over a fitted camisole set with a clean waistline",
    ],
    warm: [
      "lace-trim short nightdress under a light robe",
      "satin camisole set with thigh-high socks and a soft robe",
      "silk pajama shirt worn slightly off-shoulder with tailored lounge shorts",
    ],
  },
  dining: {
    intimate: [
      "bodycon cocktail dress with sheer stockings and polished accessories",
      "curve-hugging dinner dress with an elegant side slit and refined jewelry",
      "corset-style fitted top with a tailored mini skirt and sheer stockings",
    ],
    reserved: [
      "fitted knit mini dress with sheer stockings and delicate accessories",
      "cropped jacket over a fitted camisole with a pleated mini skirt",
      "fitted blouse with a high-waisted short skirt and sheer stockings",
    ],
    romantic: [
      "fitted slip dress with delicate jewelry and sheer stockings",
      "off-shoulder dinner dress with thigh-high stockings and refined accessories",
      "satin camisole top with a high-waisted mini skirt and cropped jacket",
    ],
    warm: [
      "body-hugging midi dress with a subtle side slit and delicate accessories",
      "fitted camisole under a cropped cardigan with a short skirt and sheer stockings",
      "off-shoulder knit top with a tailored mini skirt",
    ],
  },
  home_private: {
    intimate: [
      "crisp long shirt styled as a mini lounge dress with a defined waist",
      "silk robe over a lace-trim camisole set with thigh-high stockings",
      "satin camisole with short lounge shorts under an open robe",
    ],
    reserved: [
      "fitted knit lounge top with high-waisted lounge shorts",
      "cropped lounge cardigan over a fitted camisole with a short skirt",
      "soft fitted lounge dress with a defined waist",
    ],
    romantic: [
      "silk robe over a fitted camisole set with short lounge shorts",
      "fitted ribbed mini lounge dress with thigh-high socks",
      "satin wrap top with tailored lounge shorts and delicate accessories",
    ],
    warm: [
      "off-shoulder fitted lounge top with tailored lounge shorts",
      "cropped knit top with a fitted lounge skirt",
      "silky camisole with premium lounge shorts and a light robe",
    ],
  },
  indoor_quiet: {
    intimate: [
      "chic slip dress under a long open cardigan with sheer stockings",
      "fitted satin blouse with a high-waisted mini skirt and thigh-high stockings",
      "body-hugging knit mini dress with delicate accessories",
    ],
    reserved: [
      "fitted turtleneck mini dress with sheer stockings",
      "cropped cardigan over a fitted camisole with a pleated mini skirt",
      "tailored blouse with a high-waisted short skirt and sheer stockings",
    ],
    romantic: [
      "fitted knit dress with a subtle side slit and sheer stockings",
      "silk blouse with a fitted mini skirt and thigh-high stockings",
      "lace-trim camisole under a long open cardigan with a short skirt",
    ],
    warm: [
      "ribbed fitted top with a tailored mini skirt and thigh-high socks",
      "off-shoulder knit dress with a clean waistline",
      "fitted camisole under a cropped jacket with a pleated mini skirt",
    ],
  },
  nightlife: {
    intimate: [
      "backless high-slit evening dress with sheer stockings",
      "corset mini dress with thigh-high stockings and polished accessories",
      "strappy fitted party dress with an elegant waist cutout",
    ],
    reserved: [
      "fitted party mini dress with a modest neckline and sheer stockings",
      "tailored party top with a high-waisted mini skirt and a sleek jacket",
      "fitted evening top with a structured short skirt and polished accessories",
    ],
    romantic: [
      "off-shoulder bodycon party dress with thigh-high stockings",
      "halter mini dress with sheer stockings and delicate jewelry",
      "lace-trim camisole top with a fitted leather skirt and polished accessories",
    ],
    warm: [
      "satin party dress with thigh-high stockings and refined jewelry",
      "cropped jacket over a fitted bustier-style top with a tailored mini skirt",
      "wrap mini dress with sheer stockings and elegant accessories",
    ],
  },
  outdoor_public: {
    intimate: [
      "fitted mini dress with a long light coat and sheer stockings",
      "corset-style day top with tailored shorts and a cropped jacket",
      "fitted camisole with a short skirt under a light trench coat",
    ],
    reserved: [
      "fitted top with a pleated mini skirt and a light jacket",
      "tailored short dress with a cropped jacket",
      "fitted blouse with high-waisted shorts and polished accessories",
    ],
    romantic: [
      "fitted crop top with a high-waisted short skirt and a light coat",
      "body-hugging day dress with a cropped jacket",
      "silk camisole with tailored shorts under a light trench coat",
    ],
    warm: [
      "ribbed fitted top with a mini skirt and a cropped jacket",
      "sporty fitted tank with tailored shorts and a light jacket",
      "off-shoulder day top with a short skirt and delicate accessories",
    ],
  },
};

const MALE_OUTFIT_OPTIONS: Record<MomentVenue, { modest: readonly string[]; bold: readonly string[] }> = {
  active: {
    bold: [
      "fitted sleeveless training top with tailored athletic shorts",
      "open training vest over a fitted tank with slim joggers",
      "sculpted compression top with athletic shorts",
    ],
    modest: [
      "fitted technical tee with tailored training shorts",
      "light zip training jacket over a fitted athletic top with joggers",
      "clean sleeveless training top layered under a sporty jacket with athletic shorts",
    ],
  },
  beach: {
    bold: [
      "unbuttoned resort shirt with fitted swim trunks",
      "fitted tank with swim shorts and an open cover-up shirt",
      "tailored swim shorts with an open linen shirt",
    ],
    modest: [
      "resort shirt with tailored swim shorts",
      "open summer shirt over a fitted tank with swim shorts",
      "lightweight knit polo with clean swim shorts",
    ],
  },
  bedroom: {
    bold: [
      "open-collar pajama shirt with tailored lounge pants",
      "loose half-buttoned linen shirt with lounge pants",
      "fitted tank with loose lounge pants",
    ],
    modest: [
      "fitted lounge tee with soft knit pants",
      "clean pajama shirt with tailored lounge pants",
      "premium henley with relaxed lounge shorts",
    ],
  },
  dining: {
    bold: [
      "open-collar fitted dress shirt with rolled sleeves",
      "satin shirt with tailored trousers",
      "fitted vest over a low-collar shirt with tailored trousers",
    ],
    modest: [
      "tailored knit polo with slim trousers",
      "casual blazer over a fitted tee with polished trousers",
      "button-up shirt with rolled sleeves and tailored trousers",
    ],
  },
  home_private: {
    bold: [
      "fitted tank with lounge pants",
      "open-collar knit shirt with tailored lounge pants",
      "sleeveless lounge top with relaxed slim joggers",
    ],
    modest: [
      "fitted tee with slim lounge joggers",
      "lounge cardigan over a fitted tee with knit pants",
      "soft knit henley with tailored lounge pants",
    ],
  },
  indoor_quiet: {
    bold: [
      "sleek fitted knit shirt with tailored trousers",
      "low-collar knit shirt with a sharp cardigan and slim trousers",
      "fitted vest over a clean shirt with tailored trousers",
    ],
    modest: [
      "fitted turtleneck with tailored trousers",
      "tailored overshirt over a fitted tee with slim trousers",
      "clean knit polo with relaxed tailored trousers",
    ],
  },
  nightlife: {
    bold: [
      "open-collar fitted shirt with sleeves rolled up",
      "satin shirt with slim trousers",
      "sleeveless stage vest with fitted trousers",
    ],
    modest: [
      "fitted open-collar shirt with slim trousers",
      "tailored jacket over a fitted tee with polished trousers",
      "smart shirt with rolled sleeves and tailored trousers",
    ],
  },
  outdoor_public: {
    bold: [
      "fitted tank under a cropped jacket with chinos",
      "open short-sleeve shirt over a tank with tailored shorts",
      "fitted knit polo with tailored shorts or slim trousers",
    ],
    modest: [
      "fitted tee with a light jacket and chinos",
      "tailored overshirt over a fitted tee with casual trousers",
      "fitted henley with relaxed tailored trousers",
    ],
  },
};

const FALLBACK_POSE_OPTIONS: readonly string[] = [
  "standing three-quarter pose, face toward viewer",
  "seated relaxed pose, face toward viewer",
  "leaning pose, face toward viewer",
  "mid-step turn pose, face toward viewer",
  "reclining side pose, face toward viewer",
];

const CAMERA_VIEW_OPTIONS: Record<MomentVenue, readonly string[]> = {
  active: [
    "side-view action composition",
    "low-angle athletic view",
    "three-quarter dynamic view",
    "medium shot with angled composition",
  ],
  beach: [
    "low-angle seaside view",
    "side-view composition",
    "rear three-quarter over-the-shoulder view",
    "high-angle seaside view",
    "dynamic three-quarter seaside view",
  ],
  bedroom: [
    "high-angle view from above, close intimate crop",
    "overhead view from above",
    "side-view intimate composition",
    "rear three-quarter over-the-shoulder view",
    "low-angle view from below eye level, tasteful intimate composition",
  ],
  dining: [
    "front three-quarter view, medium angled shot",
    "side-view table-side composition",
    "high-angle table-side view",
    "rear three-quarter over-the-shoulder view",
  ],
  home_private: [
    "low-angle sofa-side view from below eye level",
    "close intimate crop",
    "side-view composition",
    "rear three-quarter over-the-shoulder view",
    "high-angle intimate view from above",
  ],
  indoor_quiet: [
    "front three-quarter view, medium angled shot",
    "side-view composition",
    "high-angle quiet indoor view",
    "rear three-quarter over-the-shoulder view",
  ],
  nightlife: [
    "low-angle dramatic view",
    "side-view neon composition",
    "rear three-quarter over-the-shoulder view",
    "close intimate crop",
    "dynamic angled composition",
  ],
  outdoor_public: [
    "front three-quarter view, medium angled shot",
    "side-view composition",
    "rear three-quarter over-the-shoulder view",
    "high-angle outdoor view",
    "dynamic three-quarter outdoor view",
  ],
};

type MomentEmotionBucket = "annoyed" | "guarded" | "neutral" | "playful" | "tense" | "warm";

const FEMALE_EXPRESSION_OPTIONS: Record<MomentEmotionBucket, readonly string[]> = {
  annoyed: [
    "cute sulky pout, cheeks puffed, big annoyed eyes, brows pinched softly",
    "puffed-cheek grumpy face, eyes lifted toward the viewer, brows knitted, small frown",
    "annoyed pout with one brow raised, cheeks tense, lips pursed in a cute way",
    "frustrated cute frown, softened angry eyes, brows furrowed, small pressed mouth",
  ],
  guarded: [
    "guarded half-smile, cautious eyes, slightly knit brows, closed lips",
    "composed reserved look, steady eyes, controlled brows, calm mouth",
    "conflicted soft gaze, brows drawn gently, faint uncertain smile",
    "cool polite smile, measuring eyes, small restrained mouth curve",
  ],
  neutral: [
    "calm attentive expression, clear eyes, relaxed brows, soft natural mouth",
    "curious slight smile, bright eyes, gently lifted brows, small mouth curve",
    "thoughtful soft look, eyes calm, brows relaxed, lips gently closed",
    "composed confident gaze, steady eyes, relaxed brows, clean mouth line",
  ],
  playful: [
    "mischievous bright smile, lively eyes, one brow slightly raised, teasing mouth curve",
    "teasing half-smile, eyes playful, brows lifted softly, lips gently curved",
    "playful wink, one eye closed, bright smile, lifted brow, lips softly curved",
    "tiny tongue-out grin, lively eyes, raised brows, playful cute mouth shape",
  ],
  tense: [
    "anxious controlled gaze, widened eyes, knitted brows, lips pressed lightly",
    "vulnerable worried look, soft eyes, tense brows, small uncertain mouth",
    "breath-held faint smile, uneasy eyes, brows lifted at the center, lips slightly parted",
    "nervous shy look, eyes lowered softly, worried brows, small closed-mouth smile",
  ],
  warm: [
    "soft genuine smile, warm eyes, relaxed brows, lips gently curved",
    "shy warm smile, eyes lowered softly, gentle brows, small closed-mouth smile",
    "relieved tender smile, softened eyes, brows easing, natural mouth curve",
    "bright affectionate smile, clear eyes, lifted cheeks, relaxed lips",
  ],
};

const MALE_EXPRESSION_OPTIONS: Record<MomentEmotionBucket, readonly string[]> = {
  annoyed: [
    "cool composed stare, narrowed eyes, one brow raised, lips pressed",
    "restrained annoyed look, sharp eyes, tense brows, firm tight mouth",
    "irritated half-smirk, cutting eyes, controlled brows, lips curved faintly",
    "skeptical look, brows arched, eyes direct, mouth turned slightly down",
  ],
  guarded: [
    "guarded half-smile, cautious eyes, slightly knit brows, closed lips",
    "composed reserved look, steady eyes, controlled brows, firm calm mouth",
    "conflicted quiet gaze, brows drawn gently, faint uncertain smile",
    "cool polite smile, assessing eyes, small restrained mouth curve",
  ],
  neutral: [
    "calm attentive expression, clear eyes, relaxed brows, natural mouth",
    "curious slight smile, steady eyes, gently lifted brows, small mouth curve",
    "thoughtful composed look, eyes calm, brows relaxed, lips gently closed",
    "composed confident gaze, steady eyes, relaxed brows, clean mouth line",
  ],
  playful: [
    "mischievous confident smile, lively eyes, one brow slightly raised, teasing mouth curve",
    "playful half-smirk, amused eyes, brows lifted softly, lips curved",
    "easy amused grin, smiling eyes, relaxed brows, natural mouth shape",
    "bright competitive smile, clear eyes, raised brows, relaxed lips",
  ],
  tense: [
    "anxious controlled gaze, steady widened eyes, knitted brows, lips pressed lightly",
    "worried restrained look, softened eyes, tense brows, firm uncertain mouth",
    "breath-held faint smile, uneasy eyes, brows lifted at the center, lips slightly parted",
    "quiet tense look, eyes lowered softly, worried brows, small closed-mouth smile",
  ],
  warm: [
    "gentle confident smile, warm eyes, relaxed brows, natural mouth curve",
    "quiet shy smile, softened eyes, calm brows, small closed-mouth smile",
    "relieved soft smile, steady eyes, brows easing, relaxed mouth",
    "bright easy smile, clear eyes, lifted cheeks, relaxed lips",
  ],
};

function normalizeEmotionBucket(emotion: string | null | undefined): MomentEmotionBucket {
  switch (emotion?.trim().toLowerCase()) {
    case "annoyed":
      return "annoyed";
    case "guarded":
      return "guarded";
    case "playful":
      return "playful";
    case "tense":
      return "tense";
    case "warm":
      return "warm";
    default:
      return "neutral";
  }
}

function isMaleGender(gender: string | null | undefined): boolean {
  return gender?.trim().toLowerCase().startsWith("m") ?? false;
}

export function suggestMomentPoseOptions(
  _venue?: MomentVenue,
  _gender?: string | null,
): MomentPoseCandidate[] {
  return suggestMomentFallbackPoseOptions();
}

export function suggestMomentFallbackPoseOptions(): MomentPoseCandidate[] {
  return FALLBACK_POSE_OPTIONS.map((bodyPose) => ({ bodyPose }));
}

export function suggestMomentCameraOptions(
  venue: MomentVenue,
  _privacy: MomentScenePrivacy,
): MomentCameraCandidate[] {
  return CAMERA_VIEW_OPTIONS[venue].map((cameraView) => ({ cameraView }));
}

export function suggestMomentExpressionOptions(
  emotion: string | null | undefined,
  gender: string | null,
): MomentExpressionCandidate[] {
  const bucket = normalizeEmotionBucket(emotion);
  const options = isMaleGender(gender)
    ? MALE_EXPRESSION_OPTIONS[bucket]
    : FEMALE_EXPRESSION_OPTIONS[bucket];
  return options.map((expression) => ({ expression }));
}

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
