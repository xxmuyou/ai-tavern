# spec-005-llm-admin-model-selection

## Goal

Define the platform-level LLM model-management direction for AI apps.

The product goal is to let platform admins choose which backend model is used for each AI scenario, so the platform can control cost, quality, latency, and provider availability. Normal users should not see or choose models in v1.

The first reserved admin identity is:

```text
admin@aiappsbox.com
```

## Current implementation

AI Companion currently generates opening-story and companion dialogue through backend code in the existing story engine.

Current behavior:

- The app has no user-facing model picker.
- The app has no admin model-management UI.
- Model configuration is environment-based.
- Existing configuration is centered on `OPENAI_API_KEY` and `OPENAI_MODEL`.
- If no usable model key is configured, the backend returns deterministic fallback dialogue so the episode remains playable.

This means model choice is not yet a product feature. It is currently an operator/developer configuration detail.

## Expected architecture

The platform should add a backend-only LLM module later. App code should call one internal generation interface instead of calling a provider directly.

Expected internal interface:

```text
app feature -> shared LLM module -> provider registry -> provider adapter -> model API
```

The shared LLM module should support scenario routes such as:

- `cheap-dialogue`: default route for AI Companion character and narrator lines.
- Future routes for higher-quality writing, moderation-sensitive tasks, image prompts, or premium features.

Admin model choice should control:

- Default route for AI Companion dialogue.
- Provider priority order.
- Default model per provider.
- Fallback provider behavior.

Normal users must not receive:

- Provider names.
- Model names.
- Token usage.
- Estimated cost.
- Routing strategy.
- API keys or provider configuration.

## Provider direction

The first provider direction should prioritize low-cost text generation.

Preferred starting providers:

- DeepSeek.
- Doubao / VolcEngine Ark.

Future providers can include:

- OpenAI.
- Gemini.
- xAI / Grok.
- Other providers with useful cost, quality, latency, or safety tradeoffs.

New providers should be added through a provider registry or adapter. Adding a provider should not require rewriting AI Companion story logic or app-specific game logic.

## Cost-control policy

Admin model selection exists for platform operations, not user customization.

The admin should be able to change model routing to manage:

- Cost per generation.
- Output quality.
- Provider downtime.
- Regional latency.
- Safety and content-policy fit.

Token usage and estimated cost are internal operator data only. They can be logged for platform analysis, but they must not be exposed in normal user payloads or gameplay UI.

User model preference is future work. It should only be considered after the platform has:

- A stable shared LLM module.
- Internal usage and cost logging.
- Clear pricing rules for premium model access.
- A safe UX that prevents accidental high-cost usage.

## Admin behavior

The first version of admin control can be backend/admin configuration. A full admin UI is not required for the first implementation.

The reserved admin identity is `admin@aiappsbox.com`. This identity should be treated as the first platform operator account when admin UI or admin APIs are added.

Admin configuration should be fail-safe:

- If admin model config is missing, use the default backend route.
- If the configured provider key is missing, try the next configured provider.
- If all providers fail, return deterministic fallback text.
- If config is invalid, do not expose the error to normal users.

Admin configuration must not accidentally expose model choice to regular users. Any future admin API must require admin identity checks and must not be reachable as a normal app gameplay endpoint.

## AI Companion integration

AI Companion should depend on the shared LLM layer once it is implemented.

The companion game should continue to own:

- Story state transitions.
- Hidden affinity scoring.
- Light on/off/blow-up state.
- Opening-story match rules.
- Platform points event creation.

The shared LLM layer should own:

- Provider/model selection.
- Provider fallback.
- Provider-specific request/response normalization.
- Token usage and cost logging.

AI Companion should not expose model/provider details in bootstrap, session, story, or final-choice responses.

## Acceptance criteria

- Documentation clearly distinguishes current implementation from intended future implementation.
- Documentation states that users cannot choose models in v1.
- Documentation states that `admin@aiappsbox.com` is the first admin identity.
- Documentation states that token and cost data are internal only.
- Documentation makes clear that AI Companion should use a shared LLM layer in the future instead of direct provider calls.
- No code, schema, migration, or frontend behavior changes are required by this spec.

## Assumptions

- Documentation language is English.
- This spec is documentation only.
- The unified LLM module and admin controls will be implemented in a later development step.
