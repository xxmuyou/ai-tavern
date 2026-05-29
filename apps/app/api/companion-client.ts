import { Linking, type ImageSourcePropType } from 'react-native';

import type {
  ActivityCreateInput,
  ActivityResponse,
  AdminAllowlistItem,
  AdminAllowlistResponse,
  BaseArtGenerateInput,
  BaseArtGenerateResponse,
  BaseArtJobResponse,
  BillingStatusResponse,
  ChatHistoryResponse,
  ChatMessageInput,
  CompanionCreateInput,
  CompanionDetailResponse,
  CompanionsListResponse,
  CreditBalanceResponse,
  CreditLedgerResponse,
  CreditPackageId,
  DailyState,
  Memory,
  MeResponse,
  MemoriesResponse,
  PushPreferenceResponse,
  RelationshipResponse,
  RomancePreference,
  SceneEnterResponse,
  ScenesListResponse,
  SseEvent,
  TodayResponse,
} from './types';

const CONFIGURED_API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8787';

export const API_BASE_URL = resolveApiBaseUrl();
const ACTIVE_ACTIVITIES = new Map<string, ActivityResponse['activity']>();

export const EMAIL_STORAGE_KEY = 'xtbit.companion.email';
export const BILLING_EMAIL_STORAGE_KEY = 'xtbit.billing.email';
export const AUTH_TOKEN_STORAGE_KEY = 'xtbit.companion.authToken';
export const AUTH_EXPIRES_STORAGE_KEY = 'xtbit.companion.authExpiresAt';

function resolveApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'dev.aiappsbox.com' || hostname === 'aiappsbox.com') {
      return '/api';
    }
  }
  return CONFIGURED_API_BASE_URL;
}

export type AuthSession = {
  email: string;
  expiresAt: string;
  token: string;
  user: {
    email: string;
    id: string;
  };
};

export type MagicLinkResponse = {
  email?: string;
  expiresAt?: string;
  ok: boolean;
  expires_in: number;
  token?: string;
  user?: {
    email: string;
    id: string;
  };
  verify_url?: string;
};

export function objectUrl(key: string): string {
  return `${API_BASE_URL}/objects/${encodeURIComponent(key)}`;
}

export function mediaUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (/^(https?:|data:|blob:)/i.test(value)) {
    return value;
  }
  return objectUrl(value);
}

export function mediaSource(value: string | null | undefined): ImageSourcePropType | null {
  if (!value) {
    return null;
  }

  const localSource = LOCAL_MEDIA[value];
  if (localSource) {
    return localSource;
  }

  const url = mediaUrl(value);
  return url ? { uri: url } : null;
}

