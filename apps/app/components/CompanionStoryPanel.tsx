import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { PALETTE } from '@/constants/palette';

import {
  assistStoryArc,
  completeStoryBeat,
  createStoryArc,
  createStoryArcFromTemplate,
  reopenStoryBeat,
} from '@/api/companion-client';
import type { Scene, StoryArc, StoryArcTemplate, StoryBeat, StoryBeatDraft } from '@/api/types';
import { Button } from '@/components/Button';
import { useCompanionStoryArcs, useStoryArcTemplates } from '@/hooks/use-companions';
import { useScenes } from '@/hooks/use-scenes';

type CompanionStoryPanelProps = {
  canEdit?: boolean;
  companionId: string;
  compact?: boolean;
  tone?: PanelTone;
  showEditor?: boolean;
  onChanged?: () => void | Promise<void>;
};

type PanelTone = 'default' | 'dark';

const STAGES = [
  'first_contact',
  'familiar',
  'trusted',
  'close_friend',
  'romantic_tension',
  'dating',
  'committed',
] as const;

export function CompanionStoryPanel({
  canEdit = false,
  companionId,
  compact = false,
  onChanged,
  showEditor = true,
  tone = 'default',
}: CompanionStoryPanelProps) {
  const arcs = useCompanionStoryArcs(companionId);
  const templates = useStoryArcTemplates();
  const scenes = useScenes();
  const [mode, setMode] = useState<'packs' | 'write' | 'ai'>('packs');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [draftSource, setDraftSource] = useState<'user_written' | 'ai_assisted'>('user_written');
  const [title, setTitle] = useState('Opening arc');
  const [outline, setOutline] = useState('');
  const [beats, setBeats] = useState<StoryBeatDraft[]>(() => defaultDraftBeats());
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const storyArcs = useMemo(() => arcs.data?.arcs ?? [], [arcs.data?.arcs]);
  const storyTemplates = useMemo(() => templates.data?.templates ?? [], [templates.data?.templates]);
  const sceneOptions = useMemo(
    () => scenes.data?.scenes.filter((scene) => scene.unlocked) ?? [],
    [scenes.data?.scenes],
  );
  const activeBeat = useMemo(() => firstActionableBeat(storyArcs), [storyArcs]);
  const hasStory = storyArcs.some((arc) => arc.beats.length > 0);
  const isDark = tone === 'dark';
  const titleClass = isDark ? 'text-white' : 'text-app-text';
  const mutedClass = isDark ? 'text-rose-50/65' : 'text-app-muted';
  const insetClass = isDark ? 'border-white/10 bg-app-sunken' : 'border-app-line bg-app-bg web:bg-app-solid-sunken';

  async function refreshAll() {
    await arcs.refetch();
    await onChanged?.();
  }

  async function saveFromTemplate(templateId: string) {
    setIsSaving(true);
    setMessage(null);
    try {
      await createStoryArcFromTemplate(companionId, templateId);
      setSelectedTemplateId(templateId);
      setMessage('Story pack added.');
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Story pack could not be added.');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveManualArc(nextSource: 'user_written' | 'ai_assisted' = 'user_written') {
    setIsSaving(true);
    setMessage(null);
    try {
      await createStoryArc(companionId, {
        beats,
        outline: outline.trim() || undefined,
        source_type: nextSource,
        template_id: selectedTemplateId ?? undefined,
        title: title.trim() || 'Opening arc',
      });
      setMessage('Story arc saved.');
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Story arc could not be saved.');
    } finally {
      setIsSaving(false);
    }
  }

  async function draftWithAi() {
    setIsSaving(true);
    setMessage(null);
    try {
      const response = await assistStoryArc(companionId, {
        beat_count: Math.min(5, Math.max(3, beats.length || 4)),
        outline: outline.trim() || undefined,
        template_id: selectedTemplateId ?? undefined,
      });
      setTitle(response.draft.arc_title);
      setBeats(response.draft.beats);
      setDraftSource('ai_assisted');
      setMode('write');
      setMessage('AI draft ready. Review it before saving.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI draft is unavailable.');
    } finally {
      setIsSaving(false);
    }
  }

  async function markDone(beat: StoryBeat) {
    setIsSaving(true);
    setMessage(null);
    try {
      await completeStoryBeat(companionId, beat.id);
      setMessage('Story beat marked done.');
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Story beat could not be completed.');
    } finally {
      setIsSaving(false);
    }
  }

  async function reopen(beat: StoryBeat) {
    setIsSaving(true);
    setMessage(null);
    try {
      await reopenStoryBeat(companionId, beat.id);
      setMessage('Story beat reopened.');
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Story beat could not be reopened.');
    } finally {
      setIsSaving(false);
    }
  }

  if (arcs.isLoading || templates.isLoading || scenes.isLoading) {
    return (
      <Panel compact={compact} tone={tone}>
        <View className="flex-row items-center gap-2">
          <ActivityIndicator color={PALETTE.roseDeep} />
          <Text className={`text-sm ${mutedClass}`}>Loading story...</Text>
        </View>
      </Panel>
    );
  }

  return (
    <Panel compact={compact} tone={tone}>
      <View className="gap-2">
        <Text className={`text-lg font-semibold ${titleClass}`}>Story</Text>
        <Text className={`text-sm leading-5 ${mutedClass}`}>
          {activeBeat ? activeBeat.objective : hasStory ? 'All current story beats are complete.' : 'Set a clear next step for this companion.'}
        </Text>
      </View>

      {activeBeat ? (
        <View className={`gap-3 rounded-lg border p-4 ${insetClass}`}>
          <View className="flex-row flex-wrap items-center gap-2">
            <Pill label={activeBeat.status === 'waiting_stage' ? `Reach ${prettyStage(activeBeat.stage_gate)}` : `Beat ${activeBeat.beat_order}`} panelTone={tone} />
            <Pill label={activeBeat.completion_mode === 'auto' ? 'Legacy auto' : 'Manual'} panelTone={tone} tone="muted" />
          </View>
          <View>
            <Text className={`text-base font-semibold ${titleClass}`}>{activeBeat.title}</Text>
            <Text className={`mt-1 text-sm leading-5 ${mutedClass}`}>{activeBeat.opener}</Text>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {activeBeat.status === 'completed' ? (
              <Button isLoading={isSaving} label="Reopen" onPress={() => void reopen(activeBeat)} variant="secondary" />
            ) : activeBeat.status === 'active' ? (
              <Button isLoading={isSaving} label="Mark as done" onPress={() => void markDone(activeBeat)} />
            ) : null}
          </View>
        </View>
      ) : null}

      {canEdit && showEditor ? (
        <View className="gap-4">
          <View className="flex-row flex-wrap gap-2">
            <ModeButton active={mode === 'packs'} label="Story packs" onPress={() => setMode('packs')} tone={tone} />
            <ModeButton
              active={mode === 'write'}
              label="Write"
              onPress={() => {
                setDraftSource('user_written');
                setMode('write');
              }}
              tone={tone}
            />
            <ModeButton active={mode === 'ai'} label="AI draft" onPress={() => setMode('ai')} tone={tone} />
          </View>

          {mode === 'packs' ? (
            <View className="gap-3">
              {storyTemplates.map((template) => (
                <StoryPackRow
                  key={template.id}
                  disabled={isSaving}
                  onPress={() => void saveFromTemplate(template.id)}
                  tone={tone}
                  template={template}
                />
              ))}
            </View>
          ) : null}

          {mode === 'write' ? (
            <View className="gap-4">
              <Field label="Arc title" onChangeText={setTitle} tone={tone} value={title} />
              <Field
                label="Outline"
                multiline
                onChangeText={setOutline}
                placeholder="A guarded friend slowly learns they can ask for help."
                tone={tone}
                value={outline}
              />
              {beats.map((beat, index) => (
                <DraftBeatEditor
                  key={index}
                  beat={beat}
                  index={index}
                  scenes={sceneOptions}
                  tone={tone}
                  onChange={(next) => {
                    setBeats((current) => current.map((item, itemIndex) => itemIndex === index ? next : item));
                  }}
                />
              ))}
              <Button disabled={isSaving} isLoading={isSaving} label="Save story arc" onPress={() => void saveManualArc(draftSource)} />
            </View>
          ) : null}

          {mode === 'ai' ? (
            <View className="gap-4">
              <Field
                label="Outline"
                multiline
                onChangeText={setOutline}
                placeholder="One sentence is enough. Example: a stranger keeps appearing at the wrong moments."
                tone={tone}
                value={outline}
              />
              <View className="gap-3">
                <Text className={`text-sm font-semibold ${titleClass}`}>Optional pack direction</Text>
                <View className="flex-row flex-wrap gap-2">
                  {storyTemplates.map((template) => (
                    <ModeButton
                      key={template.id}
                      active={selectedTemplateId === template.id}
                      label={template.title}
                      onPress={() => setSelectedTemplateId(selectedTemplateId === template.id ? null : template.id)}
                      tone={tone}
                    />
                  ))}
                </View>
              </View>
              <Button disabled={isSaving} isLoading={isSaving} label="Draft with AI" onPress={() => void draftWithAi()} />
            </View>
          ) : null}
        </View>
      ) : !hasStory && showEditor ? (
        <Text className={`text-sm leading-5 ${mutedClass}`}>This companion has no shared story arc yet.</Text>
      ) : null}

      {storyArcs.length > 0 && showEditor ? (
        <View className={`gap-2 border-t pt-4 ${isDark ? 'border-white/10' : 'border-app-line'}`}>
          <Text className={`text-sm font-semibold ${titleClass}`}>Arc list</Text>
          {storyArcs.map((arc) => (
            <View key={arc.id} className={`rounded-lg border p-3 ${insetClass}`}>
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className={`text-sm font-semibold ${titleClass}`}>{arc.title}</Text>
                <Pill label={arc.source_type.replace('_', ' ')} panelTone={tone} tone="muted" />
                {arc.shared_with_public ? <Pill label="Shared" panelTone={tone} /> : null}
              </View>
              <Text className={`mt-1 text-xs ${mutedClass}`}>{arc.beats.length} beats</Text>
            </View>
          ))}
        </View>
      ) : null}

      {message ? <Text className="text-sm font-semibold text-app-primary">{message}</Text> : null}
    </Panel>
  );
}

function Panel({ children, compact, tone }: { children: ReactNode; compact?: boolean; tone: PanelTone }) {
  return (
    <View className={`gap-4 rounded-lg border ${compact ? 'p-4' : 'p-5'} ${
      tone === 'dark' ? 'border-white/10 bg-app-surface' : 'border-app-line bg-app-card web:bg-app-solid-surface'
    }`}>
      {children}
    </View>
  );
}

function StoryPackRow({
  disabled,
  onPress,
  template,
  tone,
}: {
  disabled?: boolean;
  onPress: () => void;
  template: StoryArcTemplate;
  tone: PanelTone;
}) {
  const isDark = tone === 'dark';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`rounded-lg border p-4 ${isDark ? 'border-white/10 bg-app-sunken' : 'border-app-line bg-app-bg web:bg-app-solid-sunken'} ${disabled ? 'opacity-50' : 'opacity-100'}`}
    >
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className={`text-base font-semibold ${isDark ? 'text-white' : 'text-app-text'}`}>{template.title}</Text>
        {template.relationship_role ? <Pill label={template.relationship_role} panelTone={tone} tone="muted" /> : null}
      </View>
      <Text className={`mt-1 text-sm leading-5 ${isDark ? 'text-rose-50/65' : 'text-app-muted'}`}>{template.description}</Text>
      <Text className="mt-2 text-xs font-semibold text-app-primary">Use this pack</Text>
    </Pressable>
  );
}

