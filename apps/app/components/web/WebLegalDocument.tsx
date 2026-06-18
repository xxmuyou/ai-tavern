import { Text, View } from 'react-native';

import type { LegalDocument } from '@/constants/legal';

type WebLegalDocumentProps = {
  document: LegalDocument;
  showHeader?: boolean;
};

export function WebLegalDocument({ document, showHeader = true }: WebLegalDocumentProps) {
  return (
    <View className="gap-6">
      <View
        className={
          showHeader
            ? 'overflow-hidden rounded-3xl border border-white/10 bg-gradient-hero px-7 py-7 shadow-card'
            : 'rounded-2xl border border-app-line bg-app-solid-surface px-5 py-5'
        }
      >
        <View className="flex-row flex-wrap items-center gap-2">
          <View className="rounded-full border border-white/12 bg-white/8 px-3 py-1">
            <Text className="text-caption font-semibold uppercase tracking-[0.16em] text-rose-50/70">
              Policy document
            </Text>
          </View>
          <View className="rounded-full border border-white/12 bg-app-solid-sunken px-3 py-1">
            <Text className="text-caption font-semibold text-rose-50/70">Updated {document.lastUpdated}</Text>
          </View>
        </View>

        {showHeader ? <Text className="mt-5 font-serif text-display-sm text-white">{document.title}</Text> : null}
        <Text className={`${showHeader ? 'mt-3 max-w-3xl' : 'mt-4'} text-body-sm leading-6 text-rose-50/75`}>
          {document.intro}
        </Text>
        <View className="mt-5 self-start rounded-2xl border border-app-rose/25 bg-app-rose-soft px-4 py-3">
          <Text className="text-caption font-semibold uppercase tracking-[0.14em] text-app-rose-deep">Contact</Text>
          <Text className="mt-1 text-body-sm font-semibold text-white">{document.contactEmail}</Text>
        </View>
      </View>

      <View className="rounded-2xl border border-white/10 bg-app-solid-panel px-5 py-5">
        <Text className="text-caption font-semibold uppercase tracking-[0.16em] text-rose-50/50">Contents</Text>
        <View className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {document.sections.map((section) => {
            const { label, number } = splitHeading(section.heading);
            return (
              <View key={section.heading} className="flex-row items-center gap-3 rounded-xl bg-app-solid-surface px-3 py-2.5">
                <View className="h-7 w-7 items-center justify-center rounded-full bg-app-solid-sunken">
                  <Text className="text-caption font-semibold text-app-rose-deep">{number}</Text>
                </View>
                <Text className="min-w-0 flex-1 text-body-sm font-semibold text-rose-50/80" numberOfLines={1}>
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View className="gap-6">
        {document.sections.map((section) => {
          const { label, number } = splitHeading(section.heading);
          return (
            <View key={section.heading} className="rounded-2xl border border-white/10 bg-app-solid-panel px-5 py-5">
              <View className="flex-row items-start gap-4">
                <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-full border border-app-rose/25 bg-app-rose-soft">
                  <Text className="text-body-sm font-semibold text-app-rose-deep">{number}</Text>
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="font-serif text-title-sm text-white">{label}</Text>
                </View>
              </View>
              <View className="mt-4 gap-2">
                {section.body.map((paragraph) => (
                  <Text key={paragraph} className="text-body-sm leading-6 text-rose-50/70">
                    {paragraph}
                  </Text>
                ))}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function splitHeading(heading: string): { label: string; number: string } {
  const match = /^(\d+)\.\s*(.+)$/.exec(heading);
  if (!match) return { label: heading, number: '•' };
  return { label: match[2] ?? heading, number: match[1] ?? '•' };
}
