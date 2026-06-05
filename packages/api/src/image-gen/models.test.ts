import { describe, expect, it } from "vitest";

import {
  createImageLora,
  createImageModel,
  getImageModelSelection,
  getImageWorkflow,
  imageModelOptionId,
  listActiveImageModelOptions,
  resolveImageLoraSelection,
  upsertImageWorkflow,
} from "./models";

type ModelRow = {
  id: string;
  label: string;
  tag: string;
  ckpt_name: string;
  architecture: string;
  style_family: string;
  purpose: string;
  tags: string;
  is_active: number;
  sort_order: number;
};

type WorkflowRow = {
  key: string;
  label: string;
  architecture: string;
  mode: "create" | "variation" | "cutout";
  workflow_id: string;
  prompt_node_id: string;
  checkpoint_node_id: string | null;
  checkpoint_field_name: string;
  load_image_node_id: string | null;
  is_active: number;
  sort_order: number;
  updated_at: number;
  updated_by: string | null;
};

type BindingRow = {
  workflow_key: string;
  model_id: string;
  is_active: number;
  sort_order: number;
};

type LoraRow = {
  id: string;
  label: string;
  lora_name: string;
  architecture: string;
  style_family: string;
  default_model_strength: number;
  default_clip_strength: number | null;
  is_active: number;
};

type LoraBindingRow = {
  workflow_key: string;
  model_id: string;
  lora_id: string;
  is_active: number;
};

describe("RunningHub workflow/model catalog", () => {
  it("lists active workflow-model options and resolves an option id", async () => {
    const env = createEnv();

    await expect(listActiveImageModelOptions(env)).resolves.toEqual([
      {
        checkpoint_applies: true,
        ckpt_name: "animagine.safetensors",
        generation_controls: null,
        id: "portrait_create::anime_default",
        label: "Anime · Portrait create",
        loras: [],
        model_id: "anime_default",
        tag: "anime",
        workflow_key: "portrait_create",
        workflow_label: "Portrait create",
      },
    ]);

    const selection = await getImageModelSelection(env, imageModelOptionId("portrait_create", "anime_default"));
    expect(selection).toMatchObject({
      model: { ckpt_name: "animagine.safetensors", id: "anime_default" },
      workflow: {
        checkpoint_field_name: "ckpt_name",
        checkpoint_node_id: "4",
        key: "portrait_create",
      },
    });
  });

  it("falls back from a legacy bare model id to the first active binding", async () => {
    const selection = await getImageModelSelection(createEnv(), "anime_default");

    expect(selection?.option_id).toBe("portrait_create::anime_default");
    expect(selection?.workflow.checkpoint_field_name).toBe("ckpt_name");
  });

  it("loads workflow checkpoint field names from the workflow, not the model", async () => {
    const workflow = await getImageWorkflow(createEnv(), "portrait_create");

    expect(workflow?.checkpoint_field_name).toBe("ckpt_name");
    expect(workflow?.checkpoint_node_id).toBe("4");
  });

  it("does not list or resolve workflow/checkpoint architecture mismatches", async () => {
    const env = createEnv({ modelArchitecture: "flux1" });

    await expect(listActiveImageModelOptions(env)).resolves.toEqual([]);
    await expect(getImageModelSelection(env, imageModelOptionId("portrait_create", "anime_default"))).resolves.toBeNull();
  });

  it("requires architecture on new checkpoint, LoRA, and workflow rows", async () => {
    const env = createEnv();

    await expect(createImageModel(env, "bad_model", {
      ckpt_name: "bad.safetensors",
      is_active: true,
      label: "Bad",
      sort_order: 1,
      tag: "anime",
    }, "admin")).rejects.toThrow(/checkpoint architecture/);
    await expect(createImageLora(env, "bad_lora", {
      default_clip_strength: null,
      default_model_strength: 1,
      is_active: true,
      label: "Bad LoRA",
      lora_name: "bad.safetensors",
      sort_order: 1,
      style_family: "anime",
      tags: "anime",
    }, "admin")).rejects.toThrow(/LoRA architecture/);
    await expect(upsertImageWorkflow(env, {
      checkpoint_field_name: "ckpt_name",
      checkpoint_node_id: "4",
      is_active: true,
      key: "portrait_create",
      label: "Portrait create",
      load_image_field_name: "image",
      load_image_node_id: null,
      lora_clip_strength_field_name: null,
      lora_model_strength_field_name: "strength_model",
      lora_name_field_name: "lora_name",
      lora_node_id: null,
      mode: "create",
      model_ids: ["anime_default"],
      negative_prompt_field_name: "prompt",
      negative_prompt_node_id: null,
      prompt_field_name: "text",
      prompt_node_id: "6",
      sort_order: 1,
      workflow_id: "workflow-1",
    }, "admin")).rejects.toThrow(/workflow architecture/);
  });

  it("rejects workflow checkpoint and LoRA bindings with mismatched architecture or lane", async () => {
    await expect(upsertImageWorkflow(createEnv({ modelArchitecture: "flux1" }), {
      ...workflowInput(),
      architecture: "sdxl",
    }, "admin")).rejects.toThrow(/cannot bind checkpoint/);

    await expect(upsertImageWorkflow(createEnv({ loraArchitecture: "flux1" }), {
      ...workflowInput(),
      architecture: "sdxl",
      lora_bindings: [{ lora_ids: ["anime_detail"], model_id: "anime_default" }],
      lora_node_id: "12",
    }, "admin")).rejects.toThrow(/cannot bind LoRA/);

    await expect(upsertImageWorkflow(createEnv({ loraStyleFamily: "realistic" }), {
      ...workflowInput(),
      architecture: "sdxl",
      lora_bindings: [{ lora_ids: ["anime_detail"], model_id: "anime_default" }],
      lora_node_id: "12",
    }, "admin")).rejects.toThrow(/lane anime cannot bind LoRA/);
  });

  it("allows none-architecture workflows only without checkpoint or LoRA bindings", async () => {
    await expect(upsertImageWorkflow(createEnv(), {
      ...workflowInput(),
      architecture: "none",
      checkpoint_node_id: null,
      key: "chat_moment",
      load_image_field_name: "url",
      load_image_node_id: "1",
      mode: "create",
      model_ids: [],
      prompt_node_id: "13",
    }, "admin")).resolves.toBeUndefined();

    await expect(upsertImageWorkflow(createEnv(), {
      ...workflowInput(),
      architecture: "none",
      lora_bindings: [{ lora_ids: ["anime_detail"], model_id: "anime_default" }],
      lora_node_id: "12",
      model_ids: ["anime_default"],
    }, "admin")).rejects.toThrow(/architecture none cannot bind checkpoint or LoRA assets/);
  });

  it("resolves matching workflow/checkpoint/LoRA bindings only", async () => {
    await expect(upsertImageWorkflow(createEnv(), {
      ...workflowInput(),
      architecture: "sdxl",
      lora_bindings: [{ lora_ids: ["anime_detail"], model_id: "anime_default" }],
      lora_node_id: "12",
    }, "admin")).resolves.toBeUndefined();

    await expect(resolveImageLoraSelection(createEnv(), {
      loraId: "anime_detail",
      modelId: "anime_default",
      workflowKey: "portrait_create",
    })).resolves.toMatchObject({
      lora_name: "detail.safetensors",
      model_strength: 0.8,
    });

    await expect(resolveImageLoraSelection(createEnv({ loraArchitecture: "flux1" }), {
      loraId: "anime_detail",
      modelId: "anime_default",
      workflowKey: "portrait_create",
    })).resolves.toBeNull();
  });
});