function DraftBeatEditor({
  beat,
  index,
  onChange,
  scenes,
  tone,
}: {
  beat: StoryBeatDraft;
  index: number;
  onChange: (beat: StoryBeatDraft) => void;
  scenes: Scene[];
  tone: PanelTone;
}) {
  const isDark = tone === 'dark';
  return (
    <View className={`gap-3 rounded-lg border p-3 ${isDark ? 'border-white/10 bg-app-sunken' : 'border-app-line bg-app-bg web:bg-app-solid-sunken'}`}>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-app-text'}`}>Beat {index + 1}</Text>
        <View className="flex-row flex-wrap gap-2">
          {STAGES.map((stage) => (
            <ModeButton
              key={stage}
              active={beat.stage_gate === stage}
              label={prettyStage(stage)}
              onPress={() => onChange({ ...beat, stage_gate: stage })}
              small
              tone={tone}
            />
          ))}
        </View>
      </View>
      <Field label="Title" onChangeText={(title) => onChange({ ...beat, title })} tone={tone} value={beat.title} />
      <Field label="Opener" multiline onChangeText={(opener) => onChange({ ...beat, opener })} tone={tone} value={beat.opener} />
      <Field label="Objective" multiline onChangeText={(objective) => onChange({ ...beat, objective })} tone={tone} value={beat.objective} />
      {scenes.length ? (
        <View className="gap-2">
          <Text className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-app-text'}`}>Scene</Text>
          <View className="flex-row flex-wrap gap-2">
            <ModeButton
              active={!beat.scene_id}
              label="Any scene"
              onPress={() => onChange({ ...beat, scene_id: null })}
              small
              tone={tone}
            />
            {scenes.map((scene) => (
              <ModeButton
                key={scene.id}
                active={beat.scene_id === scene.id}
                label={scene.name}
                onPress={() => onChange({ ...beat, scene_id: scene.id, scene_hint: scene.name })}
                small
                tone={tone}
              />
            ))}
          </View>
        </View>
      ) : (
        <Field
          label="Scene hint"
          onChangeText={(scene_hint) => onChange({ ...beat, scene_hint })}
          placeholder="Cafe, park, workplace..."
          tone={tone}
          value={beat.scene_hint ?? ''}
        />
      )}
    </View>
  );
}

