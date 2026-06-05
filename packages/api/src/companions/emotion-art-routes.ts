import { jsonResponse } from "../http";

/**
 * spec-031 retires portrait variation companion emotion portraits. Historical art_emotions
 * data remains readable through companion records, but this surface no longer
 * starts or lists generation jobs.
 */
export async function handleCompanionEmotionArtRequest(
  _request: Request,
  _env: Env,
  pathname: string,
): Promise<Response | null> {
  if (
    /^\/companions\/[^/]+\/emotion-art\/[^/]+\/generate$/.test(pathname) ||
    /^\/companions\/[^/]+\/emotion-art\/jobs$/.test(pathname)
  ) {
    return retiredResponse();
  }

  return null;
}

export function retiredResponse(): Response {
  return jsonResponse(
    {
      error: "feature_retired",
      message: "Companion emotion-art generation has been retired.",
    },
    { status: 410 },
  );
}
