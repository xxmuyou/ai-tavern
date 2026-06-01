import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ExpressionPromptsSection } from './ExpressionPromptsSection';

const PROMPT_MODULES = [
  {
    description: 'WF2 expression portrait prompts used for generated companion portrait variants.',
    id: 'expression-portraits',
    label: 'Expression portrait system prompts',
  },
] as const;

type PromptModuleId = (typeof PROMPT_MODULES)[number]['id'];

export function PromptsSection() {
  const [moduleId, setModuleId] = useState<PromptModuleId>('expression-portraits');
  const active = PROMPT_MODULES.find((module) => module.id === moduleId) ?? PROMPT_MODULES[0];

  return (
    <View className="gap-4">
      <View className="rounded-lg border border-app-line bg-white p-5">
        <Text className="text-lg font-semibold text-app-text">Prompts</Text>
        <Text className="mt-1 text-sm leading-6 text-app-muted">
          System prompts are grouped by module so future prompt surfaces can live here without mixing contexts.
        </Text>
        <View className="mt-4">
          <PromptModuleDropdown value={moduleId} onChange={setModuleId} />
          <Text className="mt-2 text-sm text-app-muted">{active.description}</Text>
        </View>
      </View>

      {moduleId === 'expression-portraits' ? <ExpressionPromptsSection /> : null}
    </View>
  );
}

function PromptModuleDropdown({
  onChange,
  value,
}: {
  onChange: (value: PromptModuleId) => void;
  value: PromptModuleId;
}) {
  const [open, setOpen] = useState(false);
  const active = PROMPT_MODULES.find((module) => module.id === value) ?? PROMPT_MODULES[0];

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((current) => !current)}
        className="min-h-12 justify-center rounded-lg border border-app-line bg-white px-4"
      >
        <Text className="text-base font-semibold text-app-text">{active.label}</Text>
      </Pressable>
      {open ? (
        <View className="mt-2 overflow-hidden rounded-lg border border-app-line bg-white">
          {PROMPT_MODULES.map((module) => (
            <Pressable
              key={module.id}
              accessibilityRole="button"
              onPress={() => {
                onChange(module.id);
                setOpen(false);
              }}
              className={`border-b border-app-line px-4 py-3 last:border-b-0 ${
                module.id === value ? 'bg-app-primarySoft' : 'bg-white'
              }`}
            >
              <Text className={`text-sm font-semibold ${module.id === value ? 'text-app-primary' : 'text-app-text'}`}>
                {module.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
