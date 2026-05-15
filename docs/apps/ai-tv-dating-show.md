# AI TV Dating Show

## Product concept

AI TV Dating Show is the first real mini app in the shared `xtbit-apps` platform. The broader product idea is an AI-powered TV show game platform where the user is the main character, the show format defines the scene, and AI characters react in real time.

The long-term platform can support many show formats, such as dating shows, singing competitions, talk shows, debate shows, survival shows, or talent auditions. The MVP starts with one format only: a dating show.

The core product boundary is:

```text
The platform directs the show. Users create the characters.
```

Users should not be asked to design complex plots, stage logic, endings, or prompt chains in the first creator version. The platform owns the show structure, pacing, scoring rules, and outcome rules. Users get creative control over characters: who appears, what they are like, what they prefer, what turns them off, and how they speak.

## MVP goal

Ship a complete, playable dating show loop quickly enough for traffic testing. The MVP should feel like a short interactive TV episode, not a full creator platform.

The user should be able to:

- Enter the app from the shared platform.
- Upload their own photo or choose a default avatar.
- Choose the guest gender preference: male guests, female guests, or any.
- Start a dating show session.
- Talk with the host and guests through AI-generated dialogue.
- Read each guest profile and see lightweight affection changes.
- Make a final choice: match with one guest or walk away from everyone.

## Core experience

The user is treated as the lead guest of the show. A host introduces the stage, presents guests, asks questions, and moves the episode forward. Each guest has a fixed profile, visual identity, preferences, boundaries, and speaking style.

The episode should have a clear TV structure:

1. Initial pick: the user privately chooses one favorite guest before knowing any guest's preferences or affinity.
2. Profile judgment: guests evaluate the user's basic profile, such as age, occupation, hobbies, lifestyle, and relationship values.
3. Guest questions: guests with enough hidden affinity may actively ask the user questions.
4. User declaration: the user says what they like and dislike in a partner, affecting all remaining guests.
5. Final match: the user chooses one remaining guest; the match succeeds only if both sides are compatible.

The host drives every stage. The user should feel like they are inside a structured TV show, while the hidden rules create game tension behind the scenes.

## Why it is compelling

- Strong roleplay loop: the user is not watching a show; they are inside the show.
- Clear content format: the dating show structure is immediately understandable.
- Replayability: different guest lineups, user choices, and AI responses can produce different outcomes.
- Fast production model: preset character art and structured AI prompts reduce content cost.
- Platform expansion: the same underlying engine can later power singing auditions, interview shows, or other formats.

## MVP content strategy

Guest images are preset assets. The MVP does not generate guest images in real time.

User identity uses a lightweight avatar approach:

- Primary path: user uploads a photo.
- Fallback path: user chooses a default avatar.
- The uploaded photo is used only as a profile/avatar reference inside the show.
- The MVP does not perform face swapping, deepfake generation, or identity verification.

The show uses real-time AI dialogue for the host and guests. AI generates lines, reactions, summaries, and ending text, while the application state machine controls stage transitions and final outcomes.

## LLM model policy

AI TV Dating should not expose model selection to normal users in v1. The user plays the show; the platform decides which backend model powers the host and guest dialogue.

The expected platform direction is admin-controlled model routing:

- The first reserved admin identity is `admin@aiappsbox.com`.
- Admins should be able to choose or configure backend model routes to control cost, quality, latency, and provider availability.
- Normal users should not see provider names, model names, token usage, estimated cost, routing strategy, or API keys.
- The first low-cost provider direction should prioritize DeepSeek and Doubao / VolcEngine Ark.
- Higher-cost or more specialized providers such as OpenAI, Gemini, and xAI / Grok can be added later through a shared LLM provider layer.

Current implementation is still environment-based and backend-controlled. There is no user-facing model picker and no admin model-management UI yet. If no model key is configured, the backend should keep the episode playable with safe fallback dialogue.

See `docs/specs/spec-005-llm-admin-model-selection.md` for the shared LLM model-management direction.

## Character Studio v1

Character Studio v1 lets users create or edit guest characters for an existing platform-directed show. It is not a full director mode.

Users can configure:

- Name
- Gender
- Avatar
- Age range
- Occupation
- City or lifestyle tag
- Hobbies
- Personality keywords
- Speaking style
- Favorite partner traits
- Disliked partner traits
- Dealbreakers

Users cannot configure:

- Stage order
- Host instructions
- Ending rules
- Affinity formulas
- Direct numeric scores
- Full system prompts
- Platform points or rewards

