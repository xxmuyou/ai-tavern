import { jsonResponse, notFound, readJson } from "../http";
import type { UserRecord } from "../identity";
import { loadRelationship, applySignals } from "../relationships/engine";
import { loadCompanionForEvent } from "./support";
import { generateResolutionDescription } from "./generator";
import { parseEventPayload, parseTemplateSnapshot, stringifyJson } from "./parse";
import { loadEventById } from "./repository";

type ResolveBody = { option_id?: unknown };

export async function resolveEvent(
  request: Request,
  env: Env,
  user: UserRecord,
  eventId: string,
): Promise<Response> {
  let body: ResolveBody;
  try {
    body = await readJson<ResolveBody>(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonResponse({ error: "invalid_request" }, { status: 400 });
  }

  const optionId = typeof body.option_id === "string" ? body.option_id : "";
  if (!optionId) {
    return jsonResponse({ error: "invalid_request", field: "option_id" }, { status: 400 });
  }

  const event = await loadEventById(env, eventId);
  if (!event) return notFound();
  if (event.user_id !== user.id) return jsonResponse({ error: "forbidden" }, { status: 403 });
  if (event.status !== "pending") return jsonResponse({ error: "event_not_pending" }, { status: 409 });

  const payload = parseEventPayload(event.payload);
  const chosenOption = payload.options.find((option) => option.id === optionId);
  if (!chosenOption) {
    return jsonResponse({ error: "unknown_option" }, { status: 400 });
  }

  const snapshot = parseTemplateSnapshot(event.template_snapshot);
  const snapshotOption = snapshot?.options.find((option) => option.id === optionId);
  if (!snapshotOption) {
    return jsonResponse({ error: "event_snapshot_invalid" }, { status: 400 });
  }

  const now = Date.now();
  const oldState = await loadRelationship(env, user.id, event.companion_id);
  const newState = await applySignals(env, user.id, event.companion_id, snapshotOption.signals, now);
  const companion = await loadCompanionForEvent(env, event.companion_id);
  const description = companion
    ? await generateResolutionDescription(env, {
        chosenOption,
        companion,
        eventPayload: payload,
        signals: snapshotOption.signals,
        userId: user.id,
      })
    : `You chose "${chosenOption.label}".`;

  const resolution = {
    option_id: optionId,
    option_label: chosenOption.label,
    result_description: description,
    signals_applied: snapshotOption.signals,
  };

  await env.DB.prepare(
    `UPDATE events SET status = 'resolved', resolution = ?, resolved_at = ? WHERE id = ?`,
  )
    .bind(stringifyJson(resolution), now, event.id)
    .run();

  const oldLevel = oldState?.level ?? "Stranger";
  const levelChanged = oldLevel === newState.level ? null : newState.level;

  return jsonResponse({
    level_changed: levelChanged,
    result: {
      description,
      signals: snapshotOption.signals,
    },
  });
}
