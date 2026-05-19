const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8787';
const DATING_SHOW_KEY = 'dating-heart-signal';

export const EMAIL_STORAGE_KEY = 'xtbit.companion.email';
export const BILLING_EMAIL_STORAGE_KEY = 'xtbit.billing.email';
export const AUTH_TOKEN_STORAGE_KEY = 'xtbit.companion.authToken';
export const AUTH_EXPIRES_STORAGE_KEY = 'xtbit.companion.authExpiresAt';

export type AuthSession = {
  email: string;
  expiresAt: string;
  token: string;
  user: {
    email: string;
    id: string;
  };
};

export type AsyncState<T> =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string };

export type CompanionCharacter = {
  assets: Record<string, unknown>;
  avatarObjectKey: string | null;
  characterKey: string;
  dimensions: Record<string, unknown>;
  displayName: string;
  id: string;
  identity: Record<string, unknown>;
  name: string;
  persona: Record<string, unknown>;
  publicProfile: Record<string, unknown>;
  status: string;
  style: Record<string, unknown>;
  tags: string[];
  tagline: string;
  version: number;
  visibility: 'private' | 'public';
};

export type RelationshipPayload = {
  character: CompanionCharacter;
  recentEvents: {
    createdAt: string;
    deltas: Record<string, unknown>;
    id: string;
    memoryText: string;
    signals: string[];
    type: string;
  }[];
  relationship: {
    characterKey: string;
    characterVersion: number;
    dimensions: Record<string, number>;
    id: string;
    status: string;
    summary: string;
    updatedAt: string;
    userId: string;
  };
  user: {
    email: string;
    id: string;
  };
};

export type ScenePack = {
  config: Record<string, unknown>;
  genre: string;
  id: string;
  sceneKey: string;
  status: string;
  summary: string;
  title: string;
  uiLabels: Record<string, unknown>;
};

export type SceneOption = {
  id: string;
  label: string;
  preview: string;
  relationshipEffects?: Record<string, number>;
  signals?: string[];
};

export type SceneTurn = {
  answerText: string | null;
  id: string;
  options: SceneOption[];
  prompt: string;
  responseText: string | null;
  selectedOptionId: string | null;
  status: 'answered' | 'awaiting_user';
  stepKey: string;
  turnIndex: number;
};

export type SceneSessionPayload = {
  currentTurn: SceneTurn | null;
  relationship: RelationshipPayload['relationship'];
  scene: ScenePack;
  session: {
    characterKey: string;
    currentStepKey: string;
    id: string;
    sceneKey: string;
    status: 'active' | 'completed';
    turnCount: number;
  };
  turns: SceneTurn[];
};

export type ChapterTwoDateLocation = {
  assetKey: string;
  locationKey: 'bar' | 'cafe' | 'cinema';
  summary: string;
  title: string;
};

export type ChapterTwoDateOption = {
  id: string;
  label: string;
  preview: string;
  tone: string;
};

export type ChapterTwoDateTurn = {
  answerText: string | null;
  createdAt: string;
  id: string;
  options: ChapterTwoDateOption[];
  prompt: string;
  responseText: string | null;
  selectedOptionId: string | null;
  status: 'answered' | 'awaiting_user';
  stepKey: string;
  turnIndex: number;
  updatedAt: string;
};

export type GuestCharacterPackage = {
  assets: {
    avatarObjectKey: string | null;
    galleryObjectKeys: string[];
    portraitObjectKey: string | null;
    visualStates: Record<string, { label?: string; objectKey: string }>;
  };
  identity: {
    ageRange?: string;
    cityOrLifestyle?: string;
    gender: 'female' | 'male' | null;
    hobbies: string[];
    name: string;
    occupation?: string;
  };
  matchRules: {
    blowUpSignals: string[];
    dealbreakerSignals: string[];
    hardPreferenceSignals: string[];
    initialAffinity: number;
    matchThreshold: number;
    negativeSignals: string[];
    positiveSignals: string[];
    softPreferenceSignals: string[];
  };
  persona: {
    backstory?: string;
    boundaries: string;
    goal: string;
    hiddenPreferences: string;
    personality: string;
    relationshipToUser: string;
    speakingStyle: string;
  };
  publicProfile: Record<string, unknown>;
  stateModel: {
    coefficients: Record<string, number>;
    runtimeDefaults: {
      action: string;
      curiosity: number;
      energy: number;
      expression: string;
      intimacy: number;
      mood: string;
    };
  };
};

export type GuestCharacterPackagePayload = {
  character: ShowGuest;
  characterPackage: GuestCharacterPackage;
  visualStateObjectKey: string | null;
};

