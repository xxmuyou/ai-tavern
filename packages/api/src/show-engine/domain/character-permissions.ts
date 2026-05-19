export type EditableCharacterLike = {
  owner_user_id: string | null;
  source: string;
};

export function canEditShowCharacter(
  character: EditableCharacterLike,
  input: { isAdmin?: boolean; userId: string },
): boolean {
  if (input.isAdmin) {
    return true;
  }

  return character.source === "user" && character.owner_user_id === input.userId;
}
