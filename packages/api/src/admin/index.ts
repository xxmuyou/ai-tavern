import { handleAdminAnalyticsRequest } from "./analytics";
import { handleAdminChatPromptDebugRequest } from "./chat-prompt-debug";
import { handleAdminCompanionArtRequest } from "./companion-art";
import { handleAdminCreditsRequest } from "./credits";
import { handleAdminAllowlistRequest } from "./user-allowlist";

export async function handleAdminRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const allowlistResponse = await handleAdminAllowlistRequest(request, env, pathname);
  if (allowlistResponse) return allowlistResponse;

  const companionArtResponse = await handleAdminCompanionArtRequest(request, env, pathname);
  if (companionArtResponse) return companionArtResponse;

  const chatPromptDebugResponse = await handleAdminChatPromptDebugRequest(request, env, pathname);
  if (chatPromptDebugResponse) return chatPromptDebugResponse;

  const analyticsResponse = await handleAdminAnalyticsRequest(request, env, pathname);
  if (analyticsResponse) return analyticsResponse;

  const creditsResponse = await handleAdminCreditsRequest(request, env, pathname);
  if (creditsResponse) return creditsResponse;

  return null;
}
