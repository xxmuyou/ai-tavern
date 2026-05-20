export const API_VERSION = "0.1.0";

export const CLOUD_BOUNDARY = {
  primaryRuntime: "Cloudflare Workers",
  primaryWeb: "Cloudflare Pages",
  primaryObjectStorage: "Cloudflare R2",
  primaryDatabase: "Cloudflare D1",
  primaryRealtimeState: "Cloudflare Durable Objects",
  primaryAsyncQueue: "Cloudflare Queues",
  backupObjectStorage: "AWS S3",
} as const;

export type HealthResponse = {
  ok: true;
  service: "xtbit-apps-api";
  version: string;
  environment: string;
};

export type RoomSnapshot = {
  roomId: string;
  eventCount: number;
  lastEventId: string | null;
  updatedAt: string;
};

export type RoomEventInput = {
  type: string;
  payload?: unknown;
};
