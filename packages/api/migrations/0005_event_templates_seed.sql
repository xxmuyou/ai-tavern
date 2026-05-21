-- spec-008: minimal default event templates.

INSERT INTO event_templates (
  id, event_type, companion_filter, trigger_probability, cooldown_seconds, priority,
  min_closeness, min_trust, min_romance, min_friendship,
  max_hostility, max_tension, max_distance,
  signal_trigger, options_json, is_active, created_at, updated_at
)
VALUES
  (
    'tpl_invitation_default', 'invitation', 'all', 0.20, 259200, 30,
    30, 25, NULL, NULL,
    30, NULL, NULL,
    NULL,
    '[{"id":"accept_eager","semantic":"warm acceptance","prompt_hint":"enthusiastic yes","signals":{"closeness":2,"romance":2,"friendship":1,"trust":1}},{"id":"accept_casual","semantic":"polite acceptance","prompt_hint":"low-key yes","signals":{"closeness":1,"friendship":1}},{"id":"decline_busy","semantic":"polite decline with reason","prompt_hint":"warm no","signals":{"friendship":1,"distance":1}},{"id":"decline_cold","semantic":"cold refusal","prompt_hint":"flat no","signals":{"hostility":1,"distance":2,"tension":1}}]',
    1, unixepoch() * 1000, unixepoch() * 1000
  ),
  (
    'tpl_conflict_default', 'conflict', 'all', 1.0, 172800, 80,
    NULL, NULL, NULL, NULL,
    NULL, NULL, NULL,
    'hostility:2',
    '[{"id":"apologize","semantic":"apologize sincerely","prompt_hint":"genuine apology","signals":{"hostility":-2,"tension":-1,"trust":1}},{"id":"explain","semantic":"explain calmly","prompt_hint":"defensive but civil","signals":{"hostility":-1,"distance":1}},{"id":"escalate","semantic":"push back","prompt_hint":"escalate","signals":{"hostility":2,"tension":2,"trust":-1}}]',
    1, unixepoch() * 1000, unixepoch() * 1000
  ),
  (
    'tpl_gift_default', 'gift', 'all', 0.10, 604800, 20,
    40, NULL, NULL, NULL,
    40, NULL, NULL,
    NULL,
    '[{"id":"accept_grateful","semantic":"grateful acceptance","prompt_hint":"warm thanks","signals":{"closeness":1,"friendship":1,"trust":1}},{"id":"accept_awkward","semantic":"awkward acceptance","prompt_hint":"shy thanks","signals":{"closeness":1,"tension":1}},{"id":"decline","semantic":"polite decline","prompt_hint":"warm no","signals":{"distance":1}}]',
    1, unixepoch() * 1000, unixepoch() * 1000
  ),
  (
    'tpl_confession_default', 'confession', 'all', 0.50, -1, 90,
    NULL, 45, 65, NULL,
    NULL, NULL, NULL,
    NULL,
    '[{"id":"reciprocate","semantic":"reciprocate love","prompt_hint":"heartfelt yes","signals":{"romance":3,"closeness":2,"trust":2,"friendship":1}},{"id":"need_time","semantic":"ask for time","prompt_hint":"warm but unsure","signals":{"romance":1,"tension":2,"trust":1}},{"id":"reject_gently","semantic":"gentle rejection","prompt_hint":"kind no","signals":{"romance":-2,"distance":2,"tension":1,"friendship":1}},{"id":"reject_firm","semantic":"firm rejection","prompt_hint":"hard no","signals":{"romance":-3,"distance":3,"hostility":1}}]',
    1, unixepoch() * 1000, unixepoch() * 1000
  ),
  (
    'tpl_milestone_default', 'milestone', 'all', 1.0, -1, 70,
    NULL, NULL, NULL, NULL,
    NULL, NULL, NULL,
    NULL,
    '[{"id":"reflect_fondly","semantic":"acknowledge fondly","prompt_hint":"warm reflection","signals":{"closeness":1,"friendship":1}},{"id":"reflect_neutrally","semantic":"neutral nod","prompt_hint":"polite ack","signals":{}}]',
    1, unixepoch() * 1000, unixepoch() * 1000
  );
