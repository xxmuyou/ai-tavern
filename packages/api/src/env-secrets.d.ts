interface Env {
  MINIMAX_API_KEY?: string;
  // MiniMax T2A (text-to-speech) needs the account GroupId in addition to the
  // API key (the OpenAI-compatible chat endpoint does not). Voice ids and model
  // are optional overrides; sensible defaults are baked in.
  MINIMAX_GROUP_ID?: string;
  MINIMAX_TTS_MODEL?: string;
  MINIMAX_TTS_VOICE_FEMALE?: string;
  MINIMAX_TTS_VOICE_MALE?: string;
  RUNNINGHUB_API_KEY?: string;
  RUNNINGHUB_WEBHOOK_SECRET?: string;
  R2_SIGNING_KEY?: string;
}
