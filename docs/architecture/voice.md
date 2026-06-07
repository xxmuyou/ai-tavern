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

When a companion does not have a stored `voice_id`, the backend falls back by
gender:

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

## Companion Voice Selection

Companion create/edit uses a cascading picker in the `Opening & voice` section:

1. `Gender`: starts from the companion gender and drives recommendation order.
2. `Language/Region`: derived from MiniMax `language_label`.
3. `Voice`: filtered by the selected language/region and sorted with matching
   `gender_hint` first.

Changing gender or language/region selects the first recommended valid voice in
that slice. Gender remains recommendation metadata only; the UI must still allow
any listed voice for any companion.

After a concrete voice is selected, the form shows a speaker preview button.
Preview uses this fixed English line:

```text
Hi, I’m here with you. Let’s take this one moment at a time.
```

Preview always renders at the `medium` speed preset, even when the companion is
configured for `slow` or `fast`. This keeps the global preview cache to one clip
per voice id. The preview cache key includes the render version, MiniMax model,
fixed preview text, voice id, and `medium`; repeated previews reuse R2 without
calling MiniMax again.

## Public API Surface

- `GET /voice/options` returns the user-facing voice catalog, defaults, and
  speed presets. It does not return `group_id`.
- `POST /voice/preview` returns a signed URL for the globally cached medium-speed
  preview of a selected voice id.
- `POST /companions` and `PUT /companions/{id}` accept `voice_id` and
  `voice_speed`.
- `POST /chat/{companion_id}/messages/{message_id}/voice` uses the companion's
  persisted voice settings.

## References

- MiniMax system voice IDs: https://platform.minimaxi.com/docs/faq/system-voice-id
- MiniMax T2A guide and supported models/languages: https://platform.minimaxi.com/docs/guides/speech-t2a-websocket
