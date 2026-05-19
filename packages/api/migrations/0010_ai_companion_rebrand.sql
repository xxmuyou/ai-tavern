UPDATE apps
SET name = 'AI Companion'
WHERE app_key = 'ai-tv-dating';

UPDATE show_templates
SET
  title = 'AI Companion',
  subtitle = 'Opening Story',
  premise = 'Meet AI companions through a playful opening story, unlock the character you connect with, and continue into solo story chapters.',
  ending_rules = 'A successful final choice unlocks one continuing companion for solo stories. The opening story should feel like the beginning of an ongoing relationship.',
  opening_scene = 'Welcome to the opening story. Meet the companion gallery, choose who catches your attention, and let the first scene begin.'
WHERE show_key = 'dating-heart-signal';

UPDATE llm_model_routes
SET description = 'Low-cost text route for AI Companion character and narrator dialogue.'
WHERE route_key = 'cheap-dialogue';
