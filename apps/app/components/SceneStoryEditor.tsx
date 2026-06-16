import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { SceneStory, SceneStoryInput, SceneStoryTaskInput } from '@/api/types';
import { Button } from '@/components/Button';

type SceneStoryEditorProps = {
  initialStory?: SceneStory | null;
  isSaving?: boolean;
  onCancel: () => void;
  onSave: (input: SceneStoryInput) => void;
};

const emptyTask = (): SceneStoryTaskInput => ({
  ai_guidance: '',
  completion_hint: '',
  objective: '',
  title: '',
});

export function SceneStoryEditor({
  initialStory = null,
  isSaving = false,
  onCancel,
  onSave,
}: SceneStoryEditorProps) {
  const [title, setTitle] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [tasks, setTasks] = useState<SceneStoryTaskInput[]>(() => [emptyTask()]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(initialStory?.title ?? '');
    setSynopsis(initialStory?.synopsis ?? '');
    setTasks(
      initialStory?.tasks?.length
        ? initialStory.tasks.map((task) => ({
            ai_guidance: task.ai_guidance,
            completion_hint: task.completion_hint ?? '',
            objective: task.objective,
            title: task.title,
          }))
        : [emptyTask()],
    );
    setError(null);
  }, [initialStory]);

  function updateTask(index: number, patch: Partial<SceneStoryTaskInput>) {
    setTasks((current) => current.map((task, taskIndex) => (
      taskIndex === index ? { ...task, ...patch } : task
    )));
  }

  function save() {
    const normalizedTasks = tasks
      .map((task) => ({
        ai_guidance: task.ai_guidance.trim(),
        completion_hint: task.completion_hint?.trim() || null,
        objective: task.objective.trim(),
        title: task.title.trim(),
      }))
      .filter((task) => task.title && task.objective && task.ai_guidance);
    if (!title.trim()) {
      setError('Add a story title.');
      return;
    }
    if (normalizedTasks.length === 0) {
      setError('Add at least one task with guidance.');
      return;
    }
    setError(null);
    onSave({
      synopsis: synopsis.trim() || null,
      tasks: normalizedTasks,
      title: title.trim(),
    });
  }

  return (
    <View className="gap-5">
      <View className="gap-2">
        <Text className="text-sm font-semibold text-app-text web:text-rose-50/75">Title</Text>
        <TextInput
          onChangeText={setTitle}
          placeholder="A quiet mystery at closing time"
          placeholderTextColor="#8F7A93"
          value={title}
          className="min-h-11 rounded-xl border border-app-line bg-app-bg px-4 py-2 text-base text-app-text web:bg-app-sunken web:text-app-ink"
        />
      </View>
      <View className="gap-2">
        <Text className="text-sm font-semibold text-app-text web:text-rose-50/75">Synopsis</Text>
        <TextInput
          multiline
          onChangeText={setSynopsis}
          placeholder="What happened in this scene, and what tone should the story carry?"
          placeholderTextColor="#8F7A93"
          textAlignVertical="top"
          value={synopsis}
          className="min-h-24 rounded-xl border border-app-line bg-app-bg px-4 py-3 text-base leading-6 text-app-text web:bg-app-sunken web:text-app-ink"
        />
      </View>
      <View className="gap-4">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-base font-semibold text-app-text web:text-white">Tasks</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setTasks((current) => [...current, emptyTask()])}
            className="rounded-full border border-app-line bg-app-card px-3 py-1.5 web:bg-app-solid-sunken"
          >
            <Text className="text-xs font-semibold text-app-primary web:text-app-rose-deep">Add task</Text>
          </Pressable>
        </View>
        {tasks.map((task, index) => (
          <View key={index} className="gap-3 rounded-xl border border-app-line bg-app-card p-4 web:bg-app-solid-sunken">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-sm font-semibold text-app-text web:text-white">Task {index + 1}</Text>
              {tasks.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setTasks((current) => current.filter((_, taskIndex) => taskIndex !== index))}
                >
                  <Text className="text-xs font-semibold text-app-danger">Remove</Text>
                </Pressable>
              ) : null}
            </View>
            <TextInput
              onChangeText={(value) => updateTask(index, { title: value })}
              placeholder="Task title"
              placeholderTextColor="#8F7A93"
              value={task.title}
              className="min-h-10 rounded-lg border border-app-line bg-app-bg px-3 py-2 text-sm text-app-text web:bg-[#1B0F22] web:text-app-ink"
            />
            <TextInput
              multiline
              onChangeText={(value) => updateTask(index, { objective: value })}
              placeholder="Objective the user should complete"
              placeholderTextColor="#8F7A93"
              textAlignVertical="top"
              value={task.objective}
              className="min-h-20 rounded-lg border border-app-line bg-app-bg px-3 py-2 text-sm leading-5 text-app-text web:bg-[#1B0F22] web:text-app-ink"
            />
            <TextInput
              multiline
              onChangeText={(value) => updateTask(index, { ai_guidance: value })}
              placeholder="AI guidance for leading the scene"
              placeholderTextColor="#8F7A93"
              textAlignVertical="top"
              value={task.ai_guidance}
              className="min-h-20 rounded-lg border border-app-line bg-app-bg px-3 py-2 text-sm leading-5 text-app-text web:bg-[#1B0F22] web:text-app-ink"
            />
            <TextInput
              multiline
              onChangeText={(value) => updateTask(index, { completion_hint: value })}
              placeholder="Optional completion hint"
              placeholderTextColor="#8F7A93"
              textAlignVertical="top"
              value={task.completion_hint ?? ''}
              className="min-h-16 rounded-lg border border-app-line bg-app-bg px-3 py-2 text-sm leading-5 text-app-text web:bg-[#1B0F22] web:text-app-ink"
            />
          </View>
        ))}
      </View>
      {error ? <Text className="text-sm font-semibold text-app-danger">{error}</Text> : null}
      <View className="flex-row flex-wrap justify-end gap-3">
        <Button label="Cancel" onPress={onCancel} variant="secondary" />
        <Button isLoading={isSaving} label={initialStory ? 'Save story' : 'Create story'} onPress={save} />
      </View>
    </View>
  );
}
