const GENERIC_OPENERS = [
  "{name} is reading by the window, glancing up as you arrive.",
  "{name} is checking something on their phone near the entrance of {scene}.",
  "{name} looks lost in thought, then notices you and smiles.",
  "{name} is leaning against a quiet corner of {scene}, waiting for the day to move.",
  "{name} is studying the room with a thoughtful expression.",
  "{name} has just arrived, still carrying the energy of the outside air.",
  "{name} is quietly humming while looking around {scene}.",
  "{name} looks up from a half-finished message as you approach.",
  "{name} is watching the room, then softens when they see you.",
  "{name} is standing near the light, seeming unsure whether to speak first.",
  "{name} is arranging their things, then pauses when you come closer.",
  "{name} is caught mid-thought, eyes returning to you with a small spark.",
  "{name} is near the edge of {scene}, taking in the atmosphere.",
  "{name} notices you almost immediately and gives a quiet nod.",
  "{name} is tracing a finger along the table, distracted until you arrive.",
  "{name} is listening to the room's background noise, expression unreadable.",
  "{name} is looking toward the door, as if expecting someone.",
  "{name} is tucked into a familiar spot, relaxed but attentive.",
  "{name} turns from the view and meets your eyes.",
  "{name} seems ready to leave, but your arrival makes them linger.",
];

export function pickOpener(args: {
  userId: string;
  companionId: string;
  sceneId: string;
  companionName: string;
  sceneName: string;
  now: number;
}): string {
  const day = Math.floor(args.now / 86_400_000);
  const index = stableHash(`${args.userId}:${args.companionId}:${args.sceneId}:${day}`) % GENERIC_OPENERS.length;
  const template = GENERIC_OPENERS[index] ?? GENERIC_OPENERS[0] ?? "{name} notices you arrive.";
  return template.replaceAll("{name}", args.companionName).replaceAll("{scene}", args.sceneName);
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export const GENERIC_OPENER_COUNT = GENERIC_OPENERS.length;