const LOCAL_MEDIA: Record<string, ImageSourcePropType> = {
  'scenes/brookside_bookshop.png': require('../assets/ai-companion/scenes/brookside_bookshop.png'),
  'scenes/crescent_library.png': require('../assets/ai-companion/scenes/crescent_library.png'),
  'scenes/harbor_market.png': require('../assets/ai-companion/scenes/harbor_market.png'),
  'scenes/iron_forge_gym.png': require('../assets/ai-companion/scenes/iron_forge_gym.png'),
  'scenes/moon_bar.png': require('../assets/ai-companion/scenes/moon_bar.png'),
  'scenes/pier_coffee_shop.png': require('../assets/ai-companion/scenes/pier_coffee_shop.png'),
  'scenes/sky_office.png': require('../assets/ai-companion/scenes/sky_office.png'),
  'scenes/skyline_rooftop.png': require('../assets/ai-companion/scenes/skyline_rooftop.png'),
  'scenes/twin_pines_park.png': require('../assets/ai-companion/scenes/twin_pines_park.png'),
  'portraits/aiko/annoyed.webp': require('../assets/ai-companion/portraits/aiko/annoyed.webp'),
  'portraits/aiko/guarded.webp': require('../assets/ai-companion/portraits/aiko/guarded.webp'),
  'portraits/aiko/neutral.webp': require('../assets/ai-companion/portraits/aiko/neutral.webp'),
  'portraits/aiko/playful.webp': require('../assets/ai-companion/portraits/aiko/playful.webp'),
  'portraits/aiko/tense.webp': require('../assets/ai-companion/portraits/aiko/tense.webp'),
  'portraits/aiko/warm.webp': require('../assets/ai-companion/portraits/aiko/warm.webp'),
  'portraits/lila/annoyed.webp': require('../assets/ai-companion/portraits/lila/annoyed.webp'),
  'portraits/lila/guarded.webp': require('../assets/ai-companion/portraits/lila/guarded.webp'),
  'portraits/lila/neutral.webp': require('../assets/ai-companion/portraits/lila/neutral.webp'),
  'portraits/lila/playful.webp': require('../assets/ai-companion/portraits/lila/playful.webp'),
  'portraits/lila/tense.webp': require('../assets/ai-companion/portraits/lila/tense.webp'),
  'portraits/lila/warm.webp': require('../assets/ai-companion/portraits/lila/warm.webp'),
  'portraits/maya/annoyed.webp': require('../assets/ai-companion/portraits/maya/annoyed.webp'),
  'portraits/maya/guarded.webp': require('../assets/ai-companion/portraits/maya/guarded.webp'),
  'portraits/maya/neutral.webp': require('../assets/ai-companion/portraits/maya/neutral.webp'),
  'portraits/maya/playful.webp': require('../assets/ai-companion/portraits/maya/playful.webp'),
  'portraits/maya/tense.webp': require('../assets/ai-companion/portraits/maya/tense.webp'),
  'portraits/maya/warm.webp': require('../assets/ai-companion/portraits/maya/warm.webp'),
  'portraits/ryan/annoyed.webp': require('../assets/ai-companion/portraits/ryan/annoyed.webp'),
  'portraits/ryan/guarded.webp': require('../assets/ai-companion/portraits/ryan/guarded.webp'),
  'portraits/ryan/neutral.webp': require('../assets/ai-companion/portraits/ryan/neutral.webp'),
  'portraits/ryan/playful.webp': require('../assets/ai-companion/portraits/ryan/playful.webp'),
  'portraits/ryan/tense.webp': require('../assets/ai-companion/portraits/ryan/tense.webp'),
  'portraits/ryan/warm.webp': require('../assets/ai-companion/portraits/ryan/warm.webp'),
  'portraits/sora/annoyed.webp': require('../assets/ai-companion/portraits/sora/annoyed.webp'),
  'portraits/sora/guarded.webp': require('../assets/ai-companion/portraits/sora/guarded.webp'),
  'portraits/sora/neutral.webp': require('../assets/ai-companion/portraits/sora/neutral.webp'),
  'portraits/sora/playful.webp': require('../assets/ai-companion/portraits/sora/playful.webp'),
  'portraits/sora/tense.webp': require('../assets/ai-companion/portraits/sora/tense.webp'),
  'portraits/sora/warm.webp': require('../assets/ai-companion/portraits/sora/warm.webp'),
};

export function startGoogleLogin(redirectPath?: string): void {
  const params = new URLSearchParams();
  if (redirectPath) {
    params.set('redirect', redirectPath);
  }
  const query = params.toString() ? `?${params.toString()}` : '';
  const url = `${API_BASE_URL}/auth/oidc/google/start${query}`;
  if (typeof window !== 'undefined') {
    window.location.href = url;
    return;
  }
  void Linking.openURL(url);
}