function createEnv(options: { loraArchitecture?: string; loraStyleFamily?: string; modelArchitecture?: string } = {}): Env {
  const models = new Map<string, ModelRow>([
    [
      "anime_default",
      {
        architecture: options.modelArchitecture ?? "sdxl",
        ckpt_name: "animagine.safetensors",
        id: "anime_default",
        is_active: 1,
        label: "Anime",
        purpose: "portrait",
        sort_order: 10,
        style_family: "anime",
        tag: "anime",
        tags: "anime",
      },
    ],
  ]);
  const loras = new Map<string, LoraRow>([
    [
      "anime_detail",
      {
        architecture: options.loraArchitecture ?? "sdxl",
        default_clip_strength: null,
        default_model_strength: 0.8,
        id: "anime_detail",
        is_active: 1,
        label: "Anime Detail",
        lora_name: "detail.safetensors",
        style_family: options.loraStyleFamily ?? "anime",
      },
    ],
  ]);
  const workflows = new Map<string, WorkflowRow>([
    [
      "portrait_create",
      {
        architecture: "sdxl",
        checkpoint_field_name: "ckpt_name",
        checkpoint_node_id: "4",
        is_active: 1,
        key: "portrait_create",
        label: "Portrait create",
        load_image_node_id: null,
        mode: "create",
        prompt_node_id: "6",
        sort_order: 10,
        updated_at: 0,
        updated_by: null,
        workflow_id: "workflow-1",
      },
    ],
  ]);
  const bindings: BindingRow[] = [
    { is_active: 1, model_id: "anime_default", sort_order: 1, workflow_key: "portrait_create" },
  ];
  const loraBindings: LoraBindingRow[] = [
    { is_active: 1, lora_id: "anime_detail", model_id: "anime_default", workflow_key: "portrait_create" },
  ];

  function optionRows() {
    return bindings
      .filter((binding) => binding.is_active === 1)
      .map((binding) => {
        const workflow = workflows.get(binding.workflow_key)!;
        const model = models.get(binding.model_id)!;
        if (workflow.is_active !== 1 || workflow.mode !== "create" || model.is_active !== 1 || workflow.architecture !== model.architecture) return null;
        return {
          checkpoint_node_id: workflow.checkpoint_node_id,
          ckpt_name: model.ckpt_name,
          label: model.label,
          model_id: model.id,
          tag: model.tag,
          workflow_key: workflow.key,
          workflow_label: workflow.label,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  }

  function selectionRow(workflowKey: string, modelId: string) {
    const binding = bindings.find((row) => row.workflow_key === workflowKey && row.model_id === modelId && row.is_active === 1);
    const workflow = workflows.get(workflowKey);
    const model = models.get(modelId);
    if (!binding || !workflow || !model) return null;
    if (workflow.architecture !== model.architecture) return null;
    return {
      ...workflow,
      model_architecture: model.architecture,
      model_ckpt_name: model.ckpt_name,
      model_id: model.id,
      model_label: model.label,
      model_purpose: model.purpose,
      model_style_family: model.style_family,
      model_tag: model.tag,
      model_tags: model.tags,
    };
  }

  function loraSelectionRow(workflowKey: string, modelId: string, loraId: string) {
    const workflow = workflows.get(workflowKey);
    const model = models.get(modelId);
    const lora = loras.get(loraId);
    const binding = loraBindings.find((row) =>
      row.workflow_key === workflowKey && row.model_id === modelId && row.lora_id === loraId && row.is_active === 1
    );
    if (!workflow || !model || !lora || !binding || workflow.is_active !== 1 || model.is_active !== 1 || lora.is_active !== 1) return null;
    if (workflow.architecture !== model.architecture || lora.architecture !== model.architecture || lora.style_family !== model.style_family) return null;
    return {
      default_clip_strength: lora.default_clip_strength,
      default_model_strength: lora.default_model_strength,
      id: lora.id,
      label: lora.label,
      lora_name: lora.lora_name,
    };
  }

  const executeAll = async (sql: string, values: unknown[]) => {
    if (sql.includes("w.key AS workflow_key")) return { results: optionRows() };
    if (sql.includes("SELECT wm.workflow_key")) {
      const [modelId] = values as [string];
      const binding = bindings.find((row) => row.model_id === modelId && row.is_active === 1);
      return { results: binding ? [{ workflow_key: binding.workflow_key }] : [] };
    }
    if (sql.includes("FROM image_models WHERE id IN")) {
      return { results: (values as string[]).map((id) => models.get(id)).filter(Boolean) };
    }
    if (sql.includes("FROM image_loras WHERE id IN")) {
      return { results: (values as string[]).map((id) => loras.get(id)).filter(Boolean) };
    }
    return { results: [] };
  };
  const executeFirst = async (sql: string, values: unknown[]) => {
    if (sql.includes("FROM image_workflow_model_loras wml")) {
      const [workflowKey, modelId, loraId] = values as [string, string, string];
      return loraSelectionRow(workflowKey, modelId, loraId);
    }
    if (sql.includes("FROM image_workflow_models wm")) {
      const [workflowKey, modelId] = values as [string, string];
      return selectionRow(workflowKey, modelId);
    }
    if (sql.includes("FROM image_workflows WHERE key = ?")) {
      const [key] = values as [string];
      return workflows.get(key) ?? null;
    }
    return null;
  };
  const prepare = (sql: string) => ({
    bind: (...values: unknown[]) => ({
      all: () => executeAll(sql, values),
      first: () => executeFirst(sql, values),
      run: async () => ({ meta: { changes: 1 } }),
    }),
    all: () => executeAll(sql, []),
    first: () => executeFirst(sql, []),
    run: async () => ({ meta: { changes: 1 } }),
  });

  return { DB: { batch: async () => [], prepare } } as unknown as Env;
}

function workflowInput() {
  return {
    checkpoint_field_name: "ckpt_name",
    checkpoint_node_id: "4",
    is_active: true,
    key: "portrait_create",
    label: "Portrait create",
    load_image_field_name: "image",
    load_image_node_id: null,
    lora_bindings: [],
    lora_clip_strength_field_name: null,
    lora_model_strength_field_name: "strength_model",
    lora_name_field_name: "lora_name",
    lora_node_id: null,
    mode: "create" as const,
    model_ids: ["anime_default"],
    negative_prompt_field_name: "prompt",
    negative_prompt_node_id: null,
    prompt_field_name: "text",
    prompt_node_id: "6",
    sort_order: 1,
    workflow_id: "workflow-1",
  };
}
