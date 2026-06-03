import { Platform, Share } from 'react-native';

import { exportCompanionCard } from '@/api/companion-client';

/**
 * Fetch a companion's V2 character card and hand it to the user: a file download
 * on web, the native share sheet on iOS/Android. No extra dependencies.
 */
export async function shareCompanionCard(companionId: string, name: string): Promise<void> {
  const card = await exportCompanionCard(companionId);
  const json = JSON.stringify(card, null, 2);

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name.replace(/[^a-z0-9-_]+/gi, '_') || 'character'}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return;
  }

  await Share.share({ message: json });
}
