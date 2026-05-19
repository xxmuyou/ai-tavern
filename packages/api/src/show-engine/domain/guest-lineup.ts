export type GuestLineupCharacter = {
  characterKey: string;
  role: string;
};

export type GuestLineupResult<T extends GuestLineupCharacter> =
  | { guests: T[]; ok: true }
  | { error: string; ok: false; status: number };

export function normalizeSelectedGuestKeys(value: unknown): string[] | null {
  if (value === undefined) {
    return null;
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function resolveSelectedGuestLineup<T extends GuestLineupCharacter>(
  characters: T[],
  selectedGuestKeys: string[],
  maxGuests = 5,
): GuestLineupResult<T> {
  if (selectedGuestKeys.length === 0) {
    return { error: "selected_guest_required", ok: false, status: 400 };
  }

  if (selectedGuestKeys.length > maxGuests) {
    return { error: "selected_guest_limit_exceeded", ok: false, status: 400 };
  }

  if (new Set(selectedGuestKeys).size !== selectedGuestKeys.length) {
    return { error: "selected_guest_duplicate", ok: false, status: 400 };
  }

  const characterByKey = new Map(characters.map((character) => [character.characterKey, character]));
  const guests: T[] = [];

  for (const key of selectedGuestKeys) {
    const character = characterByKey.get(key);
    if (!character) {
      return { error: "selected_guest_not_found", ok: false, status: 404 };
    }

    if (character.role !== "guest") {
      return { error: "selected_guest_invalid_role", ok: false, status: 400 };
    }

    guests.push(character);
  }

  return { guests, ok: true };
}
