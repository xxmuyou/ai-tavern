# spec-004-ai-tv-dating-show-mvp

## Goal

Add the first real mini app: an AI-powered TV dating show game where the user is the lead participant. The MVP must deliver one complete playable episode with platform-directed stages, user-created character support later, hidden affinity scoring, AI signal extraction, and a final match-or-walk-away decision.

## App key

`ai-tv-dating`

This app uses the shared platform pass. It does not create a standalone subscription, payment account, user system, or database.

## MVP behavior

- Register `ai-tv-dating` in the shared `apps` table with `active` status.
- Show `ai-tv-dating` as the first real app entry instead of relying on sample apps.
- Use the shared platform user identity resolved from email in v1.
- Let the user upload a photo or select a default avatar.
- Let the user choose guest gender preference: male, female, or any.
- Start one dating show session with preset guests.
- Use real-time AI dialogue for the host, guest replies, reaction summaries, and ending text.
- Keep guest images as preset assets; do not generate guest images during MVP gameplay.
- Track each guest profile, session guest snapshot, affection score, and final result.
- Let the user choose one guest as the final match or reject all guests.
- Keep guest affinity, preferences, and dealbreakers hidden from the user by default.
- Use AI to extract structured signals from user text, while backend rules apply scoring.
- Allow a limited free trial path, while the complete episode or repeated plays can be gated by the shared platform pass.

## Expected future behavior

- Add Character Studio v1 so users can create guest characters for existing platform-directed shows.
- Keep show flow, stage order, ending rules, and scoring formulas platform-controlled.
- Add creative workshop features for full user-created shows only after character creation validates.
- Add more TV show formats such as singing auditions, interviews, debates, or talent contests.
- Add generated avatars or character images after cost, latency, and safety controls are in place.
- Add richer long-term progression only if the dating show validates through traffic.
- Add app-specific premium add-ons only after the shared platform pass model is proven.

## Frontend changes

- Add a route or screen for the `ai-tv-dating` app.
- Replace sample-only app registry presentation with a usable app entry that opens the dating show MVP.
- Build the MVP flow:
  - Landing/start state.
  - Avatar upload or default avatar selection.
  - Guest gender preference selection.
  - Initial favorite guest selection.
  - Profile input for basic user persona and hard-condition matching.
  - Episode stage with host dialogue, guest cards, message input, and visible light states.
  - User declaration stage.
  - Final choice screen.
  - Result screen.
- Keep UI dense enough for repeated play, but visually frame the experience like a TV show stage.
- Do not show raw affinity scores, hidden preferences, or dealbreakers in normal gameplay.
- Store only lightweight local state on the client; session state should come from the Worker API.

## Backend/API changes

- Add app-specific API handling under `/apps/ai-tv-dating/*`.
- Resolve the shared user before creating, reading, or mutating a session.
- Add endpoints:
  - `GET /apps/ai-tv-dating/bootstrap`
  - `POST /apps/ai-tv-dating/sessions`
  - `GET /apps/ai-tv-dating/sessions/{sessionId}`
  - `POST /apps/ai-tv-dating/sessions/{sessionId}/messages`
  - `POST /apps/ai-tv-dating/sessions/{sessionId}/final-choice`
- `GET /bootstrap` returns active guest templates, default avatar options, entitlement state, and MVP config.
- `POST /sessions` creates a show session using the user's avatar choice and guest preference.
- `POST /messages` accepts user input, advances the show state when appropriate, and returns host/guest AI messages.
- `POST /final-choice` records the selected guest or `none`, closes the session, and returns the result summary.
- AI failures must return a safe fallback line and keep the session playable.
- Future Character Studio endpoints should let users create character templates under a `show_key`, but not edit show stages or ending rules.
- AI provider/model choice should be treated as shared platform infrastructure, not app-local gameplay logic. See `spec-005-llm-admin-model-selection.md`.

## Database changes

Add app-level tables. Every user-owned row must include `app_key` and `user_id`.

- `ai_tv_dating_guest_templates`
  - Preset guest identity, gender, profile, preferences, dealbreakers, speaking style, and avatar object key.