export type RelationshipState = 'regular_friend' | 'date_object' | 'love_object';

export function canEnterChapterTwoForCompanion(
  companion: { relationshipState?: string | null },
  isAdmin: boolean,
): boolean {
  if (isAdmin) {
    return true;
  }
  return companion.relationshipState === 'date_object' || companion.relationshipState === 'love_object';
}

export function canEnterChapterThreeForCompanion(
  companion: { relationshipState?: string | null },
  isAdmin: boolean,
): boolean {
  if (isAdmin) {
    return true;
  }
  return companion.relationshipState === 'love_object';
}

export type UnlockedCompanion = {
  avatarObjectKey: string | null;
  characterKey: string;
  id: string;
  lastStoryAt: string | null;
  name: string;
  profile?: {
    avatarObjectKey?: string | null;
    characterKey?: string;
    name?: string;
    occupationTag?: string;
    personalityKeywords?: string[];
    source?: string;
  };
  relationshipState: RelationshipState;
  sourceSessionId?: string;
  storyTurnCount: number;
  unlockStatus: string;
  updatedAt: string;
};


export type ChapterTwoDateSessionPayload = {
  companion: UnlockedCompanion;
  currentTurn: ChapterTwoDateTurn | null;
  location: ChapterTwoDateLocation | null;
  session: {
    characterKey: string;
    companionId: string;
    currentStepKey: string;
    id: string;
    locationKey: string;
    showKey: string;
    status: 'active' | 'completed';
    turnCount: number;
    updatedAt: string;
  };
  turns: ChapterTwoDateTurn[];
};

export type ShowGuest = {
  ageRange?: string;
  avatarObjectKey: string | null;
  characterKey: string;
  cityOrLifestyle?: string;
  gender: 'female' | 'male' | null;
  hobbies: string[];
  id: string;
  name: string;
  occupationTag?: string;
  personalityKeywords: string[];
  portraitObjectKey: string | null;
  preferences: string[];
  role: 'guest' | 'host' | 'support';
  source: 'official' | 'user';
  statusLabel: string;
  visibility: 'private' | 'public';
  visualStateObjectKey: string | null;
};

export type SystemAsset = {
  characterKey: string | null;
  kind: 'background' | 'character';
  label: string;
  objectKey: string | null;
  role: 'background' | 'guest' | 'host' | 'support';
};

export type UserGuestAsset = {
  acquisitionMethod: string;
  characterKey: string;
  createdAt: string;
  id: string;
  source: 'community' | 'official' | 'user';
  status: 'active' | 'archived';
  updatedAt: string;
};

export type WorkspaceGuest = ShowGuest & {
  asset: UserGuestAsset | null;
};

export type ShowWorkspacePayload = {
  admin?: {
    isAdmin: boolean;
    systemAssets: SystemAsset[];
  };
  assets: Record<string, unknown>;
  characters: ShowGuest[];
  chapterOne?: {
    slotCount: number;
  };
  companions: UnlockedCompanion[];
  guestAssets: WorkspaceGuest[];
  profile: {
    avatarObjectKey: string | null;
    derivedTags: string[];
    displayName: string;
    hardIdentity: {
      ageRange: string;
      hobbies: string[];
      occupation: string;
    };
  };
  recentSessions: ShowWorkspaceSession[];
  show: {
    appKey: string;
    backgroundImageKey?: string | null;
    openingScene: string;
    premise: string;
    showKey: string;
    subtitle: string | null;
    title: string;
  };
  user: {
    email: string;
    id: string;
  };
  userCharacters: ShowGuest[];
};

export type ShowWorkspaceSession = {
  avatarLabel: string;
  currentStage: string;
  id: string;
  matchSuccess: boolean;
  messageCount: number;
  selectedCharacterKey: string | null;
  status: 'active' | 'completed';
  updatedAt: string;
};