export async function sendMagicLink(
  email: string,
  redirect?: string,
): Promise<MagicLinkResponse> {
  return requestJson<MagicLinkResponse>(
    '/auth/email/send-link',
    {
      body: JSON.stringify({ email, redirect }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
    { skipAuth: true },
  );
}

export async function fetchMe(): Promise<MeResponse> {
  return requestJson<MeResponse>('/auth/me');
}

export async function listAdminAllowlist(): Promise<AdminAllowlistResponse> {
  return requestJson<AdminAllowlistResponse>('/admin/admin-allowlist');
}

export async function addAdminAllowlistEmail(
  email: string,
  note?: string,
): Promise<AdminAllowlistItem> {
  return requestJson<AdminAllowlistItem>('/admin/admin-allowlist', {
    body: JSON.stringify({ email, note }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

export async function removeAdminAllowlistEmail(email: string): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(`/admin/admin-allowlist/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  });
}

export async function updateRomancePreference(
  preference: RomancePreference,
): Promise<{ romance_preference: RomancePreference }> {
  return requestJson<{ romance_preference: RomancePreference }>('/auth/me/preferences', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ romance_preference: preference }),
  });
}

export async function updatePushPreference(enabled: boolean): Promise<PushPreferenceResponse> {
  const payload = await requestJson<LifePushPreferenceWire>('/auth/me/preferences', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ push_enabled: enabled }),
  });
  return { enabled: payload.push_enabled };
}

export async function logout(): Promise<void> {
  try {
    await requestJson('/auth/logout', { method: 'POST' });
  } catch {
    // Best effort: local sign-out should still complete if server revocation fails.
  }
  clearStoredAuthSession();
}

export function applySessionFragment(hash: string): AuthSession | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('token');
  const expiresAt = params.get('expires_at');
  const email = params.get('email');
  const userId = params.get('user_id') ?? '';

  if (!token || !expiresAt || !email) {
    return null;
  }

  const session: AuthSession = {
    email,
    expiresAt,
    token,
    user: { email, id: userId },
  };

  writeStoredAuthSession(session);
  return session;
}

export async function getScenes(): Promise<ScenesListResponse> {
  return requestJson<ScenesListResponse>('/scenes');
}

export async function enterScene(sceneId: string): Promise<SceneEnterResponse> {
  return requestJson<SceneEnterResponse>(`/scenes/${encodeURIComponent(sceneId)}/enter`, {
    method: 'POST',
  });
}

export async function listCompanions(source: 'official' | 'user' | 'all' = 'all'): Promise<CompanionsListResponse> {
  const params = new URLSearchParams({ source });
  return requestJson<CompanionsListResponse>(`/companions?${params.toString()}`);
}

export async function getCompanion(id: string): Promise<CompanionDetailResponse> {
  return requestJson<CompanionDetailResponse>(`/companions/${encodeURIComponent(id)}`);
}

export async function createCompanion(input: CompanionCreateInput): Promise<CompanionDetailResponse> {
  return requestJson<CompanionDetailResponse>('/companions', {
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

export type CompanionArtUpload = Blob | File | { name: string; type: string; uri: string };

export async function uploadCompanionArt(file: CompanionArtUpload): Promise<{ key: string }> {
  const form = new FormData();
  form.append('file', file as Blob);

  const token = readStoredAuthToken();
  const headers = new Headers();
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}/companions/upload-art`, {
    body: form,
    headers,
    method: 'POST',
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; key?: string };

  if (!response.ok) {
    const error = new Error(payload.error ?? `HTTP ${response.status}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return { key: payload.key ?? '' };
}

export async function generateBaseArt(
  input: BaseArtGenerateInput,
): Promise<BaseArtGenerateResponse> {
  return requestJson<BaseArtGenerateResponse>('/companions/base-art/generate', {
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

export async function getBaseArtJob(jobId: string): Promise<BaseArtJobResponse> {
  return requestJson<BaseArtJobResponse>(
    `/companions/base-art/jobs/${encodeURIComponent(jobId)}`,
  );
}

export async function updateCompanion(
  id: string,
  input: Partial<CompanionCreateInput>,
): Promise<CompanionDetailResponse> {
  return requestJson<CompanionDetailResponse>(`/companions/${encodeURIComponent(id)}`, {
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  });
}

export async function deleteCompanion(id: string): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(`/companions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function getRelationship(companionId: string): Promise<RelationshipResponse> {
  return requestJson<RelationshipResponse>(`/relationships/${encodeURIComponent(companionId)}`);
}

export async function getToday(): Promise<TodayResponse> {
  return normalizeToday(await requestJson<LifeTodayWire>('/today'));
}

export async function getDailyState(companionId: string, includeFlavor = false): Promise<DailyState> {
  const query = includeFlavor ? '?include_flavor=1' : '';
  return normalizeDailyState(await requestJson<LifeDailyStateWire>(`/companions/${encodeURIComponent(companionId)}/daily-state${query}`));
}

export async function createActivity(input: ActivityCreateInput): Promise<ActivityResponse> {
  const payload = await requestJson<LifeActivityWire>('/activities', {
    body: JSON.stringify({
      companion_id: input.companion_id,
      scene_id: input.scene_id,
      activity_type: input.type,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const activity = normalizeActivity(payload);
  ACTIVE_ACTIVITIES.set(activity.id, activity);
  return { activity };
}

export async function getActivity(activityId: string): Promise<ActivityResponse> {
  const cached = ACTIVE_ACTIVITIES.get(activityId);
  if (cached) {
    return { activity: cached };
  }
  throw new Error('activity_not_cached');
}

export async function completeActivity(activityId: string): Promise<ActivityResponse> {
  const payload = await requestJson<LifeActivityWire>(`/activities/${encodeURIComponent(activityId)}/complete`, {
    method: 'POST',
  });
  const activity = normalizeActivity(payload);
  ACTIVE_ACTIVITIES.set(activity.id, activity);
  return { activity };
}

export async function cancelActivity(activityId: string): Promise<ActivityResponse> {
  const payload = await requestJson<LifeActivityWire>(`/activities/${encodeURIComponent(activityId)}/cancel`, {
    method: 'POST',
  });
  const activity = normalizeActivity(payload);
  ACTIVE_ACTIVITIES.set(activity.id, activity);
  return { activity };
}

export async function getMemories(companionId?: string): Promise<MemoriesResponse> {
  const params = new URLSearchParams();
  if (companionId) {
    params.set('companion_id', companionId);
  }
  const query = params.toString() ? `?${params.toString()}` : '';
  return normalizeMemories(await requestJson<LifeMemoriesWire>(`/memories${query}`));
}

export async function registerPushToken(token: string, platform: string): Promise<PushPreferenceResponse> {
  await requestJson<{ ok: true }>('/push/tokens', {
    body: JSON.stringify({ platform, token }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  return { enabled: true };
}

export async function deletePushToken(token: string): Promise<PushPreferenceResponse> {
  await requestJson<{ ok: true }>(`/push/tokens/${encodeURIComponent(token)}`, {
    method: 'DELETE',
  });
  return { enabled: false };
}

type LifePushPreferenceWire = {
  push_enabled: boolean;
};

type LifeTodayWire = {
  city: { description: string; name: string; tagline: string };
  date_local: string;
  recommendations: Array<{
    activity_hint: string;
    availability: TodayResponse['recommendations'][number]['availability'];
    companion: { art_url: string | null; gender: string | null; id: string; name: string };
    mood: string;
    next_goal: { description: string; target_dim: string; target_value: number } | null;
    relationship_stage: string;
    scene: { id: string; mood: string; name: string };
    stage_progress: number;
    suggested_activity: { activity_type: ActivityCreateInput['type']; reason: string } | null;
  }>;
  time_slot: TodayResponse['time_slot'];
};

type LifeDailyStateWire = {
  activity_hint: string;
  availability: DailyState['availability'];
  companion_id: string;
  date_local: string;
  flavor_text?: string | null;
  mood: string;
  scene_id: string;
  time_slot: DailyState['time_slot'];
};

type LifeActivityWire = {
  canceled_at: number | null;
  companion_id: string;
  completed_at: number | null;
  daily_state_snapshot: {
    activity_hint: string;
    availability: DailyState['availability'];
    mood: string;
    scene_id: string;
  };
  id: string;
  scene_id: string;
  started_at: number;
  status: ActivityResponse['activity']['status'];
  activity_type: ActivityCreateInput['type'];
};

type LifeMemoriesWire = {
  capacity_limit: number | null;
  memories: Array<{
    activity_id: string | null;
    cg_template: string | null;
    cg_url: string | null;
    companion_id: string;
    created_at: number;
    id: string;
    key_choice: string | null;
    memory_type: Memory['type'];
    relationship_delta: Record<string, number> | null;
    scene_id: string | null;
    summary: string;
    title: string;
  }>;
  total: number;
  truncated: boolean;
};

function normalizeToday(payload: LifeTodayWire): TodayResponse {
  return {
    city: payload.city,
    date_local: payload.date_local,
    recommendations: payload.recommendations.map((item) => {
      const suggested = item.suggested_activity?.activity_type ?? null;
      return {
        activity_hint: item.activity_hint,
        availability: item.availability,
        companion: {
          art_url: item.companion.art_url,
          id: item.companion.id,
          name: item.companion.name,
          relationship_role: item.companion.gender,
        },
        daily_state: {
          activity_hint: item.activity_hint,
          availability: item.availability,
          companion_id: item.companion.id,
          date_local: payload.date_local,
          flavor_text: null,
          mood: item.mood,
          scene: { art_url: null, id: item.scene.id, mood: item.scene.mood, name: item.scene.name },
          time_slot: payload.time_slot,
        },
        mood: item.mood,
        next_goal: {
          label: item.next_goal?.description ?? 'Keep building this stage through shared time.',
          recommended_activity: suggested,
          stage: item.relationship_stage,
          stage_progress: item.stage_progress,
        },
        scene: { art_url: null, id: item.scene.id, mood: item.scene.mood, name: item.scene.name },
        suggested_activity: suggested ?? 'check_in',
      };
    }),
    time_slot: payload.time_slot,
  };
}

function normalizeDailyState(payload: LifeDailyStateWire): DailyState {
  return {
    activity_hint: payload.activity_hint,
    availability: payload.availability,
    companion_id: payload.companion_id,
    date_local: payload.date_local,
    flavor_text: payload.flavor_text ?? null,
    mood: payload.mood,
    scene: sceneFromId(payload.scene_id),
    time_slot: payload.time_slot,
  };
}

function normalizeActivity(payload: LifeActivityWire): ActivityResponse['activity'] {
  const scene = sceneFromId(payload.scene_id);
  return {
    companion: { art_url: null, id: payload.companion_id, name: payload.companion_id },
    created_at: new Date(payload.started_at).toISOString(),
    daily_state: {
      activity_hint: payload.daily_state_snapshot.activity_hint,
      availability: payload.daily_state_snapshot.availability,
      companion_id: payload.companion_id,
      date_local: new Date(payload.started_at).toISOString().slice(0, 10),
      flavor_text: null,
      mood: payload.daily_state_snapshot.mood,
      scene: sceneFromId(payload.daily_state_snapshot.scene_id),
      time_slot: 'morning',
    },
    id: payload.id,
    scene,
    status: payload.status,
    type: payload.activity_type,
  };
}

function normalizeMemories(payload: LifeMemoriesWire): MemoriesResponse {
  return {
    album_limit: payload.capacity_limit,
    items: payload.memories.map((item) => ({
      cg_template: item.cg_template,
      cg_url: item.cg_url,
      companion_id: item.companion_id,
      created_at: new Date(item.created_at).toISOString(),
      date: new Date(item.created_at).toISOString().slice(0, 10),
      id: item.id,
      key_choice: item.key_choice,
      relationship_delta: item.relationship_delta ? formatRelationshipDelta(item.relationship_delta) : null,
      scene: item.scene_id ? sceneFromId(item.scene_id) : null,
      summary: item.summary,
      title: item.title,
      type: item.memory_type,
    })),
    tier: payload.capacity_limit === null ? 'pro' : 'free',
  };
}

function sceneFromId(id: string) {
  return { art_url: `scenes/${id}.png`, id, name: titleize(id) };
}

function titleize(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatRelationshipDelta(delta: Record<string, number>): string {
  return Object.entries(delta)
    .map(([key, value]) => `${value > 0 ? '+' : ''}${value} ${key.replace(/_/g, ' ')}`)
    .join(', ');
}

export async function getChatHistory(
  companionId: string,
  opts: { beforeId?: string; limit?: number } = {},
): Promise<ChatHistoryResponse> {
  const params = new URLSearchParams();
  if (opts.limit) {
    params.set('limit', String(opts.limit));
  }
  if (opts.beforeId) {
    params.set('before_id', opts.beforeId);
  }
  const query = params.toString() ? `?${params.toString()}` : '';
  return requestJson<ChatHistoryResponse>(`/chat/${encodeURIComponent(companionId)}/history${query}`);
}

export async function clearChatHistory(companionId: string): Promise<{ ok: true }> {
  await requestJson<void>(`/chat/${encodeURIComponent(companionId)}/history`, {
    method: 'DELETE',
  });
  return { ok: true };
}

export async function* sendChatMessage(
  companionId: string,
  input: ChatMessageInput,
): AsyncIterable<SseEvent> {
  const headers = new Headers({ 'content-type': 'application/json' });
  const token = readStoredAuthToken();
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}/chat/${encodeURIComponent(companionId)}/messages`, {
    body: JSON.stringify(input),
    headers,
    method: 'POST',
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    const error = new Error(payload.error ?? `HTTP ${response.status}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  if (!response.body) {
    throw new Error('sse_body_missing');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\n\n/);
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      const event = readSseEvent(block);
      if (event) {
        yield event;
      }
    }
  }

  const trailing = readSseEvent(buffer);
  if (trailing) {
    yield trailing;
  }
}

export async function getBillingStatus(): Promise<BillingStatusResponse> {
  return requestJson<BillingStatusResponse>('/billing/status');
}

export async function startCheckout(): Promise<{ checkout_url: string }> {
  return requestJson<{ checkout_url: string }>('/billing/checkout', { method: 'POST' });
}

export async function openBillingPortal(): Promise<{ portal_url: string }> {
  return requestJson<{ portal_url: string }>('/billing/portal', { method: 'POST' });
}

export async function getCreditBalance(): Promise<CreditBalanceResponse> {
  return requestJson<CreditBalanceResponse>('/credits/balance');
}

export async function getCreditLedger(
  opts: { beforeId?: string; limit?: number } = {},
): Promise<CreditLedgerResponse> {
  const params = new URLSearchParams();
  if (opts.limit) {
    params.set('limit', String(opts.limit));
  }
  if (opts.beforeId) {
    params.set('before_id', opts.beforeId);
  }
  const query = params.toString() ? `?${params.toString()}` : '';
  return requestJson<CreditLedgerResponse>(`/credits/ledger${query}`);
}

export async function startCreditsCheckout(
  pkg: CreditPackageId,
): Promise<{ checkout_url: string }> {
  return requestJson<{ checkout_url: string }>('/credits/checkout', {
    body: JSON.stringify({ package: pkg }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

export function readStoredAuthToken(): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return '';
  }
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? '';
}

export function readStoredAuthSession(): AuthSession | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  const email = window.localStorage.getItem(EMAIL_STORAGE_KEY);
  const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  const expiresAt = window.localStorage.getItem(AUTH_EXPIRES_STORAGE_KEY);
  if (!email || !token || !expiresAt) {
    return null;
  }

  return {
    email,
    expiresAt,
    token,
    user: { email, id: '' },
  };
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

export async function requestJson<T>(
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

export function readSseEvent(block: string): SseEvent | null {
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

  const rawData = dataLines.join('\n');
  try {
    return { data: JSON.parse(rawData), type };
  } catch {
    return { data: rawData, type };
  }
}