- `ai_tv_dating_sessions`
  - One playable episode, including `app_key`, `user_id`, avatar reference, guest preference, current stage, status, selected guest, and result summary.
- `ai_tv_dating_session_guests`
  - Guest snapshots for a specific session, including affection score and whether the guest remains available.
- `ai_tv_dating_messages`
  - Conversation log for user, host, and guest messages.

The generic show engine should treat the dating show as a platform-directed show template:

- `show_templates` stores the show concept, background, opening scene, and ending rules.
- `show_stages` stores platform-controlled stage order and host instructions.
- `show_characters` stores official and future user-created character templates.
- `show_sessions` stores each user's episode.
- `show_session_characters` stores per-session character snapshots and hidden affinity state.
- `show_messages` stores the conversation.

Future user-created characters should include:

- `owner_user_id`
- `show_key`
- `source`: `official` or `user`
- Structured public profile fields
- Hidden matching fields generated from user-friendly inputs
- Status: `draft`, `active`, `hidden`, or `retired`

Editing a character template must not mutate existing session snapshots.

Recommended stage values:

- `initial_pick`
- `profile_judgment`
- `guest_questions`
- `user_declaration`
- `final_choice`
- `completed`

## Five-stage gameplay state machine

### 1. Initial pick

Input:

- User selects one favorite guest from the visible lineup.

Backend behavior:

- Store `initial_pick_character_key`.
- Do not reveal any affinity or guest tendency.
- Keep all official/user-selected guests available until profile judgment.

Output:

- Host confirms the user's private choice and moves to profile judgment.

### 2. Profile judgment

Input:

- User provides basic persona fields such as age, occupation, hobbies, lifestyle, and relationship values.

Backend behavior:

- Convert profile fields into structured signals.
- Apply each guest's hard conditions, positive signals, negative signals, and dealbreaker signals.
- Update hidden affinity.
- Set visible light state: `on`, `off`, or `blow_up`.

Output:

- Host announces which guests keep their lights on, turn off, or blow up without exposing exact reasons by default.

### 3. Guest questions

Input:

- Guests above an affinity threshold ask questions.
- User answers through free text.

Backend behavior:

- AI extracts signals from the answer.
- Backend applies scoring to all remaining guests.
- Dealbreaker hits can turn a guest off.

Output:

- Host and one or more guests respond.
- UI updates only visible light states, not hidden scores.

### 4. User declaration

Input:

- User states what type of partner they like and dislike.

Backend behavior:

- AI extracts preference and rejection signals.
- Backend applies a larger scoring pass across all remaining guests.

Output:

- Host summarizes the room reaction.
- Guests may stay on, turn off, or blow up.

### 5. Final choice

Input:

- User selects one guest whose light is still on or blow-up.

Backend behavior:

- Check selected guest availability.
- Check match threshold.
- Check no critical dealbreaker was triggered.
- Mark session completed.
- Emit a platform points event if the match succeeds. The points ledger implementation is a separate spec.

Output:

- Return match success or graceful rejection summary.

## Asset storage

- Store user-uploaded avatars in R2.
- Store only the R2 object key and basic metadata in D1.
- Store preset guest avatar assets in R2 under an app namespace such as `apps/ai-tv-dating/guests/...`.
- Provide default user avatars either through R2 keys or bundled static assets.
- Do not perform face swapping, deepfake generation, or identity verification in MVP.

## AI design

Use a state machine plus AI text generation.

- The state machine controls stage, allowed actions, guest availability, final choice, and session completion.
- AI generates host lines, guest replies, reaction summaries, and ending text.
- AI must not decide unauthorized state transitions.
- AI extracts structured signals from user text; it must not directly write or choose affinity changes.
- Prompts should include the show stage, user-visible profile/avatar context, guest snapshots, recent messages, and safety rules.
- Guest personalities should remain stable across a session by using stored guest snapshots.
- Normal users should not choose or see the underlying LLM provider, model name, token usage, estimated cost, routing strategy, or API keys.
- The first reserved admin identity for future model controls is `admin@aiappsbox.com`.
- Future provider routing should move into a shared backend-only LLM layer so the dating show can use admin-controlled model policy without direct provider-specific logic.

