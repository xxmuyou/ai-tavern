# Voice Architecture

Voice is a MiniMax T2A integration. It turns companion replies into cached MP3
clips for manual playback or auto voice in chat.

## Source Of Truth

MiniMax voice has two different kinds of configuration:

| Kind | Source | Notes |
|---|---|---|
| Secret | `MINIMAX_API_KEY` in `.env.*` / Wrangler secret | The only MiniMax voice secret. Also used by MiniMax chat. |
| Non-secret TTS config | `config/minimax-voices.<env>.json` | Owns GroupId, TTS model, default voices, speed presets, and system voice catalog. |

Do not put `MINIMAX_GROUP_ID`, `MINIMAX_TTS_MODEL`,
`MINIMAX_TTS_VOICE_FEMALE`, or `MINIMAX_TTS_VOICE_MALE` in `.env.*`. Those were
historical overrides and are retired. `.env.*` is for secrets and local/runtime
environment values; MiniMax TTS catalog/config is repo-managed data.

## Config Shape

Each environment has a checked-in config file:

- `config/minimax-voices.dev.json`
- `config/minimax-voices.prod.json`

The files contain:

- `provider`: currently always `minimax`
- `group_id`: MiniMax account GroupId required by T2A
- `model`: current TTS model, for example `speech-2.6-turbo`
- `defaults`: default voice ids and default speed preset
- `speed_presets`: `slow`, `medium`, `fast`
- `voices`: the full MiniMax system voice catalog from the official docs

The catalog stores `language` and `language_label` so the UI can group/filter
voices. This is not a language detector. The synthesis request keeps
`language_boost: "auto"` so MiniMax can optimize each reply's pronunciation.

`gender_hint` is best-effort recommendation metadata inferred from MiniMax names
and labels. It is never a hard product rule: users can pick any voice for any
companion.

### Display labels

The raw MiniMax catalog may contain Chinese labels even for non-Chinese language
groups. Product UI should not blindly render every raw label as-is. Companion
create/edit should display each language group in that language where practical
(`English`, `日本語`, `한국어`, `Español`, etc.) while keeping Chinese groups in
Chinese. Voice names should prefer a same-language display label when one exists;
if the catalog only has an English name for that voice, use that English name
rather than machine-translating it.

Implementation note: keep `id`, `label`, and `language_label` backward
compatible, and add or derive UI-facing display fields instead of changing the
meaning of persisted `voice_id`.

## Runtime Behavior

Companions persist their voice settings:

- `companions.voice_id`
- `companions.voice_speed`

These companion-level fields are defaults and legacy/backfill data. The chat UI
stores the active user choice separately in `user_companion_voice_settings`, so
each user can tune official and user-created companions without changing the
companion record for everyone else.

Runtime voice resolution is:

1. `user_companion_voice_settings` for `(user_id, companion_id)`
2. `companions.voice_id` / `companions.voice_speed`
3. gender defaults from `config/minimax-voices.<env>.json`

When neither a user override nor a companion voice id exists, the backend falls
back by gender:

- female or unknown: `defaults.female_voice_id`
- male: `defaults.male_voice_id`

When a companion does not have a stored speed, the backend uses
`defaults.speed`. The current presets are:

| Preset | MiniMax speed |
|---|---:|
| `slow` | `0.8` |
| `medium` | `1` |
| `fast` | `1.25` |

Voice output is cached in R2. The cache key includes the render version, voice
id, speed preset, and spoken text so changing voice settings does not reuse old
clips.

## Chat Voice Selection

Chat uses a voice settings dialog next to the chat voice toggle. The dialog uses
a cascading picker:

1. `Gender`: starts from the companion gender and drives recommendation order.
2. `Language/Region`: derived from MiniMax `language_label`.
3. `Voice`: filtered by the selected language/region and sorted with matching
   `gender_hint` first.

Changing gender hint or language/region selects the first recommended valid
voice in that slice. Gender remains recommendation metadata only; the UI must
still allow any listed voice for any companion.

After a concrete voice is selected, the dialog shows a speaker preview button.
Preview uses this fixed English line:

```text
Hi, I’m here with you. Let’s take this one moment at a time.
```

Preview always renders at the `medium` speed preset, even when the companion is
configured for `slow` or `fast`. Preview is not billed as chat voice generation.
This keeps the global preview cache to one clip per voice id. The preview cache
key includes the render version, MiniMax model, fixed preview text, voice id, and
`medium`; repeated previews reuse R2 without calling MiniMax again.

Chat reply voice generation is billed separately from chat messages. The first
successful voice request for a `(user_id, companion_id, message_id, voice_id,
voice_speed)` combination consumes `voice_generation` credits. Replaying the
same generated clip is free for that user. Changing voice or speed for the same
message creates a different billable combination. Admin users are exempt.

## Public API Surface

- `GET /voice/options` returns the user-facing voice catalog, defaults, and
  speed presets. It does not return `group_id`.
- `POST /voice/preview` returns a signed URL for the globally cached medium-speed
  preview of a selected voice id.
- `GET /chat/{companion_id}/voice-settings` returns the current user's effective
  voice setting for that companion.
- `PATCH /chat/{companion_id}/voice-settings` saves the current user's
  `voice_id` and `voice_speed` override.
- `POST /chat/{companion_id}/messages/{message_id}/voice` uses user override →
  companion default → gender default, bills first successful generation, and
  returns a signed MP3 URL.

## References

- MiniMax system voice IDs: https://platform.minimaxi.com/docs/faq/system-voice-id
- MiniMax T2A guide and supported models/languages: https://platform.minimaxi.com/docs/guides/speech-t2a-websocket
