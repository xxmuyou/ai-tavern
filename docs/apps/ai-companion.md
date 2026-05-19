# AI Companion

## Product Truth

AI Companion is a web story game about discovering, unlocking, and continuing relationships with AI characters.

The product is no longer a TV show platform. The opening dating-show scene is only chapter one: it gives the user a familiar story frame to meet characters, create tension, make choices, and unlock companions. After a character is unlocked, the core product becomes ongoing solo companion stories.

## First Screen

The homepage must immediately answer what this product is:

- Brand: `AI Companion`.
- Primary CTA: `Start Now`.
- Main attraction: a large gallery of official and community-published Guest cards.
- Each card uses character imagery first, then name, short public tags, and public status.
- No user-visible copy should suggest a future TV show platform, debug surface, or model playground.

If final art is missing, the UI should show stable placeholders and asset slots without pretending final art exists.

## Visual Asset Direction

Character and host assets should move toward transparent-background PNG/WebP foreground layers. Chapter scenes should render the room or stage as the background layer, then place the active host or Guest portrait on top so they visually belong inside the chapter environment. The admin image replacement flow should later validate and preview transparent images before publishing them to system defaults.

## Player Flow

1. User opens the website and sees the companion gallery.
2. User clicks `Start Now` or a Guest card.
3. If signed out, the sign-in modal opens.
4. After sign-in, the user enters Casting.
5. Casting asks only for avatar, age range, occupation, and hobbies.
6. The opening story uses a dating-show frame to introduce and test chemistry with Guests.
7. A successful final choice unlocks the selected character as a companion.
8. The unlocked companion appears in Workspace and can continue into solo story turns.

The user should not be asked to self-label personality at the start. Personality tags are discovered through answers and story events.

## Workspace

Workspace is entered through the user avatar/profile control in the topbar.

Workspace contains:

- Unlocked companions and story progress.
- User profile summary and derived tags.
- User-created character assets.
- Creative Workshop.
- Recent story sessions and referenced uploads.

## Creative Workshop

Creative Workshop is the creator-facing area inside Workspace.

Users can:

- Create private Guest characters.
- Upload avatar, portrait, gallery, and visual-state images.
- Edit the full Guest JSON package.
- Save drafts privately.
- Publish a Guest to the community library.

Published community Guests can appear in the homepage gallery and can be selected by other users for the opening story. Other users cannot edit a Guest they do not own.

## Guest Package

Guest characters are versionable packages, not loose UI fields.

The package shape is:

- `identity`: name, gender, age range, occupation, lifestyle, hobbies.
- `assets`: avatar, portrait, gallery images, and visual-state image map.
- `persona`: personality, speaking style, goal, boundaries, hidden preferences.
- `stateModel`: default mood, expression, action, energy, intimacy, curiosity, and coefficients.
- `matchRules`: hard preferences, soft preferences, positive signals, negative signals, dealbreakers, blow-up signals, thresholds.
- `publicProfile`: visible tags and public display metadata.

Session creation copies the resolved Guest package into a session snapshot. Editing or publishing a character later must not mutate old sessions or old unlocked companion snapshots.

## Pricing

The main paid value is continuing deeper companion stories after free trial turns. The opening story should remain accessible enough to demonstrate the fantasy.

Topbar label is `Pricing`. Payment implementation may still use the existing platform subscription backend internally.

## Current Scope

In scope:

- AI Companion homepage and gallery.
- Opening dating-show story as chapter one.
- Companion unlock and solo story continuation.
- Workspace and Creative Workshop.
- Community publishing for user-created Guests.

Out of scope for the current product direction:

- A generic TV show platform.
- Multiple show formats such as singing, debate, auditions, or talk shows.
- User-facing model/provider controls.
- Full moderation workflow for community publishing.
