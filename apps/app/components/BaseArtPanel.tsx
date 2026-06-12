import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PALETTE } from '@/constants/palette';

import { assistBaseArtPrompt, generateBaseArt, getBaseArtJob, mediaSource, saveImageAsset } from '@/api/companion-client';
import { useImageModels } from '@/hooks/use-image-models';
import { Button } from '@/components/Button';
import type { ImageModelOption, ImageStylePreset } from '@/api/types';

type Phase = 'idle' | 'generating' | 'preview' | 'error';
type ArtSource = 'generated' | 'upload';

type PendingBaseArtJob = {
  batchSize: string;
  createdAt: number;
  jobId: string;
  loraId: string | null;
  model: string;
  prompt: string;
  seed: string;
  sizePresetId: string | null;
  styleId: ImageStylePreset['id'] | null;
};

const CHOICE_PANEL_CLASS = 'gap-4 rounded-lg border border-white/10 bg-app-surface p-5 shadow-card';
const ACTIVE_CHOICE_CLASS = 'border-app-rose/70 bg-app-canvas/70';
const INACTIVE_CHOICE_CLASS = 'border-app-line bg-app-sunken/80';
const DARK_INPUT_CLASS = 'rounded-lg border border-app-line bg-app-sunken px-3 py-2 text-base text-app-text';
const PREVIEW_WIDTH_CLASS = 'w-full max-w-[360px]';

const PENDING_BASE_ART_JOB_STORAGE_KEY = 'xtbit.companionCreate.pendingBaseArtJob';
const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 288;

type BaseArtPanelProps = {
  onConfirm: (artKey: string, modelId?: string) => void;
  onUploadArt?: () => Promise<string | null>;
};

/**
 * spec-022 portrait_create — step 1 of companion creation: pick a model, enter a
 * prompt, generate a base portrait, preview, then confirm to carry it into the
 * character form. The model catalog is admin-managed; each model carries its
 * own style tag. Shared by the web and native create screens.
 */
