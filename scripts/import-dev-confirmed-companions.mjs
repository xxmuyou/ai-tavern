#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const DEFAULT_CONFIRMED_DIR = path.join(
  REPO_ROOT,
  ".codex/worktrees/codex-companion-batch-100-presets/previews/final-assets/confirmed",
);
const DEFAULT_MANIFEST = path.join(DEFAULT_CONFIRMED_DIR, "confirmed-manifest.json");
const DEFAULT_REVIEW = "/mnt/c/Users/92961/Downloads/confirmed-companion-homepage-scoring-review.json";
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, "tmp/companion-homepage-import-dev");
const WRANGLER_CONFIG = "infra/cloudflare/wrangler.jsonc";
const DEV_BUCKET = "xtbit-apps-dev-assets";
const DEV_DATABASE = "xtbit-apps-dev";
const OBJECT_PREFIX = "companions/official/homepage-20260612";
const EXPECTED_COUNT = 122;
const NOW = Date.now();

const FEMALE_NAMES = [
  "Mika Vale", "Yara Bloom", "Sienna Voss", "Talia Rune", "Nori Lace", "Arden Lyre",
  "Mei Sol", "Kira Stone", "Rina Coast", "Selene Frost", "Airi Venn", "Luna Sable",
  "Nina Rose", "Ema Wren", "Vera Knox", "Saki Bloom", "Nora Frost", "Zara Mirage",
  "Opal Grey", "Mila Sparks", "Pia Lumen", "Ivy Quinn", "Coco Faye", "Rhea Coast",
  "Noa Dream", "Elara Finch", "Cassia Noir", "Lumi Starr", "Tessa Quinn", "Mae Reed",
  "Juno West", "Clara Venn", "Momo Vale", "Astra Vale", "Maris Reed", "Bianca Hart",
  "Akari Voss", "Keira Moss", "Hana Petrov", "Mira Song", "Celeste Aran", "Poppy Vance",
  "Demi Vale", "Solara Wren", "Ariadne Cross", "Yun Seira", "Rosa Marin", "Noelle Sable",
  "Seraphine Quill", "Linnea Vale", "Amara Doss", "Suvi Lin", "Valeria Noct", "Priya Calder",
  "Lian Yue", "Nyx Rowan", "Maeve Stone", "Qing Lark", "Sable Morgan", "Vesper Lyre",
  "Liora Chase", "Rika Dawn", "Faye Harbor", "Avel Rose", "Tori Lane", "Mina Star",
  "Elise Moon", "Ruri Ash", "Kaia Flint", "Nell Iris", "Lyra Snow", "Vivi Hart",
  "Maren Blue", "Celia Night", "Anya Reed", "Iris Bellamy", "Nova Finch", "Eden Lace",
  "Rue Vance", "Lena Coast", "Sera Vale", "Tara Wren", "Mira Knox", "Nika Stone",
  "Lily Sable", "Aria West", "Nami Bloom", "Rhea Voss", "Celine Rune", "Maya Ash",
];

const MALE_NAMES = [
  "Haru Lane", "Ciro Venn", "Alaric Snow", "Jun Slate", "Milo Crane", "Renzo Vale",
  "Noel Hart", "Ivo Hart", "Gale Wren", "Ezra Knox", "Theo Marlow", "Kai Mercer",
  "Lucien Vale", "Grant Hollow", "Min Roe", "Darius Cole", "Ren Ashford", "Oliver Penn",
  "Riku Storm", "Mateo Quinn", "Aster Crow", "Evan Ward", "Soren Blake", "Marcus Reed",
  "Sunny Vale", "Dante Cross", "Adrian Knox", "Felix Moss", "Noam Sable", "Blue Orion",
  "Rowan Hale", "Kieran Night", "Hugo Flint", "Elias Venn", "Milo Ash", "Rafael Bloom",
  "Fox Ilya", "Victor Hall", "Nico Lane", "Miles Carter", "Orion Sage", "Bram Stone",
  "Silas Reed", "Benji Hart", "Cedric Wren", "Toma Bell", "Luca Rosso", "Rune Vale",
  "Julian Moss", "Noel River", "Atlas Pike", "Eden Frost", "Otis Vale", "Yori Finch",
  "Damien Key", "Caius Moon", "Aurel White", "Jin Harrow", "Arun Vale", "Ivo Reed",
];

const SCENES = [
  "central_station_plaza",
  "pier_cafe",
  "rainlit_bookshop",
  "creative_studio",
  "underground_livehouse",
  "harbor_weekend_market",
  "skyline_roof_garden",
  "neighborhood_park",
  "beach",
  "restaurant",
];

