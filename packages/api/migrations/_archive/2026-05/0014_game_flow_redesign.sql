-- Replace old dating-heart-signal stages with new 5-round flow.
-- New flow: initial_pick → self_intro → guest_questions → user_questions → final_choice

DELETE FROM show_stages
WHERE show_key = 'dating-heart-signal';

INSERT OR IGNORE INTO show_stages (
  id,
  show_key,
  stage_key,
  title,
  stage_order,
  goal,
  host_instruction,
  allowed_user_actions,
  auto_advance_after_messages,
  is_final
) VALUES
  (
    'dating-heart-signal-initial-pick',
    'dating-heart-signal',
    'initial_pick',
    'Initial pick',
    10,
    'Let the user privately choose one favorite guest without revealing hidden affinity.',
    'Frame the choice as a secret first heartbeat. Do not reveal guest preferences or scores.',
    '["choose_initial_guest"]',
    NULL,
    0
  ),
  (
    'dating-heart-signal-self-intro',
    'dating-heart-signal',
    'self_intro',
    'Self intro',
    20,
    'The user tells the room about themselves so guests can ask personalized questions.',
    'Explain why the info matters for the game. Invite the user to share age range, occupation, and hobbies.',
    '["submit_profile"]',
    NULL,
    0
  ),
  (
    'dating-heart-signal-guest-questions',
    'dating-heart-signal',
    'guest_questions',
    'Guest questions',
    30,
    'Guests ask personalized questions based on the user profile. User can move on when ready.',
    'Let a high-affinity guest ask one focused question based on the user profile, then react as the room shifts.',
    '["answer_guest_question"]',
    NULL,
    0
  ),
  (
    'dating-heart-signal-user-questions',
    'dating-heart-signal',
    'user_questions',
    'Your questions',
    40,
    'The user freely asks any guest anything before making the final choice.',
    'Tell the user the room is open. Let them pick any guest and ask one question. Guest answers in character.',
    '["ask_guest_question"]',
    NULL,
    0
  ),
  (
    'dating-heart-signal-final-choice',
    'dating-heart-signal',
    'final_choice',
    'Final choice',
    50,
    'The user chooses one available guest. Mutual compatibility decides success.',
    'Raise the stakes clearly and tell the user to choose one guest whose light is still with them, or walk away.',
    '["choose_guest","walk_away"]',
    NULL,
    0
  ),
  (
    'dating-heart-signal-completed',
    'dating-heart-signal',
    'completed',
    'Finale',
    60,
    'Summarize the ending and award points for a successful mutual match.',
    'Deliver a satisfying finale based on whether both sides matched.',
    '[]',
    NULL,
    1
  );
