import { describe, expect, it } from "vitest";

import {
  getImageModelSelection,
  getImageWorkflow,
  imageModelOptionId,
  listActiveImageModelOptions,
} from "./models";

type ModelRow = {
  id: string;
  label: string;
  tag: string;
  ckpt_name: string;
  is_active: number;
  sort_order: number;
};

type WorkflowRow = {
  key: string;
  label: string;
  mode: "create" | "variation";
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

describe("RunningHub workflow/model catalog", () => {
  it("lists active workflow-model options and resolves an option id", async () => {
    const env = createEnv();

    await expect(listActiveImageModelOptions(env)).resolves.toEqual([
      {
        checkpoint_applies: true,
        ckpt_name: "animagine.safetensors",
        id: "wf1::anime_jp",
        label: "Anime JP · Base portrait",
        model_id: "anime_jp",
        tag: "anime,jp",
        workflow_key: "wf1",
        workflow_label: "Base portrait",
      },
    ]);

    const selection = await getImageModelSelection(env, imageModelOptionId("wf1", "anime_jp"));
    expect(selection).toMatchObject({
      model: { ckpt_name: "animagine.safetensors", id: "anime_jp" },
      workflow: {
        checkpoint_field_name: "ckpt_name",
        checkpoint_node_id: "4",
        key: "wf1",
      },
    });
  });

  it("falls back from a legacy bare model id to the first active binding", async () => {
    const selection = await getImageModelSelection(createEnv(), "anime_jp");

    expect(selection?.option_id).toBe("wf1::anime_jp");
    expect(selection?.workflow.checkpoint_field_name).toBe("ckpt_name");
  });

  it("loads workflow checkpoint field names from the workflow, not the model", async () => {
    const workflow = await getImageWorkflow(createEnv(), "wf1");

    expect(workflow?.checkpoint_field_name).toBe("ckpt_name");
    expect(workflow?.checkpoint_node_id).toBe("4");
  });
});

function createEnv(): Env {
  const models = new Map<string, ModelRow>([
    [
      "anime_jp",
      {
        ckpt_name: "animagine.safetensors",
        id: "anime_jp",
        is_active: 1,
        label: "Anime JP",
        sort_order: 10,
        tag: "anime,jp",
      },
    ],
  ]);
  const workflows = new Map<string, WorkflowRow>([
    [
      "wf1",
      {
        checkpoint_field_name: "ckpt_name",
        checkpoint_node_id: "4",
        is_active: 1,
        key: "wf1",
        label: "Base portrait",
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
    { is_active: 1, model_id: "anime_jp", sort_order: 1, workflow_key: "wf1" },
  ];

  function optionRows() {
    return bindings
      .filter((binding) => binding.is_active === 1)
      .map((binding) => {
        const workflow = workflows.get(binding.workflow_key)!;
        const model = models.get(binding.model_id)!;
        if (workflow.is_active !== 1 || workflow.mode !== "create" || model.is_active !== 1) return null;
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
    return {
      ...workflow,
      model_ckpt_name: model.ckpt_name,
      model_id: model.id,
      model_label: model.label,
      model_tag: model.tag,
    };
  }

  const executeAll = async (sql: string, values: unknown[]) => {
    if (sql.includes("w.key AS workflow_key")) return { results: optionRows() };
    if (sql.includes("SELECT wm.workflow_key")) {
      const [modelId] = values as [string];
      const binding = bindings.find((row) => row.model_id === modelId && row.is_active === 1);
      return { results: binding ? [{ workflow_key: binding.workflow_key }] : [] };
    }
    return { results: [] };
  };
  const executeFirst = async (sql: string, values: unknown[]) => {
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

  return { DB: { prepare } } as unknown as Env;
}
