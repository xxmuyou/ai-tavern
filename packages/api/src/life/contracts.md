# Life Sim v1 API contracts (worktree A)

Authoritative response shapes for the endpoints introduced by `feat/life-core`.
B-line (`feat/life-experience`) types/hooks must match these. Any change to
shape goes through this file first.

All timestamps are unix epoch milliseconds (INTEGER). All enums live in
`packages/api/src/life/types.ts` and are mirrored in `@xtbit/shared`.

---

## GET /today

Auth required. Does **not** consume message quota and does **not** call an LLM.

```jsonc
{
  "city": { "name": "Aurelia City", "tagline": "...", "description": "..." },
  "date_local": "2026-05-26",
  "time_slot": "afternoon",
  "recommendations": [
    {
      "companion": { "id": "maya", "name": "Maya", "art_url": "...", "gender": "female" },
      "scene": { "id": "underground_livehouse", "name": "Underground Livehouse", "mood": "warm" },
      "mood": "playful",
      "availability": "available",
      "activity_hint": "reading alone",
      "relationship_stage": "familiar",
      "stage_progress": 0.42,
      "next_goal": { "description": "...", "target_dim": "trust", "target_value": 35 },
      "suggested_activity": { "activity_type": "hang_out", "reason": "..." }
    }
  ]
}
```

401 if not authenticated.

---

## GET /companions/{id}/daily-state?include_flavor=1

Auth required. Returns the deterministic rule fields. `flavor_text` is included
only when `include_flavor=1` and is generated lazily (cached per user/day/slot).

```jsonc
{
  "companion_id": "maya",
  "date_local": "2026-05-26",
  "time_slot": "afternoon",
  "scene_id": "underground_livehouse",
  "mood": "playful",
  "availability": "available",
  "activity_hint": "reading alone",
  "flavor_text": "Maya is curled up at the bar with a paperback..." // null unless include_flavor=1
}
```

---

## POST /activities

Auth required. Creates a new activity context.

Request:
```jsonc
{
  "companion_id": "maya",
  "scene_id": "underground_livehouse",
  "activity_type": "hang_out"
}
```

Success 201:
```jsonc
{
  "id": "act_xxx",
  "user_id": "...",
  "companion_id": "maya",
  "scene_id": "underground_livehouse",
  "activity_type": "hang_out",
  "status": "active",
  "daily_state_snapshot": {
    "mood": "playful",
    "availability": "available",
    "activity_hint": "reading alone",
    "scene_id": "underground_livehouse"
  },
  "started_at": 1748275200000,
  "completed_at": null,
  "canceled_at": null
}
```

422 with `{ "error": "activity_unavailable", "reason": "companion_busy" | "stage_too_low" | "gift_on_cooldown" | ... }`
when conditions fail.

## POST /activities/{id}/complete

200, returns the updated `ActivityRecord` with `status: "completed"` and may
trigger a memory write (see /memories).

## POST /activities/{id}/cancel

200, returns the updated `ActivityRecord` with `status: "canceled"`.

---

## POST /chat/{companionId}/messages (extended)

Request body adds optional `activity_id` and `quick_action`. When `activity_id`
is present, chat starts from the activity's `scene_id` and the prompt receives
the activity context. A scene invite may still be sent from an activity chat.
Per spec-038, `invite_result.accepted=true` only means the companion agreed; Web
creates a pending arrival and completes the current activity only after the user
confirms arrival.

```jsonc
{
  "text": "<narration>I set a coffee down near you.</narration>I got this for us.",
  "activity_id": "act_xxx", // optional
  "invite_scene_id": "underground_livehouse", // optional
  "quick_action": { "type": "custom_scene_action", "text": "draw a heart on the foggy window" } // optional
}
```

`quick_action` supports legacy gifts (`coffee`, `flowers`), catalog scene
actions (`{ "type": "scene_action", "action_id": "..." }`), and one-off custom
scene actions (`{ "type": "custom_scene_action", "text": "..." }`). Coffee
requires the current scene name/mood/tags to include `cafe` or `coffee`;
catalog and custom scene actions require a current scene. Custom action text is
trimmed and capped at 120 characters. Successful quick actions create a
completed `gift` activity with metadata, trigger the memory hook, emit SSE
`quick_action_result`, and may apply relationship deltas for gifts/catalog
actions. Custom actions do not apply a fixed relationship delta; the companion
reply and relationship signal extraction carry the emotional consequence.

---

## GET /memories?companion_id=...&limit=...

Auth required. Returns memories newest-first. Free users get at most 20 items
in the response (oldest fade out). Pro users have no cap.

```jsonc
{
  "memories": [
    {
      "id": "mem_xxx",
      "user_id": "...",
      "companion_id": "maya",
      "memory_type": "first_hangout",
      "memory_subtype": "",
      "scene_id": "underground_livehouse",
      "activity_id": "act_xxx",
      "title": "First time at Underground Livehouse",
      "summary": "...",
      "key_choice": "...",
      "relationship_delta": { "closeness": 3, "trust": 2 },
      "cg_template": "first_date",
      "cg_url": null,
      "created_at": 1748275200000
    }
  ],
  "total": 7,
  "capacity_limit": 20,    // null for Pro
  "truncated": false       // true if Free user has more than 20 records
}
```

---

## POST /push/tokens

Auth required.

Request:
```jsonc
{ "token": "ExponentPushToken[xxx]", "platform": "ios" }
```

Response 201 / 200:
```jsonc
{ "ok": true }
```

## DELETE /push/tokens/{token}

Soft-delete (sets `revoked_at`). 200 `{ "ok": true }`.

---

## PATCH /auth/me/preferences (extended)

Existing endpoint gains optional fields. Existing `romance_preference` keeps
working unchanged.

```jsonc
{
  "romance_preference": "any",  // existing
  "timezone": "Asia/Shanghai",  // new (IANA string)
  "push_enabled": true          // new
}
```
