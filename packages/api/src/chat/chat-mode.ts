export type ChatMode = "talk" | "story";

export function parseChatMode(raw: unknown): ChatMode {
  return raw === "story" ? "story" : "talk";
}

export function storyModeRequiresScene(mode: ChatMode, sceneExists: boolean): boolean {
  return mode === "story" && !sceneExists;
}
