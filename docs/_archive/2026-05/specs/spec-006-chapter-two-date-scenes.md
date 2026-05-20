# Spec 006: Chapter 2 Date Scenes

## Summary

Chapter 2 adds date scenes for companions unlocked through Chapter 1. It is implemented as a separate chapter flow, not as new Chapter 1 stages.

## Rules

- Only signed-in users can start Chapter 2.
- Only unlocked companions can be selected.
- Starting a date requires `companionId` and `locationKey`.
- Valid locations are `cafe`, `cinema`, and `bar`.
- Chapter 2 sessions and turns are stored separately from Chapter 1 show sessions.
- Chapter 1 affinity, light states, final-choice logic, and stage keys are unchanged.

## Locations

- Cafe: quiet conversation, emotional rhythm, daily-life intimacy.
- Cinema: shared attention, playful reaction, after-movie honesty.
- Bar: low-light chemistry, boundaries, direct romantic tension.

Each location starts with three turns:

- arrival/opening mood
- shared moment
- closing choice / next-date signal

## API

- `GET /shows/:showKey/chapter-two/locations`
- `POST /shows/:showKey/chapter-two/sessions`
- `GET /shows/:showKey/chapter-two/sessions/:sessionId`
- `POST /shows/:showKey/chapter-two/sessions/:sessionId/turns/:turnId/answer`

## Acceptance Criteria

- Chapter 2 is locked in the UI until Workspace has at least one unlocked companion.
- Chapter 2 can start with any unlocked companion and one preset location.
- Locked, missing, or cross-user companions cannot start Chapter 2.
- Each date location produces stable prompts and three-option turns.
- Answering the terminal turn completes the date session.