function Field({
  label,
  multiline,
  onChangeText,
  placeholder,
  tone,
  value,
}: {
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder?: string;
  tone: PanelTone;
  value: string;
}) {
  const isDark = tone === 'dark';
  return (
    <View>
      <Text className={`mb-2 text-sm font-semibold ${isDark ? 'text-white' : 'text-app-text'}`}>{label}</Text>
      <TextInput
        className={`rounded-lg border px-3 py-3 text-base ${
          isDark ? 'border-white/10 bg-app-sunken text-app-ink' : 'border-app-line bg-app-sunken text-app-text web:bg-app-solid-sunken web:text-app-ink'
        } ${
          multiline ? 'min-h-20 text-top' : ''
        }`}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={PALETTE.muted}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
      />
    </View>
  );
}

function ModeButton({
  active,
  label,
  onPress,
  small,
  tone,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  small?: boolean;
  tone: PanelTone;
}) {
  const isDark = tone === 'dark';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`${small ? 'min-h-8 px-2 py-1' : 'min-h-10 px-3 py-2'} rounded-lg border ${
        active
          ? 'border-app-rose/70 bg-app-canvas/70'
          : isDark
            ? 'border-white/10 bg-app-sunken'
            : 'border-app-line bg-app-card'
      }`}
    >
      <Text className={`${small ? 'text-xs' : 'text-sm'} font-semibold ${active ? 'text-app-rose-deep' : isDark ? 'text-rose-50/65' : 'text-app-muted'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function Pill({ label, panelTone, tone = 'primary' }: { label: string; panelTone: PanelTone; tone?: 'primary' | 'muted' }) {
  const isDark = panelTone === 'dark';
  return (
    <View className={`rounded-full px-2.5 py-1 ${tone === 'primary' ? 'bg-app-primarySoft' : 'bg-app-sunken'}`}>
      <Text className={`text-xs font-semibold ${tone === 'primary' ? 'text-app-primary' : isDark ? 'text-rose-50/65' : 'text-app-muted'}`}>{label}</Text>
    </View>
  );
}

function firstActionableBeat(arcs: StoryArc[]): StoryBeat | null {
  for (const arc of arcs) {
    const active = arc.beats.find((beat) => beat.status === 'active' || beat.status === 'waiting_stage');
    if (active) return active;
  }
  for (const arc of arcs) {
    const completed = [...arc.beats].reverse().find((beat) => beat.status === 'completed');
    if (completed) return completed;
  }
  return null;
}

function defaultDraftBeats(): StoryBeatDraft[] {
  return [
    {
      objective: 'Let them decide whether to share a small truth.',
      opener: 'They hesitate like there is something ordinary they are not sure they can say.',
      scene_hint: '',
      scene_id: null,
      stage_gate: 'first_contact',
      title: 'The First Thread',
    },
    {
      objective: 'Show consistency without turning it into a performance.',
      opener: 'They notice you remembered a detail they expected you to forget.',
      scene_hint: '',
      scene_id: null,
      stage_gate: 'familiar',
      title: 'Showing Up',
    },
    {
      objective: 'Make room for a vulnerable choice.',
      opener: 'Their guard drops for a second, and this time they do not rebuild it immediately.',
      scene_hint: '',
      scene_id: null,
      stage_gate: 'trusted',
      title: 'A Quiet Choice',
    },
  ];
}

function prettyStage(stage: string): string {
  return stage.replace(/_/g, ' ');
}