export function BaseArtPanel({ onConfirm, onUploadArt }: BaseArtPanelProps) {
  const { models, stylePresets, isLoading: modelsLoading } = useImageModels();
  const [phase, setPhase] = useState<Phase>('idle');
  const [styleId, setStyleId] = useState<ImageStylePreset['id'] | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [loraId, setLoraId] = useState<string | null>(null);
  const [sizePresetId, setSizePresetId] = useState<string | null>(null);
  const [batchSize, setBatchSize] = useState('1');
  const [seed, setSeed] = useState('');
  const [prompt, setPrompt] = useState('');
  const [artKey, setArtKey] = useState<string | null>(null);
  const [artSource, setArtSource] = useState<ArtSource | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [isAssisting, setIsAssisting] = useState(false);
  const [isSavingAsset, setIsSavingAsset] = useState(false);
  const [assetSaved, setAssetSaved] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const activeRef = useRef(true);
  const pollingJobIdRef = useRef<string | null>(null);
  const isRestoringPendingJobRef = useRef(false);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const simpleStylePresets = useMemo(
    () => (stylePresets.length > 0 ? stylePresets : fallbackStylePresets(models)),
    [models, stylePresets],
  );

  useEffect(() => {
    if (model) return;
    const initialStyle = simpleStylePresets[0];
    if (initialStyle) {
      setStyleId(initialStyle.id);
      setModel(pickSimpleStyleModel(models, initialStyle.id)?.id ?? initialStyle.default_model);
    } else if (models.length > 0) {
      setModel(models[0].id);
    }
  }, [model, models, simpleStylePresets]);

  const selectedModel = models.find((item) => item.id === model) ?? null;
  const generationControls = selectedModel?.generation_controls ?? null;
  const loraOptions = selectedModel?.workflow_key === 'portrait_create_lora' ? selectedModel.loras ?? [] : [];
  const defaultSizePresetId = generationControls?.defaultSizePresetId ?? null;
  const defaultBatchSize = generationControls?.batchSizeDefault ?? 1;
  const advancedModelGroups = useMemo(() => groupAdvancedModels(models), [models]);
  const selectedPreset =
    generationControls?.sizePresets.find((preset) => preset.id === sizePresetId) ??
    generationControls?.sizePresets.find((preset) => preset.id === generationControls.defaultSizePresetId) ??
    generationControls?.sizePresets[0] ??
    null;

  useEffect(() => {
    if (isRestoringPendingJobRef.current) return;
    setLoraId(null);
    if (defaultSizePresetId) {
      setSizePresetId(defaultSizePresetId);
      setBatchSize(String(defaultBatchSize));
    } else {
      setSizePresetId(null);
      setBatchSize('1');
    }
    setSeed('');
  }, [model, defaultSizePresetId, defaultBatchSize]);

  useEffect(() => {
    const pendingJob = readPendingBaseArtJob();
    if (!pendingJob || pollingJobIdRef.current === pendingJob.jobId) return;
    isRestoringPendingJobRef.current = true;
    setBatchSize(pendingJob.batchSize);
    setErrorCode(null);
    setErrorDetail(null);
    setLoraId(pendingJob.loraId);
    setModel(pendingJob.model);
    setPrompt(pendingJob.prompt);
    setSeed(pendingJob.seed);
    setSizePresetId(pendingJob.sizePresetId);
    setStyleId(pendingJob.styleId);
    setArtKey(null);
    setArtSource(null);
    setAssetSaved(false);
    setPhase('generating');
    void pollJob(pendingJob.jobId);
  }, []);

  function selectStyle(preset: ImageStylePreset) {
    setStyleId(preset.id);
    setModel(pickSimpleStyleModel(models, preset.id)?.id ?? preset.default_model);
    setLoraId(null);
    setSeed('');
  }

  function selectAdvancedModel(modelId: string) {
    setStyleId(styleForModel(simpleStylePresets, modelId));
    setModel(modelId);
  }

  async function pollJob(jobId: string) {
    pollingJobIdRef.current = jobId;
    for (let i = 0; i < MAX_POLLS; i += 1) {
      if (!activeRef.current) return;
      const res = await getBaseArtJob(jobId);
      if (pollingJobIdRef.current !== jobId) return;
      if (res.status === 'succeeded' && res.art_key) {
        if (activeRef.current) {
          setArtKey(res.art_key);
          setArtSource('generated');
          setAssetSaved(false);
          setPhase('preview');
        }
        clearPendingBaseArtJob(jobId);
        pollingJobIdRef.current = null;
        isRestoringPendingJobRef.current = false;
        return;
      }
      if (res.status === 'failed' || res.status === 'cancelled') {
        if (activeRef.current) {
          setErrorCode(res.error_code ?? 'generation_failed');
          setErrorDetail(res.error_message ?? null);
          setPhase('error');
        }
        clearPendingBaseArtJob(jobId);
        pollingJobIdRef.current = null;
        isRestoringPendingJobRef.current = false;
        return;
      }
      await delay(POLL_INTERVAL_MS);
    }
    if (activeRef.current) {
      setErrorCode('timeout');
      setErrorDetail(null);
      setPhase('error');
    }
    clearPendingBaseArtJob(jobId);
    if (pollingJobIdRef.current === jobId) {
      pollingJobIdRef.current = null;
    }
    isRestoringPendingJobRef.current = false;
  }

  async function generate() {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setErrorCode('prompt_required');
      setErrorDetail(null);
      setPhase('error');
      return;
    }
    if (!model) {
      setErrorCode('model_required');
      setErrorDetail(null);
      setPhase('error');
      return;
    }
    setPhase('generating');
    setErrorCode(null);
    setErrorDetail(null);
    setArtKey(null);
    setArtSource(null);
    setAssetSaved(false);
    isRestoringPendingJobRef.current = false;
    let startedJobId: string | null = null;
    try {
      const seedText = seed.trim();
      const seedValue = seedText ? Number(seedText) : null;
      const batchValue = batchSize.trim() ? Number(batchSize.trim()) : null;
      const normalizedBatchSize = batchValue !== null && Number.isFinite(batchValue) ? Math.trunc(batchValue) : null;
      const normalizedSeed = seedValue !== null && Number.isFinite(seedValue) ? Math.trunc(seedValue) : null;
      const { job_id } = await generateBaseArt({
        batch_size:
          normalizedBatchSize !== null && normalizedBatchSize !== defaultBatchSize ? normalizedBatchSize : undefined,
        lora_id: loraId || undefined,
        model,
        prompt: trimmed,
        seed: seedText ? normalizedSeed : undefined,
        size_preset: sizePresetId ?? undefined,
        source: 'text',
      });
      startedJobId = job_id;
      writePendingBaseArtJob({
        batchSize,
        createdAt: Date.now(),
        jobId: job_id,
        loraId,
        model,
        prompt: trimmed,
        seed,
        sizePresetId,
        styleId,
      });
      await pollJob(job_id);
    } catch {
      if (startedJobId && pollingJobIdRef.current === startedJobId) {
        pollingJobIdRef.current = null;
      }
      isRestoringPendingJobRef.current = false;
      if (activeRef.current) {
        setErrorCode('request_failed');
        setErrorDetail(null);
        setPhase('error');
      }
    }
  }

  async function uploadLocalArt() {
    if (!onUploadArt) return;
    setErrorCode(null);
    setErrorDetail(null);
    setIsUploading(true);
    try {
      const key = await onUploadArt();
      if (key && activeRef.current) {
        setArtKey(key);
        setArtSource('upload');
        setAssetSaved(false);
        setPhase('preview');
      }
    } catch {
      if (activeRef.current) {
        setErrorCode('upload_failed');
        setPhase('error');
      }
    } finally {
      if (activeRef.current) {
        setIsUploading(false);
      }
    }
  }

  async function assistPrompt() {
    const request = assistantInput.trim();
    if (!request) {
      setAssistantError('Describe what you want first.');
      return;
    }
    setIsAssisting(true);
    setAssistantError(null);
    try {
      const result = await assistBaseArtPrompt({ request, model_label: selectedModel?.label });
      if (activeRef.current) {
        setPrompt(result.prompt);
      }
    } catch {
      if (activeRef.current) {
        setAssistantError('Could not generate a prompt.');
      }
    } finally {
      if (activeRef.current) {
        setIsAssisting(false);
      }
    }
  }

  async function saveAsset() {
    if (!artKey || artSource !== 'generated') return;
    setIsSavingAsset(true);
    try {
      await saveImageAsset({
        art_key: artKey,
        model_id: model ?? undefined,
        prompt: prompt.trim() || undefined,
        source: 'generated',
      });
      if (activeRef.current) {
        setAssetSaved(true);
      }
    } catch {
      if (activeRef.current) {
        setErrorCode('asset_save_failed');
        setErrorDetail(null);
        setPhase('error');
      }
    } finally {
      if (activeRef.current) {
        setIsSavingAsset(false);
      }
    }
  }

  const previewSource = artKey ? mediaSource(artKey) : null;
  const isGenerating = phase === 'generating';
  const isBusy = isGenerating || isUploading;

  return (
    <View className="mx-auto w-full max-w-5xl gap-5 px-4 py-6">
      <View className="gap-5 web:grid web:grid-cols-[minmax(0,1fr)_280px]">
        <View className={CHOICE_PANEL_CLASS}>
          <Text className="text-lg font-semibold text-app-text">1. Choose a style</Text>
          <View className="flex-row flex-wrap gap-2">
            {modelsLoading ? <Text className="text-sm text-app-muted">Loading models…</Text> : null}
            {!modelsLoading && models.length === 0 ? (
              <Text className="text-sm text-app-danger">No models configured.</Text>
            ) : null}
            {simpleStylePresets.map((preset) => (
              <Pressable
                key={preset.id}
                accessibilityRole="button"
                disabled={isBusy}
                onPress={() => selectStyle(preset)}
                className={`rounded-full border px-3 py-2 ${
                  styleId === preset.id ? ACTIVE_CHOICE_CLASS : INACTIVE_CHOICE_CLASS
                }`}
              >
                <Text className={`text-sm font-semibold ${styleId === preset.id ? 'text-app-rose-deep' : 'text-app-muted'}`}>
                  {preset.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {generationControls ? (
            <>
              <Text className="mt-2 text-lg font-semibold text-app-text">Image size</Text>
              <View className="flex-row flex-wrap gap-2">
                {generationControls.sizePresets.map((preset) => (
                  <Pressable
                    key={preset.id}
                    accessibilityRole="button"
                    disabled={isBusy}
                    onPress={() => setSizePresetId(preset.id)}
                    className={`rounded-full border px-3 py-2 ${
                      (sizePresetId ?? generationControls.defaultSizePresetId) === preset.id
                        ? ACTIVE_CHOICE_CLASS
                        : INACTIVE_CHOICE_CLASS
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        (sizePresetId ?? generationControls.defaultSizePresetId) === preset.id ? 'text-app-rose-deep' : 'text-app-muted'
                      }`}
                    >
                      {preset.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <View className="mt-2 gap-3 border-t border-app-line pt-4">
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={() => setAdvancedOpen((value) => !value)}
            >
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-sm font-semibold text-app-text">Advanced options</Text>
                <Text className="text-sm font-semibold text-app-primary">{advancedOpen ? 'Hide' : 'Show'}</Text>
              </View>
            </Pressable>

            {advancedOpen ? (
              <View className="gap-4">
                <View className="gap-2">
                  <Text className="text-xs font-semibold text-app-muted">Model and workflow</Text>
                  {advancedModelGroups.map((group) => (
                    <View key={group.id} className="gap-2">
                      <Text className="text-xs font-semibold text-app-muted-soft">{group.label}</Text>
                      <View className="flex-row flex-wrap gap-2">
                        {group.models.map((item) => (
                          <Pressable
                            key={item.id}
                            accessibilityRole="button"
                            disabled={isBusy}
                            onPress={() => selectAdvancedModel(item.id)}
                            className={`rounded-full border px-3 py-2 ${
                              model === item.id ? ACTIVE_CHOICE_CLASS : INACTIVE_CHOICE_CLASS
                            }`}
                          >
                            <Text className={`text-sm font-semibold ${model === item.id ? 'text-app-rose-deep' : 'text-app-muted'}`}>
                              {item.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>

                {loraOptions.length > 0 ? (
                  <View className="gap-2">
                    <Text className="text-xs font-semibold text-app-muted">LoRA</Text>
                    <View className="flex-row flex-wrap gap-2">
                      <Pressable
                        accessibilityRole="button"
                        disabled={isBusy}
                        onPress={() => setLoraId(null)}
                        className={`rounded-full border px-3 py-2 ${
                          !loraId ? ACTIVE_CHOICE_CLASS : INACTIVE_CHOICE_CLASS
                        }`}
                      >
                        <Text className={`text-sm font-semibold ${!loraId ? 'text-app-rose-deep' : 'text-app-muted'}`}>No LoRA</Text>
                      </Pressable>
                      {loraOptions.map((item) => (
                        <Pressable
                          key={item.id}
                          accessibilityRole="button"
                          disabled={isBusy}
                          onPress={() => setLoraId(item.id)}
                          className={`rounded-full border px-3 py-2 ${
                            loraId === item.id ? ACTIVE_CHOICE_CLASS : INACTIVE_CHOICE_CLASS
                          }`}
                        >
                          <Text className={`text-sm font-semibold ${loraId === item.id ? 'text-app-rose-deep' : 'text-app-muted'}`}>
                            {item.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}

                {generationControls ? (
                  <View className="gap-3 web:flex-row">
                    <View className="web:flex-1">
                      <Text className="mb-1 text-xs font-semibold text-app-muted">Batch size</Text>
                      <TextInput
                        className={DARK_INPUT_CLASS}
                        editable={!isBusy}
                        keyboardType="number-pad"
                        onChangeText={setBatchSize}
                        placeholder={`${generationControls.batchSizeDefault}`}
                        placeholderTextColor={PALETTE.muted}
                        value={batchSize}
                      />
                    </View>
                    <View className="web:flex-1">
                      <Text className="mb-1 text-xs font-semibold text-app-muted">Seed</Text>
                      <TextInput
                        className={DARK_INPUT_CLASS}
                        editable={!isBusy}
                        keyboardType="number-pad"
                        onChangeText={setSeed}
                        placeholder="Random"
                        placeholderTextColor={PALETTE.muted}
                        value={seed}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          <Text className="mt-2 text-lg font-semibold text-app-text">2. Describe the portrait</Text>
          <TextInput
            className="min-h-24 rounded-lg border border-app-line bg-app-sunken px-3 py-3 text-base text-app-text"
            editable={!isBusy}
            multiline
            onChangeText={setPrompt}
            placeholder="A gentle young woman with long dark hair, soft smile, casual sweater..."
            placeholderTextColor={PALETTE.muted}
            textAlignVertical="top"
            value={prompt}
          />

          {phase === 'error' ? (
            <View className="gap-1">
              <Text className="text-sm font-semibold text-app-danger">{errorLabel(errorCode)}</Text>
              {errorDetail ? (
                <Text className="text-xs leading-4 text-app-muted">Details: {errorDetail}</Text>
              ) : null}
            </View>
          ) : null}

          <View className="gap-3 web:flex-row">
            <View className="web:flex-1">
              <Button
                disabled={!model || isUploading}
                isLoading={isGenerating}
                label={artSource === 'generated' ? 'Generate again' : 'Generate portrait'}
                onPress={() => void generate()}
              />
            </View>
            {onUploadArt ? (
              <View className="web:flex-1">
                <Button
                  disabled={isGenerating}
                  isLoading={isUploading}
                  label="Upload local image"
                  onPress={() => void uploadLocalArt()}
                  variant="secondary"
                />
              </View>
            ) : null}
          </View>
        </View>

        <View className="gap-3 rounded-lg border border-white/10 bg-app-surface p-4 shadow-card">
          <Text className="text-base font-semibold text-app-text">Not sure what kind of portrait you want? Ask me.</Text>
          <TextInput
            className="min-h-24 rounded-lg border border-app-line bg-app-sunken px-3 py-3 text-sm text-app-text"
            editable={!isAssisting}
            multiline
            onChangeText={setAssistantInput}
            placeholder="Tell me the vibe, personality, outfit, or scene..."
            placeholderTextColor={PALETTE.muted}
            textAlignVertical="top"
            value={assistantInput}
          />
          {assistantError ? <Text className="text-sm font-semibold text-app-danger">{assistantError}</Text> : null}
          <Button
            isLoading={isAssisting}
            label="Generate prompt"
            onPress={() => void assistPrompt()}
            variant="secondary"
          />
        </View>
      </View>

      {isBusy ? (
        <View className="items-center gap-3 rounded-lg border border-white/10 bg-app-surface p-8 shadow-card">
          <ActivityIndicator color={PALETTE.rose} />
          <Text className="text-sm text-app-muted">
            {isUploading ? 'Uploading portrait...' : 'Generating portrait... this can take up to a minute.'}
          </Text>
        </View>
      ) : null}

      {phase === 'preview' && previewSource ? (
        <View className="items-center gap-4 rounded-lg border border-white/10 bg-app-surface p-5 shadow-card">
          <Text className="text-lg font-semibold text-app-text">3. Preview</Text>
          <View className={`${PREVIEW_WIDTH_CLASS} items-center overflow-hidden rounded-lg border border-app-line bg-app-primarySoft`}>
            <Image
              accessibilityLabel="Generated portrait"
              resizeMode="contain"
              source={previewSource}
              style={[styles.preview, selectedPreset ? { aspectRatio: selectedPreset.width / selectedPreset.height } : null]}
            />
          </View>
          <View className={`${PREVIEW_WIDTH_CLASS} gap-3`}>
            <Button label="Use this portrait" onPress={() => artKey && onConfirm(artKey, artSource === 'generated' ? model ?? undefined : undefined)} />
            {artSource === 'generated' ? (
              <>
                <Button
                  disabled={assetSaved}
                  isLoading={isSavingAsset}
                  label={assetSaved ? 'Saved to My assets' : 'Save to My assets'}
                  onPress={() => void saveAsset()}
                  variant="secondary"
                />
                <Button label="Regenerate" onPress={() => void generate()} variant="secondary" />
              </>
            ) : (
              <Button label="Replace image" onPress={() => void uploadLocalArt()} variant="secondary" />
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function errorLabel(code: string | null): string {
  switch (code) {
    case 'prompt_required':
      return 'Enter a description first.';
    case 'model_required':
      return 'Pick a model first.';
    case 'timeout':
      return 'Generation timed out. Please try again.';
    case 'request_failed':
      return 'Could not start generation. Please try again.';
    case 'upload_failed':
      return 'Portrait upload failed. Please try again.';
    case 'asset_save_failed':
      return 'Could not save this image to your assets.';
    default:
      return 'Generation failed. Please try again.';
  }
}

type AdvancedModelGroup = {
  id: string;
  label: string;
  models: ImageModelOption[];
};

function pickSimpleStyleModel(
  models: ImageModelOption[],
  style: ImageStylePreset['id'],
): ImageModelOption | null {
  const candidates = models.filter(
    (item) => item.workflow_key === 'portrait_create' && optionMatchesStyle(item, style),
  );
  const ckptOnly = candidates.filter((item) => (item.loras?.length ?? 0) === 0);
  const pool = ckptOnly.length > 0 ? ckptOnly : candidates;
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

function groupAdvancedModels(models: ImageModelOption[]): AdvancedModelGroup[] {
  const ckptOnly = models.filter((item) => item.workflow_key === 'portrait_create');
  const withLora = models.filter((item) => item.workflow_key === 'portrait_create_lora');
  const other = models.filter(
    (item) => item.workflow_key !== 'portrait_create' && item.workflow_key !== 'portrait_create_lora',
  );
  return [
    { id: 'portrait_create', label: 'Checkpoint only', models: ckptOnly },
    { id: 'portrait_create_lora', label: 'Checkpoint + LoRA', models: withLora },
    { id: 'other', label: 'Other workflows', models: other },
  ].filter((group) => group.models.length > 0);
}

function fallbackStylePresets(models: ImageModelOption[]): ImageStylePreset[] {
  return (['realistic', 'anime'] as const).flatMap((style) => {
    const candidates = models.filter((item) => optionMatchesStyle(item, style));
    const preferred =
      candidates.find((item) => item.workflow_key === 'portrait_create' && (item.loras?.length ?? 0) === 0) ??
      candidates.find((item) => item.workflow_key === 'portrait_create') ??
      candidates[0];
    return preferred
      ? [{ default_model: preferred.id, id: style, label: style === 'realistic' ? 'Realistic' : 'Anime' }]
      : [];
  });
}

function optionMatchesStyle(model: ImageModelOption, style: ImageStylePreset['id']): boolean {
  return [model.tag, model.label, model.model_id ?? ''].join(' ').toLowerCase().includes(style);
}

function styleForModel(
  presets: ImageStylePreset[],
  modelId: string,
): ImageStylePreset['id'] | null {
  return presets.find((preset) => preset.default_model === modelId)?.id ?? null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readPendingBaseArtJob(): PendingBaseArtJob | null {
  const storage = getBrowserStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PENDING_BASE_ART_JOB_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingBaseArtJob>;
    if (!value.jobId || !value.model || typeof value.prompt !== 'string') {
      storage.removeItem(PENDING_BASE_ART_JOB_STORAGE_KEY);
      return null;
    }
    if (typeof value.createdAt === 'number' && Date.now() - value.createdAt > 24 * 60 * 60 * 1000) {
      storage.removeItem(PENDING_BASE_ART_JOB_STORAGE_KEY);
      return null;
    }
    return {
      batchSize: typeof value.batchSize === 'string' ? value.batchSize : '1',
      createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
      jobId: value.jobId,
      loraId: typeof value.loraId === 'string' ? value.loraId : null,
      model: value.model,
      prompt: value.prompt,
      seed: typeof value.seed === 'string' ? value.seed : '',
      sizePresetId: typeof value.sizePresetId === 'string' ? value.sizePresetId : null,
      styleId: value.styleId === 'anime' || value.styleId === 'realistic' ? value.styleId : null,
    };
  } catch {
    storage.removeItem(PENDING_BASE_ART_JOB_STORAGE_KEY);
    return null;
  }
}

function writePendingBaseArtJob(job: PendingBaseArtJob): void {
  const storage = getBrowserStorage();
  if (!storage) return;
  try {
    storage.setItem(PENDING_BASE_ART_JOB_STORAGE_KEY, JSON.stringify(job));
  } catch {
    // Storage can be unavailable in private browsing or constrained webviews.
  }
}

function clearPendingBaseArtJob(jobId?: string): void {
  const storage = getBrowserStorage();
  if (!storage) return;
  try {
    if (jobId) {
      const current = readPendingBaseArtJob();
      if (current && current.jobId !== jobId) return;
    }
    storage.removeItem(PENDING_BASE_ART_JOB_STORAGE_KEY);
  } catch {
    storage.removeItem(PENDING_BASE_ART_JOB_STORAGE_KEY);
  }
}

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  preview: {
    aspectRatio: 0.7,
    height: 180,
    maxHeight: 180,
    width: '100%',
  },
});
