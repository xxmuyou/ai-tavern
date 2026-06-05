import { ImageGenError } from "./types";

export type RunningHubContractNode = {
  nodeId: string;
  class_type?: string;
  title?: string;
  inputs: string[];
};

export type RunningHubWorkflowContract = {
  version: 1;
  nodes: RunningHubContractNode[];
};

type RunningHubGetJsonApiFormatResponse = {
  code: number;
  msg?: string;
  data?: {
    prompt?: string | Record<string, unknown>;
  };
};

const DEFAULT_BASE_URL = "https://www.runninghub.ai";

export async function buildRunningHubWorkflowContract(
  prompt: string | Record<string, unknown>,
): Promise<{ contractJson: string; contractHash: string }> {
  const parsed = typeof prompt === "string" ? JSON.parse(prompt) : prompt;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("workflow_contract_prompt_invalid");
  }

  const nodes: RunningHubContractNode[] = [];
  for (const [nodeId, rawNode] of Object.entries(parsed)) {
    if (!rawNode || typeof rawNode !== "object" || Array.isArray(rawNode)) continue;
    const node = rawNode as Record<string, unknown>;
    const inputsRaw = node.inputs;
    if (!inputsRaw || typeof inputsRaw !== "object" || Array.isArray(inputsRaw)) continue;
    const meta = node._meta && typeof node._meta === "object" && !Array.isArray(node._meta)
      ? (node._meta as Record<string, unknown>)
      : {};
    nodes.push({
      class_type: typeof node.class_type === "string" ? node.class_type : undefined,
      inputs: Object.keys(inputsRaw).sort(),
      nodeId,
      title: typeof meta.title === "string" ? meta.title : undefined,
    });
  }

  nodes.sort((a, b) => nodeSortKey(a.nodeId).localeCompare(nodeSortKey(b.nodeId)));
  const contract: RunningHubWorkflowContract = { nodes, version: 1 };
  const contractJson = JSON.stringify(contract);
  const contractHash = await sha256(contractJson);
  return { contractHash, contractJson };
}

export function parseRunningHubWorkflowContract(
  contractJson: string | null | undefined,
): RunningHubWorkflowContract | null {
  if (!contractJson) return null;
  try {
    const parsed = JSON.parse(contractJson) as Partial<RunningHubWorkflowContract>;
    if (parsed.version !== 1 || !Array.isArray(parsed.nodes)) return null;
    return {
      nodes: parsed.nodes
        .map((node) => ({
          class_type: typeof node?.class_type === "string" ? node.class_type : undefined,
          inputs: Array.isArray(node?.inputs)
            ? node.inputs.filter((input): input is string => typeof input === "string")
            : [],
          nodeId: typeof node?.nodeId === "string" ? node.nodeId : "",
          title: typeof node?.title === "string" ? node.title : undefined,
        }))
        .filter((node) => node.nodeId && node.inputs.length > 0),
      version: 1,
    };
  } catch {
    return null;
  }
}

export function workflowContractHasField(
  contractJson: string | null | undefined,
  nodeId: string | null | undefined,
  fieldName: string | null | undefined,
): boolean {
  const node = findContractNode(contractJson, nodeId);
  return Boolean(node && fieldName && node.inputs.includes(fieldName));
}

export function findContractNode(
  contractJson: string | null | undefined,
  nodeId: string | null | undefined,
): RunningHubContractNode | null {
  const id = nodeId?.trim();
  if (!id) return null;
  const contract = parseRunningHubWorkflowContract(contractJson);
  return contract?.nodes.find((node) => node.nodeId === id) ?? null;
}

export async function fetchRunningHubWorkflowContract(input: {
  apiKey: string | null | undefined;
  baseUrl?: string | null;
  workflowId: string;
}): Promise<{ contractJson: string; contractHash: string }> {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) {
    throw new ImageGenError(
      "provider_not_configured",
      "RunningHub image provider missing config: api key",
      { retryable: false },
    );
  }
  const baseUrl = (input.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/api/openapi/getJsonApiFormat`, {
    body: JSON.stringify({ apiKey, workflowId: input.workflowId }),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  const json = await readJson<RunningHubGetJsonApiFormatResponse>(response);
  if (!response.ok || json.code !== 0) {
    throw new ImageGenError(
      "provider_config_error",
      json.msg || `RunningHub getJsonApiFormat failed with HTTP ${response.status}`,
      { retryable: false },
    );
  }
  const prompt = json.data?.prompt;
  if (!prompt) {
    throw new ImageGenError(
      "provider_bad_response",
      "RunningHub getJsonApiFormat response did not include data.prompt",
      { retryable: false },
    );
  }
  return buildRunningHubWorkflowContract(prompt);
}

function nodeSortKey(nodeId: string): string {
  const numeric = Number(nodeId);
  return Number.isFinite(numeric) ? numeric.toString().padStart(12, "0") : nodeId;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ImageGenError(
      "provider_bad_response",
      "RunningHub response was not valid JSON",
      { retryable: false },
    );
  }
}
