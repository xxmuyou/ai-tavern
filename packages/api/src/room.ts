import { DurableObject } from "cloudflare:workers";
import type { RoomEventInput, RoomSnapshot } from "@xtbit/shared";

import { jsonResponse, readJson } from "./http";

export class GameRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const roomId = url.pathname.split("/").filter(Boolean).at(1) ?? "default";

    if (request.method === "GET") {
      return jsonResponse(await this.getSnapshot(roomId));
    }

    if (request.method === "POST") {
      const input = await readJson<RoomEventInput>(request);
      const eventType = typeof input.type === "string" && input.type.length > 0 ? input.type : "unknown";
      const eventId = crypto.randomUUID();
      const snapshot = await this.getSnapshot(roomId);
      const nextSnapshot: RoomSnapshot = {
        roomId,
        eventCount: snapshot.eventCount + 1,
        lastEventId: eventId,
        updatedAt: new Date().toISOString(),
      };

      await this.ctx.storage.put(`event:${eventId}`, {
        id: eventId,
        type: eventType,
        payload: input.payload ?? null,
        createdAt: nextSnapshot.updatedAt,
      });
      await this.ctx.storage.put("snapshot", nextSnapshot);

      return jsonResponse(nextSnapshot, { status: 201 });
    }

    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  private async getSnapshot(roomId: string): Promise<RoomSnapshot> {
    return (
      (await this.ctx.storage.get<RoomSnapshot>("snapshot")) ?? {
        roomId,
        eventCount: 0,
        lastEventId: null,
        updatedAt: new Date(0).toISOString(),
      }
    );
  }
}