export type ShowSessionPayload = {
  characters: {
    available: boolean;
    avatarObjectKey: string | null;
    characterKey: string;
    gender: 'female' | 'male' | null;
    lightState: 'on' | 'off' | 'blow_up';
    name: string;
    profile: {
      avatarObjectKey: string | null;
      characterKey: string;
      gender: 'female' | 'male' | null;
      name: string;
      occupationTag?: string;
      personalityKeywords: string[];
      source?: string;
    };
    role: 'guest' | 'host' | 'support';
  }[];
  currentTurn: {
    id: string;
    options: {
      id: string;
      label: string;
      preview: string;
    }[];
    question: string;
    speakerKey: string | null;
    speakerName: string;
    stageKey: string;
    status: 'answered' | 'awaiting_user' | 'skipped';
    turnIndex: number;
  } | null;
  eventLog: {
    content: string;
    data?: Record<string, unknown>;
    eventOrder: number;
    id: string;
    speakerKey: string | null;
    speakerName: string;
    stageKey: string;
    turnId: string | null;
    type: string;
  }[];
  generatedReactions: {
    characterKey: string | null;
    reason: string;
    speakerName: string;
    text: string;
  }[];
  guestStates: {
    affinityScore: number;
    attractionTags: string[];
    available: boolean;
    characterKey: string;
    lastDelta: number;
    lastReason: string;
    lightState: 'on' | 'off' | 'blow_up';
    name: string;
    riskTags: string[];
  }[];
  guests: {
    available: boolean;
    characterKey: string;
    gender: 'female' | 'male' | null;
    lightState: 'on' | 'off' | 'blow_up';
    name: string;
    profile: {
      avatarObjectKey: string | null;
      characterKey: string;
      name: string;
      occupationTag?: string;
      personalityKeywords: string[];
      source?: string;
    };
  }[];
  messages: {
    content: string;
    id: string;
    role: string;
    speakerKey: string | null;
    speakerName: string;
    stageKey: string;
  }[];
  session: {
    currentStage: string;
    id: string;
    matchSuccess: boolean;
    messageCount: number;
    pointsAwarded: number;
    resultSummary: string | null;
    selectedCharacterKey: string | null;
    status: 'active' | 'completed';
    userProfile: Record<string, unknown>;
  };
  show: {
    backgroundImageKey?: string | null;
    openingScene: string;
    premise: string;
    showKey: string;
    title: string;
  };
};

export type ShowTurnDelta = {
  speakerKey: string | null;
  speakerName: string | null;
  text: string;
};

export type SpeechPreviewPayload = {
  audioUrl: string | null;
  speakerKey: string | null;
  status: 'not_configured' | 'ready';
  text: string;
};

export type SystemAssetUploadPayload = {
  asset: {
    contentType: string;
    objectKey: string;
    sizeBytes: number | null;
  };
  systemAssets: SystemAsset[];
};

export function objectUrl(key: string): string {
  return `${API_BASE_URL}/objects/${encodeURIComponent(key)}`;
}