Signal extraction output should be structured, for example:

```json
{
  "positiveSignals": ["honesty", "humor", "responsibility"],
  "negativeSignals": ["avoidance"],
  "dealbreakerSignals": [],
  "confidence": 0.86
}
```

Backend scoring applies the result:

- Positive signal match: increase affinity.
- Negative signal match: decrease affinity.
- Dealbreaker signal match: turn the guest light off.
- Blow-up signal match: mark the guest as strongly interested when enough strong signals are hit.
- Match threshold: required for final success.

Fixed roles:

- `host`: controls pacing, introduces segments, summarizes choices, and creates TV show energy.
- `guest`: responds according to profile, preferences, dealbreakers, affection score, and speaking style.
- `user`: the main participant; user messages drive the interaction.

## Character Studio v1

Character Studio v1 is the first creator-facing capability. It allows users to create guest characters for existing platform-directed shows.

Allowed user-editable fields:

- Name
- Gender
- Avatar
- Age range
- Occupation
- City/lifestyle tag
- Hobbies
- Personality keywords
- Speaking style
- Favorite partner traits
- Disliked partner traits
- Dealbreakers

System-generated hidden fields:

- Positive signals
- Negative signals
- Dealbreaker signals
- Blow-up signals
- Initial affinity
- Match threshold

Not user-editable in v1:

- Show stages
- Host instructions
- Ending rules
- Raw system prompts
- Direct numeric scoring values
- Platform point amounts

Future API shape:

- `GET /shows/{showKey}/characters`
- `POST /shows/{showKey}/characters`
- `PATCH /shows/{showKey}/characters/{characterKey}`
- `POST /shows/{showKey}/characters/{characterKey}/publish`

These endpoints must resolve the shared user and store user-created characters under both `show_key` and `owner_user_id`.

## Entitlement behavior

- The app uses the platform pass entitlement, not an app-specific subscription.
- MVP may allow a limited free trial, such as one short session or a limited number of messages.
- Full episode completion, repeated sessions, or saved results can require an active platform pass.
- The exact limit should be config-driven so traffic tests can adjust gating without a schema change.

## Platform points

Successful mutual matches can create platform point events.

For this spec:

- Record the desired behavior only.
- Do not implement a points ledger here.
- A later points spec should define balances, event types, fraud controls, expiration, and reward usage.

## Safety boundaries

- Do not generate explicit sexual content.
- Do not claim that uploaded photos verify real identity.
- Do not use uploaded photos for deepfake, face swap, or impersonation features.
- Keep flirting and romantic dialogue within non-explicit, entertainment-oriented boundaries.
- If the user asks for disallowed content, the host should redirect back to the show format.

## Local validation

- Typecheck and lint.
- Apply local D1 migrations.
- Verify `/apps` returns `ai-tv-dating` as active.
- Create a session with a test user email.
- Confirm all session rows use `app_key = 'ai-tv-dating'` and the resolved `user_id`.
- Complete a session from opening to final choice.
- Confirm user avatar object keys are stored without storing image bytes in D1.
- Confirm AI fallback behavior keeps the session playable when generation fails.
- Confirm hidden affinity values are not returned to the normal frontend payload unless an explicit reveal feature is added.
- Confirm final choice can only succeed when the chosen guest is still available and satisfies the match threshold.

## Dev validation

- Apply remote dev D1 migrations.
- Deploy the dev Worker and web app.
- Upload a test avatar through dev.
- Run a full dating show session on the dev domain.
- Confirm platform pass gating uses the shared subscription state.
- Confirm hidden or retired apps do not appear as active app entries.

## Prod validation

No prod deployment in this spec.

Before production, review:

- Admin model-routing UI/API for shared LLM management; tracked in `spec-005-llm-admin-model-selection.md`.
- Upload size limits.
- Content safety behavior.
- Privacy wording for user-uploaded photos.
- Stripe platform pass production readiness.

## Rollback notes

- Hide `ai-tv-dating` by changing the app registry status to `hidden`.
- Disable new sessions while preserving existing session data.
- Keep D1 tables unless a data retention decision says they should be removed.
- Remove or archive R2 uploaded avatar objects according to the final retention policy.