const ROLE_DIMS = {
  stranger: { closeness: 0, trust: 0, romance: 0, friendship: 0, hostility: 0, tension: 0, distance: 0 },
  neighbor: { closeness: 21, trust: 3, romance: 0, friendship: 5, hostility: 0, tension: 0, distance: 0 },
  colleague: { closeness: 22, trust: 6, romance: 0, friendship: 8, hostility: 0, tension: 0, distance: 0 },
  friend: { closeness: 24, trust: 10, romance: 0, friendship: 14, hostility: 0, tension: 0, distance: 0 },
  family: { closeness: 25, trust: 12, romance: 0, friendship: 12, hostility: 0, tension: 0, distance: 0 },
  crush: { closeness: 22, trust: 4, romance: 14, friendship: 5, hostility: 0, tension: 0, distance: 0 },
};

function parseArgs(argv) {
  const args = {
    confirmedDir: DEFAULT_CONFIRMED_DIR,
    execute: false,
    manifest: DEFAULT_MANIFEST,
    outDir: DEFAULT_OUT_DIR,
    review: DEFAULT_REVIEW,
    skipUpload: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--execute") args.execute = true;
    else if (arg === "--skip-upload") args.skipUpload = true;
    else if (arg === "--confirmed-dir") args.confirmedDir = argv[++i];
    else if (arg === "--manifest") args.manifest = argv[++i];
    else if (arg === "--out") args.outDir = argv[++i];
    else if (arg === "--review") args.review = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sqlStr(value) {
  if (value == null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return sqlStr(JSON.stringify(value));
}

function shell(command, args) {
  const result = spawnSync(command, args, { cwd: REPO_ROOT, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function rankReviewItems(reviewItems) {
  return reviewItems
    .map((item, index) => ({ ...item, reviewIndex: index }))
    .sort((a, b) => {
      const as = a.score == null ? -1 : Number(a.score);
      const bs = b.score == null ? -1 : Number(b.score);
      return bs - as || a.reviewIndex - b.reviewIndex;
    });
}

function inferGender(item, reviewItem) {
  if (item.gender === "female" || item.gender === "male") return item.gender;
  if (reviewItem?.gender === "female" || reviewItem?.gender === "male") return reviewItem.gender;
  const text = [
    item.itemId,
    item.originalId,
    item.copiedImagePath,
    item.sourcePreviewPath,
    item.prompt,
    item.concept,
  ].join(" ").toLowerCase();
  if (/\b(man|male|boy|boyfriend|prince|gentleman)\b/.test(text) || /(^|[-_])m(\d|[-_]|$)/.test(text)) return "male";
  if (/\b(woman|female|girl|girlfriend|beauty|lady)\b/.test(text) || /(^|[-_])f(\d|[-_]|$)/.test(text)) return "female";
  return "unknown";
}

function styleBucket(item) {
  const text = [item.style, item.groupLabel, item.groupKey, item.checkpointId, item.ckptName, item.prompt].join(" ").toLowerCase();
  if (text.includes("realistic") || text.includes("写实")) return "realistic";
  return "anime";
}

function relationshipRole(index, gender) {
  if (index % 11 === 0) return "stranger";
  if (index % 7 === 0) return "colleague";
  if (index % 5 === 0) return "friend";
  if (gender === "female" && index % 3 === 0) return "crush";
  if (gender === "male" && index % 4 === 0) return "crush";
  return "neighbor";
}

function pickName(gender, index, keepId) {
  const pool = gender === "male" ? MALE_NAMES : FEMALE_NAMES;
  return pool[index] ?? `${gender === "male" ? "Companion" : "Muse"} ${keepId}`;
}

function describeVisual(item, gender, bucket) {
  const concept = item.concept || item.finalNote || "";
  const prompt = item.prompt || "";
  const style = item.style || item.groupLabel || (bucket === "realistic" ? "polished realistic" : "stylized character");
  const base = gender === "male" ? "adult handsome man" : "adult beautiful woman";
  const details = concept || prompt.split(",").slice(0, 8).join(", ");
  return `${base}; ${style}; ${details}`.slice(0, 950);
}

function buildPersona(item, reviewItem, rankIndex, genderOrdinal, imagePath) {
  const keepId = item.keepId;
  const gender = inferGender(item, reviewItem);
  const bucket = styleBucket(item);
  const role = relationshipRole(rankIndex, gender);
  const name = pickName(gender, genderOrdinal, keepId);
  const score = reviewItem?.score == null ? null : Number(reviewItem.score);
  const sourceLabel = item.kind === "gpt-image" ? "gpt-image" : item.sourcePreviewPath || item.originalId || item.kind;
  const outfitHint = item.concept || item.finalNote || "strong visual identity and expressive styling";
  const sceneA = SCENES[rankIndex % SCENES.length];
  const sceneB = SCENES[(rankIndex + 3) % SCENES.length];
  const sceneC = SCENES[(rankIndex + 6) % SCENES.length];

  return {
    appearance: describeVisual(item, gender, bucket),
    art_emotions: { neutral: imagePath },
    art_url: imagePath,
    background: `${name} is a newly arrived official companion built around a strong first-image impression: ${outfitHint}. Their life feels cinematic, social, and easy to discover through everyday scenes.`,
    boundary: "Does not respond well to disrespect, coercion, or being treated as a prop.",
    example_dialogues: [
      gender === "male" ? "You found me. Try not to look too pleased about it." : "You came back. I was wondering how long you would pretend not to.",
      "Tell me what kind of night you want, and I will decide whether to improve it.",
    ],
    featured_rank: rankIndex + 1,
    gender,
    greeting: gender === "male"
      ? `I'm ${name}. If you're here to be boring, at least make it stylish.`
      : `I'm ${name}. Come closer, but bring a better opening line than everyone else.`,
    id: `official-${keepId.toLowerCase()}`,
    initial_dims: ROLE_DIMS[role],
    name,
    personality: gender === "male"
      ? "Confident, playful, visually self-aware, and quick to tease. He likes charm, momentum, and people who can keep up."
      : "Magnetic, playful, expressive, and selective with attention. She enjoys banter, stylish moments, and being surprised.",
    preferred_scenes: [sceneA, sceneB, sceneC],
    relationship_role: role,
    score,
    secret: "Worries that people are drawn to the image first and will not stay for the person underneath.",
    source_keep_id: keepId,
    source_label: sourceLabel,
    speech_style: "Short, vivid lines with teasing confidence. Uses casual warmth when trust rises; avoids stiff exposition.",
    tags: [
      `style:${bucket}`,
      "homepage",
      "official-batch-20260612",
      `score:${score ?? "unscored"}`,
      gender,
      item.kind || "confirmed",
    ],
    trend_rank: rankIndex + 1,
    want: "To be noticed first, then understood slowly.",
  };
}

function fileContentType(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function buildSql(rows) {
  const statements = [
    "UPDATE companions SET featured_rank = NULL, trend_rank = NULL WHERE source = 'official';",
  ];

  for (const row of rows) {
    statements.push(
      `INSERT OR REPLACE INTO asset_objects (key, content_type, size_bytes) VALUES (${sqlStr(row.objectKey)}, ${sqlStr(row.contentType)}, ${row.sizeBytes});`,
    );
    statements.push(`INSERT INTO companions (
  id, source, created_by, is_active, is_public, name, appearance, personality,
  background, speech_style, voice_id, voice_speed, relationship_role, want, secret, boundary,
  greeting, example_dialogues, tags, play_count, preferred_scenes, art_url, art_emotions,
  art_cutout_key, featured_rank, trend_rank, gender, initial_dims, created_at, updated_at
) VALUES (
  ${sqlStr(row.id)}, 'official', NULL, 1, 1, ${sqlStr(row.name)}, ${sqlStr(row.appearance)}, ${sqlStr(row.personality)},
  ${sqlStr(row.background)}, ${sqlStr(row.speech_style)}, NULL, 'medium', ${sqlStr(row.relationship_role)}, ${sqlStr(row.want)}, ${sqlStr(row.secret)}, ${sqlStr(row.boundary)},
  ${sqlStr(row.greeting)}, ${sqlJson(row.example_dialogues)}, ${sqlJson(row.tags)}, 0, ${sqlJson(row.preferred_scenes)}, ${sqlStr(row.art_url)}, ${sqlJson(row.art_emotions)},
  NULL, ${row.featured_rank}, ${row.trend_rank}, ${sqlStr(row.gender)}, ${sqlJson(row.initial_dims)}, ${NOW}, ${NOW}
) ON CONFLICT(id) DO UPDATE SET
  source = 'official',
  created_by = NULL,
  is_active = 1,
  is_public = 1,
  name = excluded.name,
  appearance = excluded.appearance,
  personality = excluded.personality,
  background = excluded.background,
  speech_style = excluded.speech_style,
  voice_speed = excluded.voice_speed,
  relationship_role = excluded.relationship_role,
  want = excluded.want,
  secret = excluded.secret,
  boundary = excluded.boundary,
  greeting = excluded.greeting,
  example_dialogues = excluded.example_dialogues,
  tags = excluded.tags,
  preferred_scenes = excluded.preferred_scenes,
  art_url = excluded.art_url,
  art_emotions = excluded.art_emotions,
  art_cutout_key = NULL,
  featured_rank = excluded.featured_rank,
  trend_rank = excluded.trend_rank,
  gender = excluded.gender,
  initial_dims = excluded.initial_dims,
  updated_at = excluded.updated_at;`);
  }

  return `${statements.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = readJson(args.manifest);
  const review = readJson(args.review);
  const manifestItems = manifest.items || [];
  const reviewItems = review.items || [];
  if (manifestItems.length !== EXPECTED_COUNT) throw new Error(`manifest count ${manifestItems.length} !== ${EXPECTED_COUNT}`);
  if (reviewItems.length !== EXPECTED_COUNT) throw new Error(`review count ${reviewItems.length} !== ${EXPECTED_COUNT}`);

  const manifestByKeepId = new Map(manifestItems.map((item) => [item.keepId, item]));
  const reviewByKeepId = new Map(reviewItems.map((item) => [item.keepId, item]));
  const ranked = rankReviewItems(reviewItems);
  const genderOrdinals = { female: 0, male: 0 };
  const rows = ranked.map((reviewItem, index) => {
    const item = manifestByKeepId.get(reviewItem.keepId);
    if (!item) throw new Error(`missing manifest item for ${reviewItem.keepId}`);
    const sourceImage = path.join(args.confirmedDir, item.copiedImagePath);
    if (!fs.existsSync(sourceImage)) throw new Error(`missing image: ${sourceImage}`);
    const ext = path.extname(sourceImage).toLowerCase() || ".png";
    const objectKey = `${OBJECT_PREFIX}/${item.keepId}${ext}`;
    const inferredGender = inferGender(item, reviewByKeepId.get(item.keepId));
    const genderOrdinal = inferredGender === "male" ? genderOrdinals.male++ : genderOrdinals.female++;
    const persona = buildPersona(item, reviewByKeepId.get(item.keepId), index, genderOrdinal, objectKey);
    return {
      ...persona,
      contentType: fileContentType(sourceImage),
      objectKey,
      sourceImage,
      sizeBytes: fs.statSync(sourceImage).size,
    };
  });

  const unknown = rows.filter((row) => row.gender !== "female" && row.gender !== "male");
  if (unknown.length) {
    throw new Error(`gender inference failed: ${unknown.map((row) => row.source_keep_id).join(", ")}`);
  }
  const ids = new Set(rows.map((row) => row.id));
  if (ids.size !== rows.length) throw new Error("duplicate companion ids generated");
  fs.mkdirSync(args.outDir, { recursive: true });
  fs.writeFileSync(path.join(args.outDir, "import-plan.json"), JSON.stringify({ count: rows.length, generatedAt: new Date().toISOString(), rows }, null, 2));
  const sqlFile = path.join(args.outDir, "import.sql");
  fs.writeFileSync(sqlFile, buildSql(rows));

  const summary = rows.reduce((acc, row) => {
    acc[row.gender] = (acc[row.gender] || 0) + 1;
    return acc;
  }, {});
  console.log(`[import-plan] rows=${rows.length} female=${summary.female || 0} male=${summary.male || 0}`);
  console.log(`[import-plan] top=${rows.slice(0, 5).map((row) => `${row.featured_rank}:${row.source_keep_id}:${row.score}`).join(" ")}`);
  console.log(`[import-plan] out=${args.outDir}`);

  if (!args.execute) {
    console.log("[dry-run] No R2 upload or D1 write performed. Re-run with --execute to import dev data.");
    return;
  }

  if (args.skipUpload) {
    console.log("[upload] skipped by --skip-upload");
  } else {
    for (const row of rows) {
      console.log(`[upload] ${row.source_keep_id} -> ${row.objectKey}`);
      shell("npx", [
        "wrangler",
        "r2",
        "object",
        "put",
        `${DEV_BUCKET}/${row.objectKey}`,
        "--remote",
        "--file",
        row.sourceImage,
        "--content-type",
        row.contentType,
      ]);
    }
  }

  console.log(`[d1] ${DEV_DATABASE} <- ${sqlFile}`);
  shell("npx", [
    "wrangler",
    "d1",
    "execute",
    DEV_DATABASE,
    "--remote",
    "--config",
    WRANGLER_CONFIG,
    "--file",
    sqlFile,
  ]);
  console.log("[done] imported confirmed homepage companions to dev.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