export async function createDevSession(email: string): Promise<AuthSession> {
  return requestJson<AuthSession>('/auth/dev-session', {
    body: JSON.stringify({ email }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  }, { skipAuth: true });
}

export async function fetchShowCharacters(email?: string): Promise<{
  characters: ShowGuest[];
  communityCharacters: ShowGuest[];
  officialCharacters: ShowGuest[];
  userCharacters: ShowGuest[];
}> {
  const query = email?.trim() ? `?email=${encodeURIComponent(email.trim())}` : '';
  return requestJson(`/shows/${DATING_SHOW_KEY}/characters${query}`);
}

export async function fetchShowWorkspace(email: string): Promise<ShowWorkspacePayload> {
  return requestJson<ShowWorkspacePayload>(
    `/shows/${DATING_SHOW_KEY}/workspace?email=${encodeURIComponent(email.trim())}`,
  );
}

export async function joinWorkspaceGuest(characterKey: string, email: string): Promise<ShowWorkspacePayload> {
  return requestJson<ShowWorkspacePayload>(`/shows/${DATING_SHOW_KEY}/workspace/guests`, {
    body: JSON.stringify({
      acquisitionMethod: 'joined_home',
      characterKey,
      email,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

export async function createShowCharacter(input: {
  characterPackage: GuestCharacterPackage;
  email: string;
}): Promise<GuestCharacterPackagePayload> {
  return requestJson<GuestCharacterPackagePayload>(`/shows/${DATING_SHOW_KEY}/characters`, {
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

export async function fetchShowCharacterPackage(characterKey: string, email: string): Promise<GuestCharacterPackagePayload> {
  return requestJson<GuestCharacterPackagePayload>(
    `/shows/${DATING_SHOW_KEY}/characters/${encodeURIComponent(characterKey)}/package?email=${encodeURIComponent(email.trim())}`,
  );
}

export async function updateShowCharacterPackage(characterKey: string, input: {
  characterPackage: GuestCharacterPackage;
  email: string;
}): Promise<GuestCharacterPackagePayload> {
  return requestJson<GuestCharacterPackagePayload>(`/shows/${DATING_SHOW_KEY}/characters/${encodeURIComponent(characterKey)}`, {
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'PATCH',
  });
}

export async function createChapterOneSession(input: {
  email: string;
  selectedGuestKeys: string[];
}): Promise<ShowSessionPayload> {
  return requestJson<ShowSessionPayload>(`/shows/${DATING_SHOW_KEY}/sessions`, {
    body: JSON.stringify({
      avatarLabel: 'Spotlight Guest',
      email: input.email,
      guestPreference: 'any',
      selectedGuestKeys: input.selectedGuestKeys,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

export async function fetchChapterTwoLocations(): Promise<{ locations: ChapterTwoDateLocation[] }> {
  return requestJson<{ locations: ChapterTwoDateLocation[] }>(`/shows/${DATING_SHOW_KEY}/chapter-two/locations`);
}

export async function createChapterTwoDateSession(input: {
  companionId: string;
  email: string;
  locationKey: string;
}): Promise<ChapterTwoDateSessionPayload> {
  return requestJson<ChapterTwoDateSessionPayload>(`/shows/${DATING_SHOW_KEY}/chapter-two/sessions`, {
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

export async function fetchChapterTwoDateSession(sessionId: string, email: string): Promise<ChapterTwoDateSessionPayload> {
  return requestJson<ChapterTwoDateSessionPayload>(
    `/shows/${DATING_SHOW_KEY}/chapter-two/sessions/${encodeURIComponent(sessionId)}?email=${encodeURIComponent(email.trim())}`,
  );
}

export async function answerChapterTwoDateTurn(sessionId: string, turnId: string, input: {
  email: string;
  freeText: string;
  selectedOptionId: string;
}): Promise<ChapterTwoDateSessionPayload> {
  return requestJson<ChapterTwoDateSessionPayload>(
    `/shows/${DATING_SHOW_KEY}/chapter-two/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}/answer`,
    {
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
  );
}

export async function fetchShowSession(sessionId: string, email: string): Promise<ShowSessionPayload> {
  return requestJson<ShowSessionPayload>(
    `/shows/${DATING_SHOW_KEY}/sessions/${encodeURIComponent(sessionId)}?email=${encodeURIComponent(email.trim())}`,
  );
}

export async function answerShowTurn(sessionId: string, turnId: string, input: {
  email: string;
  freeText: string;
  selectedCharacterKey?: string;
  selectedOptionId: string;
}): Promise<ShowSessionPayload> {
  return requestJson<ShowSessionPayload>(
    `/shows/${DATING_SHOW_KEY}/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}/answer`,
    {
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
  );
}

export async function answerShowTurnStream(sessionId: string, turnId: string, input: {
  email: string;
  freeText: string;
  selectedCharacterKey?: string;
  selectedOptionId: string;
}, handlers: {
  onDelta?: (delta: ShowTurnDelta) => void;
  onStart?: () => void;
} = {}): Promise<ShowSessionPayload> {
  const path = `/shows/${DATING_SHOW_KEY}/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}/answer?stream=1`;
  const headers = new Headers({ 'content-type': 'application/json' });
  const token = readStoredAuthToken();
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    body: JSON.stringify({ ...input, stream: true }),
    headers,
    method: 'POST',
  });

  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok) {
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => ({}))
      : { error: await response.text().catch(() => '') };
    const error = new Error(payload.error ?? `HTTP ${response.status}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  if (!response.body || !contentType.includes('text/event-stream')) {
    return (await response.json()) as ShowSessionPayload;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalSession: ShowSessionPayload | null = null;

  const processBlock = (block: string) => {
    const event = readSseEvent(block);
    if (!event) {
      return;
    }

    if (event.type === 'start') {
      handlers.onStart?.();
      return;
    }

    if (event.type === 'delta') {
      const payload = event.data as { speakerKey?: string | null; speakerName?: string | null; text?: string };
      if (payload.text) {
        handlers.onDelta?.({
          speakerKey: payload.speakerKey ?? null,
          speakerName: payload.speakerName ?? null,
          text: payload.text,
        });
      }
      return;
    }

    if (event.type === 'session') {
      finalSession = event.data as ShowSessionPayload;
      return;
    }

    if (event.type === 'error') {
      const payload = event.data as { error?: string; status?: number };
      const error = new Error(payload.error ?? 'stream_error');
      (error as Error & { status?: number }).status = payload.status;
      throw error;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      blocks.forEach(processBlock);
    }

    if (buffer.trim()) {
      processBlock(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  if (!finalSession) {
    throw new Error('stream_session_missing');
  }

  return finalSession;
}

export async function previewShowSpeech(sessionId: string, input: {
  email: string;
  messageId?: string;
  speakerKey?: string | null;
  text?: string;
}): Promise<SpeechPreviewPayload> {
  return requestJson<SpeechPreviewPayload>(
    `/shows/${DATING_SHOW_KEY}/sessions/${encodeURIComponent(sessionId)}/speech-preview`,
    {
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
  );
}

export async function finalizeShowSession(sessionId: string, input: {
  characterKey: string | null;
  email: string;
}): Promise<ShowSessionPayload> {
  return requestJson<ShowSessionPayload>(
    `/shows/${DATING_SHOW_KEY}/sessions/${encodeURIComponent(sessionId)}/final-choice`,
    {
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
  );
}

export async function uploadSystemAsset(input: {
  characterKey?: string | null;
  file: Blob & { type?: string };
  kind: 'background' | 'character';
}): Promise<SystemAssetUploadPayload> {
  const path = input.kind === 'background'
    ? `/shows/${DATING_SHOW_KEY}/admin/system-assets/background`
    : `/shows/${DATING_SHOW_KEY}/admin/system-assets/characters/${encodeURIComponent(input.characterKey ?? '')}`;
  return requestJson<SystemAssetUploadPayload>(path, {
    body: input.file,
    headers: {
      'content-type': input.file.type || 'image/png',
    },
    method: 'POST',
  });
}

export async function fetchCharacters(): Promise<{ characters: CompanionCharacter[] }> {
  return requestJson<{ characters: CompanionCharacter[] }>('/characters');
}

export async function fetchCharacter(characterKey: string): Promise<{ character: CompanionCharacter }> {
  return requestJson<{ character: CompanionCharacter }>(`/characters/${encodeURIComponent(characterKey)}`);
}

export async function fetchRelationship(characterKey: string, email: string): Promise<RelationshipPayload> {
  return requestJson<RelationshipPayload>(
    `/characters/${encodeURIComponent(characterKey)}/relationship?email=${encodeURIComponent(email.trim())}`,
  );
}

export async function createRelationship(characterKey: string, email: string): Promise<RelationshipPayload> {
  return requestJson<RelationshipPayload>(`/characters/${encodeURIComponent(characterKey)}/relationships`, {
    body: JSON.stringify({ email }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

export async function fetchScenes(): Promise<{ scenes: ScenePack[] }> {
  return requestJson<{ scenes: ScenePack[] }>('/scenes');
}

export async function createSceneSession(sceneKey: string, input: { characterKey: string; email: string }): Promise<SceneSessionPayload> {
  return requestJson<SceneSessionPayload>(`/scenes/${encodeURIComponent(sceneKey)}/sessions`, {
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

export async function answerSceneTurn(sessionId: string, turnId: string, input: {
  email: string;
  freeText: string;
  selectedOptionId: string;
}): Promise<SceneSessionPayload> {
  return requestJson<SceneSessionPayload>(
    `/scene-sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}/answer`,
    {
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
  );
}

export async function startCheckout(email: string): Promise<string> {
  const payload = await requestJson<{ url?: string }>('/billing/checkout', {
    body: JSON.stringify({ appKey: 'platform', email }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });

  if (!payload.url) {
    throw new Error('checkout_url_missing');
  }

  return payload.url;
}

export function readStoredAuthToken(): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return '';
  }

  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? '';
}

export function writeStoredAuthSession(session: AuthSession): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  window.localStorage.setItem(EMAIL_STORAGE_KEY, session.email);
  window.localStorage.setItem(BILLING_EMAIL_STORAGE_KEY, session.email);
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, session.token);
  window.localStorage.setItem(AUTH_EXPIRES_STORAGE_KEY, session.expiresAt);
}

export function clearStoredAuthSession(): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  window.localStorage.removeItem(EMAIL_STORAGE_KEY);
  window.localStorage.removeItem(BILLING_EMAIL_STORAGE_KEY);
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(AUTH_EXPIRES_STORAGE_KEY);
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
  options?: { skipAuth?: boolean },
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!options?.skipAuth) {
    const token = readStoredAuthToken();
    if (token && !headers.has('authorization')) {
      headers.set('authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    const error = new Error(payload.error ?? `HTTP ${response.status}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return payload;
}

function readSseEvent(block: string): { data: unknown; type: string } | null {
  const lines = block.split(/\r?\n/);
  let type = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      type = line.slice('event:'.length).trim();
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }

  if (!dataLines.length) {
    return null;
  }

  return {
    data: JSON.parse(dataLines.join('\n')),
    type,
  };
}
