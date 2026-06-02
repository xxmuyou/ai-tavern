import type {
  ActivityType,
  RelationshipStage,
  RelationshipGoal,
  RecommendedActivity,
} from "../life/types";
import type { DimensionValues } from "./level";

// Derive the high-level "stage" from the 7-dimension vector. Negative-valence
// stages (hostile / estranged / strained) take precedence over positive ones,
// matching the existing `computeLevel` semantics in level.ts.
//
// Positive stages climb monotonically through:
//   first_contact -> familiar -> trusted -> close_friend
//                          \                          \
//                           romantic_tension -> dating -> committed
//
// `stage_progress` is the 0..1 fraction toward the *next* stage on the most
// natural path, derived from the dominant dimension for that transition.

export type StageResult = {
  stage: RelationshipStage;
  stage_progress: number;
  next_goal: RelationshipGoal | null;
  recommended_activity: RecommendedActivity | null;
};

type StageRule = {
  stage: RelationshipStage;
  predicate: (dims: DimensionValues) => boolean;
  nextGoal: RelationshipGoal | null;
  recommended: RecommendedActivity | null;
  progress: (dims: DimensionValues) => number;
};

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

const POSITIVE_RULES: readonly StageRule[] = [
  {
    stage: "committed",
    predicate: (d) => d.romance >= 75 && d.trust >= 55,
    nextGoal: null,
    recommended: { activity_type: "date", reason: "Keep your bond alive — plan something just for you two." },
    progress: () => 1,
  },
  {
    stage: "dating",
    predicate: (d) => d.romance >= 50 && d.tension <= 50 && d.hostility <= 50,
    nextGoal: {
      description: "Build enough trust and romance to make it official.",
      target_dim: "romance",
      target_value: 75,
    },
    recommended: { activity_type: "date", reason: "Spend a meaningful evening together." },
    progress: (d) => clamp01((d.romance - 50) / 25),
  },
  {
    stage: "romantic_tension",
    predicate: (d) => d.romance >= 30,
    nextGoal: {
      description: "Spend more time alone together to turn tension into a real date.",
      target_dim: "romance",
      target_value: 50,
    },
    recommended: { activity_type: "invite", reason: "Invite them somewhere private and see what happens." },
    progress: (d) => clamp01((d.romance - 30) / 20),
  },
  {
    stage: "close_friend",
    predicate: (d) => d.closeness >= 60 && d.friendship >= 50 && d.trust >= 40,
    nextGoal: {
      description: "Open up romantically — share something personal next time you meet.",
      target_dim: "romance",
      target_value: 30,
    },
    recommended: { activity_type: "hang_out", reason: "Pick a place you both love and just be together." },
    progress: (d) => clamp01(d.romance / 30),
  },
  {
    stage: "trusted",
    predicate: (d) => d.trust >= 35,
    nextGoal: {
      description: "Deepen the friendship by hanging out more often.",
      target_dim: "friendship",
      target_value: 50,
    },
    recommended: { activity_type: "hang_out", reason: "Make this a regular spot in their week." },
    progress: (d) => clamp01((d.friendship - 30) / 20),
  },
  {
    stage: "familiar",
    predicate: (d) => d.closeness >= 20,
    nextGoal: {
      description: "Earn their trust — listen, follow through, show up.",
      target_dim: "trust",
      target_value: 35,
    },
    recommended: { activity_type: "check_in", reason: "Small consistent check-ins beat one grand gesture." },
    progress: (d) => clamp01((d.trust - 20) / 15),
  },
  {
    stage: "first_contact",
    predicate: () => true,
    nextGoal: {
      description: "Spend more time around them so they recognise you.",
      target_dim: "closeness",
      target_value: 20,
    },
    recommended: { activity_type: "check_in", reason: "Say hi. Notice something specific. Keep it brief." },
    progress: (d) => clamp01(d.closeness / 20),
  },
];

const REPAIR_ACTIVITY: RecommendedActivity = {
  activity_type: "repair" as ActivityType,
  reason: "Defuse before it gets worse — apologise, listen, give them space if needed.",
};

export function deriveStage(dims: DimensionValues): StageResult {
  // Negative override first.
  if (dims.hostility > 50) {
    return {
      stage: "hostile",
      stage_progress: clamp01((100 - dims.hostility) / 50),
      next_goal: {
        description: "Bring hostility down before anything else can move.",
        target_dim: "hostility",
        target_value: 50,
      },
      recommended_activity: REPAIR_ACTIVITY,
    };
  }
  if (dims.distance > 60) {
    return {
      stage: "estranged",
      stage_progress: clamp01((100 - dims.distance) / 40),
      next_goal: {
        description: "Close the distance — small, consistent contact.",
        target_dim: "distance",
        target_value: 60,
      },
      recommended_activity: REPAIR_ACTIVITY,
    };
  }
  if (dims.tension > 50) {
    return {
      stage: "strained",
      stage_progress: clamp01((100 - dims.tension) / 50),
      next_goal: {
        description: "Cool the tension. Don't push them.",
        target_dim: "tension",
        target_value: 50,
      },
      recommended_activity: REPAIR_ACTIVITY,
    };
  }

  for (const rule of POSITIVE_RULES) {
    if (rule.predicate(dims)) {
      return {
        stage: rule.stage,
        stage_progress: rule.progress(dims),
        next_goal: rule.nextGoal,
        recommended_activity: rule.recommended,
      };
    }
  }

  // Unreachable: first_contact predicate matches everything.
  return {
    stage: "first_contact",
    stage_progress: 0,
    next_goal: null,
    recommended_activity: null,
  };
}
