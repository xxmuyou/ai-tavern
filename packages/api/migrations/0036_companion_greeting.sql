-- 0036: companion greeting + example dialogue.
-- greeting: the character's opening line. Seeded as the first companion message
--   when a thread is first opened, so a fresh chat is never a blank screen and
--   the opener is part of the conversation context.
-- example_dialogues: a JSON array of sample lines in the character's voice,
--   injected into the chat system prompt as few-shot anchors so user-created
--   characters hold a consistent voice. NULL = none.
ALTER TABLE companions ADD COLUMN greeting TEXT;
ALTER TABLE companions ADD COLUMN example_dialogues TEXT;
