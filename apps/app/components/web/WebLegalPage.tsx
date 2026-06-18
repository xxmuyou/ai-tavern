import { Text, View } from 'react-native';

import { WebAppShell } from '@/components/web/WebAppShell';
import { WebLegalDocument } from '@/components/web/WebLegalDocument';
import { WebLegalLinks } from '@/components/web/WebLegalLinks';
import { LEGAL_DOCUMENTS, type LegalDocumentId } from '@/constants/legal';

type WebLegalPageProps = {
  documentId: LegalDocumentId;
};

export function WebLegalPage({ documentId }: WebLegalPageProps) {
  const document = LEGAL_DOCUMENTS[documentId];

  return (
    <WebAppShell requireAuth={false} title={document.title} maxWidth="lg">
      <View className="gap-8">
        <WebLegalDocument document={document} />
        <View className="border-t border-white/10 pt-5">
          <Text className="mb-3 text-center text-caption uppercase tracking-[0.16em] text-rose-50/50">
            CharaPal policies
          </Text>
          <WebLegalLinks activeId={document.id} mode="navigation" />
        </View>
      </View>
    </WebAppShell>
  );
}
