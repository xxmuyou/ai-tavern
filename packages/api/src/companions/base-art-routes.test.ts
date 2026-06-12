import { afterEach, describe, expect, it, vi } from "vitest";

import { handleBaseArtRequest } from "./base-art-routes";
import { llmCall } from "../llm";
import { LLMError } from "../llm/types";
import { getImageModelSelection } from "../image-gen";
import { createBaseArtJob, reserveImageGenerationCredits } from "../image-gen/base-art";

vi.mock("../auth", () => ({
  requireAuthUser: vi.fn(async () => ({ id: "usr_1" })),
}));

vi.mock("../llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../llm")>()),
  llmCall: vi.fn(),
}));

vi.mock("../image-gen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../image-gen")>()),
  getImageModelSelection: vi.fn(),
}));

vi.mock("../image-gen/base-art", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../image-gen/base-art")>()),
  createBaseArtJob: vi.fn(async () => "job_1"),
  reserveImageGenerationCredits: vi.fn(async () => ({ ok: true, reservationId: "res_1" })),
}));

vi.mock("../credits", () => ({
  releaseReservation: vi.fn(),
}));

const llmCallMock = vi.mocked(llmCall);
const createBaseArtJobMock = vi.mocked(createBaseArtJob);
const selectionMock = vi.mocked(getImageModelSelection);
const reserveMock = vi.mocked(reserveImageGenerationCredits);

function stubSelection(): void {
  selectionMock.mockResolvedValue({
    option_id: "portrait_create::anime_default",
    workflow: {
      key: "portrait_create",
      checkpoint_node_id: "1",
      checkpoint_field_name: "ckpt_name",
      generation_params_json: null,
      lora_node_id: null,
    },
    model: {
      id: "anime_default",
      ckpt_name: "anime.safetensors",
      label: "Anime Default",
    },
  } as never);
}

async function postGenerate(prompt: string): Promise<Response | null> {
  return handleBaseArtRequest(
    new Request("https://api.test/companions/base-art/generate", {
      body: JSON.stringify({ model: "anime_default", prompt, source: "text" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    {} as Env,
    "/companions/base-art/generate",
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("base-art generate prompt enhancement", () => {
  it("stores the LLM-enhanced English prompt on the job", async () => {
    stubSelection();
    llmCallMock.mockResolvedValue({ text: "1girl, solo, black hair, ponytail, short skirt" } as never);

    const res = await postGenerate("黑发马尾辫，吊带，短裙");

    expect(res?.status).toBe(202);
    expect(llmCallMock).toHaveBeenCalledOnce();
    expect(createBaseArtJobMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ prompt: "1girl, solo, black hair, ponytail, short skirt" }),
    );
  });

  it("falls back to the raw prompt when the LLM call fails", async () => {
    stubSelection();
    llmCallMock.mockRejectedValue(new LLMError("server_error", "boom"));

    const res = await postGenerate("黑发马尾辫，吊带，短裙");

    expect(res?.status).toBe(202);
    expect(createBaseArtJobMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ prompt: "黑发马尾辫，吊带，短裙" }),
    );
    expect(reserveMock).toHaveBeenCalledOnce();
  });
});
