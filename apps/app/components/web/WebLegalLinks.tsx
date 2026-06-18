import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { LEGAL_DOCUMENT_ORDER, LEGAL_DOCUMENTS, type LegalDocumentId } from '@/constants/legal';

import { WebLegalDocument } from './WebLegalDocument';
import { WebButton, WebDialog } from './ui';
import { cn } from './ui/cn';

type WebLegalLinksProps = {
  activeId?: LegalDocumentId;
  className?: string;
  mode?: 'dialog' | 'navigation';
};

export function WebLegalLinks({ activeId, className, mode = 'dialog' }: WebLegalLinksProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<LegalDocumentId | null>(null);
  const selectedDocument = selectedId ? LEGAL_DOCUMENTS[selectedId] : null;

  function handlePress(id: LegalDocumentId) {
    const document = LEGAL_DOCUMENTS[id];
    if (mode === 'navigation') {
      router.push(document.route as Href);
      return;
    }
    setSelectedId(id);
  }

  return (
    <>
      <View className={cn('flex-row flex-wrap items-center justify-center gap-x-4 gap-y-2', className)}>
        {LEGAL_DOCUMENT_ORDER.map((id) => {
          const document = LEGAL_DOCUMENTS[id];
          const active = activeId === id;
          return (
            <Pressable
              key={id}
              accessibilityRole={mode === 'navigation' ? 'link' : 'button'}
              accessibilityState={active ? { selected: true } : undefined}
              onPress={() => handlePress(id)}
              className="rounded-full px-2 py-1 hover:bg-white/8"
            >
              <Text className={cn('text-caption font-semibold', active ? 'text-app-rose-deep' : 'text-rose-50/60')}>
                {document.shortTitle}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <WebDialog
        description={selectedDocument?.intro}
        footer={<WebButton label="Close" onPress={() => setSelectedId(null)} size="sm" variant="outline" />}
        onClose={() => setSelectedId(null)}
        open={Boolean(selectedDocument)}
        size="lg"
        surface="solid"
        title={selectedDocument?.title ?? 'Legal'}
      >
        {selectedDocument ? <WebLegalDocument document={selectedDocument} showHeader={false} /> : null}
      </WebDialog>
    </>
  );
}
