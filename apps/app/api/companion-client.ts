import { Linking } from 'react-native';

import type {
  BillingStatusResponse,
  ChatHistoryResponse,
  ChatMessageInput,
  CompanionCreateInput,
  CompanionDetailResponse,
  CompanionsListResponse,
  MeResponse,
  RelationshipResponse,
  SceneEnterResponse,
  ScenesListResponse,
  SseEvent,
} from './types';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8787';

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

export async function createDevSession(email: string): Promise<AuthSession> {
  return requestJson<AuthSession>(
    '/auth/dev-session',
    {
      body: JSON.stringify({ email }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
    { skipAuth: true },
  );
}

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
): Promise<{ ok: boolean; expires_in: number; verify_url?: string }> {
  return requestJson<{ ok: boolean; expires_in: number; verify_url?: string }>(
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