The system converts user-friendly character fields into hidden matching rules. For example, if a user writes that a guest likes "honest, responsible, funny people", the system can map that to positive signals such as `honesty`, `responsibility`, and `humor`.

## Character model

Each guest should have a stable profile:

- Name
- Gender
- Age range
- Occupation tag
- Personality keywords
- Dating preferences
- Dealbreakers
- Speaking style
- Avatar asset key
- Positive signals
- Negative signals
- Blow-up signals
- Match threshold
- Hidden affinity state

Example guest profile:

```json
{
  "name": "Mia",
  "gender": "female",
  "ageRange": "25-30",
  "occupationTag": "indie musician",
  "personalityKeywords": ["direct", "playful", "emotionally observant"],
  "preferences": ["creative people", "honest communication", "shared humor"],
  "dealbreakers": ["arrogance", "emotional avoidance"],
  "speakingStyle": "warm, teasing, concise",
  "avatarAssetKey": "apps/ai-tv-dating/guests/mia.png",
  "positiveSignals": ["honesty", "creativity", "shared_fun"],
  "negativeSignals": ["arrogance", "avoidance"],
  "dealbreakerSignals": ["contempt"],
  "blowUpSignals": ["honesty", "creativity", "humor"],
  "matchThreshold": 75
}
```

## Hidden affinity and matching

Guest affinity is hidden by default. Users should not directly see each guest's affinity score, preferences, or dealbreakers.

Visible guest states should be simple:

- Light on: still interested.
- Light off: unavailable.
- Blow-up: strongly interested.
- Final selectable: eligible for the final choice.

Hidden values can support future items or features. For example, a later prop could reveal one guest's current tendency, one hidden preference, or one dealbreaker hint.

The game should use a controlled scoring pipeline:

```text
User text -> AI extracts structured signals -> backend applies scoring rules -> show state updates
```

AI should identify signals such as:

- `honesty`
- `humor`
- `responsibility`
- `ambition`
- `stability`
- `creativity`
- `adventure`
- `materialism`
- `avoidance`
- `arrogance`
- `aggression`
- `controlling`

AI does not directly change affinity. The backend decides how each signal affects each guest based on that guest's stored rules.

## Five-stage dating format

### 1. Initial pick

The user privately chooses one favorite guest. This choice is recorded but does not reveal whether the guest likes the user.

This stage creates tension: the user has a preference before seeing hidden compatibility.

### 2. Profile judgment

The user provides basic profile information:

- Age range
- Occupation
- Hobbies
- Relationship values
- Lifestyle notes
- Favorite partner type

Each guest evaluates the profile against hard conditions and soft preferences.

Possible outcomes:

- Light stays on.
- Light turns off if a dealbreaker is hit.
- Guest blows up if multiple strong preferences are hit.

### 3. Guest questions

Guests whose hidden affinity is above a threshold may ask the user a question. The user's answer affects all guests, not only the guest who asked.

This stage makes the show feel active: guests are not passive cards; they test the user.

### 4. User declaration

The user gets a speech moment to explain the type of person they like and dislike.

This is a high-impact stage. It can raise affinity with compatible guests and lower affinity with guests who feel rejected by the user's stated type.

### 5. Final match

The user can choose only one guest who still has their light on or has blown up.

The match succeeds only if:

- The selected guest is still available.
- The selected guest's hidden affinity is above the match threshold.
- No critical dealbreaker has been triggered.

A successful match may create a platform points event. The points account and rewards implementation should be handled in a separate spec.

## Non-MVP

The first release should not include:

- User-created shows.
- Full creative workshop.
- Real-time guest image generation.
- Multi-show catalog.
- Voice/video generation.
- Complex long-term relationship simulation.
- App-specific subscription plans.

Full director mode remains non-MVP. Character Studio is the first creator feature because it gives users creative agency without handing them the fragile parts of the show engine.

These should remain future expansion paths after the dating show proves it can attract traffic.

## Platform fit

This app uses the shared platform model:

- `app_key`: `ai-tv-dating`
- Shared domain.
- Shared platform account.
- Shared platform pass subscription.
- Shared D1 database with app-level `app_key` isolation.
- Shared R2 storage for uploaded avatars and preset visual assets.

The app should not create its own user system, payment account, or standalone database.

## Success criteria

The MVP is successful if a new user can complete one full episode without guidance and understands the result.

Minimum product success signals:

- Users start a show after landing on the app.
- Users send multiple messages during the episode.
- Users reach the final choice screen.
- Users replay or start another session.
- Users understand that the platform can contain more AI TV show formats later.
