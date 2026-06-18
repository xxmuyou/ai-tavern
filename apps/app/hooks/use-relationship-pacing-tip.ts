import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'charapal.relationshipPacingTip.v1';

let dismissedInMemory = false;

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function useRelationshipPacingTip() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const storage = getBrowserStorage();
    if (dismissedInMemory || storage?.getItem(STORAGE_KEY) === '1') {
      return;
    }
    setVisible(true);
  }, []);

  const dismiss = useCallback(() => {
    dismissedInMemory = true;
    const storage = getBrowserStorage();
    try {
      storage?.setItem(STORAGE_KEY, '1');
    } catch {
      // Some constrained webviews/private sessions block localStorage writes.
    }
    setVisible(false);
  }, []);

  return { dismiss, visible };
}
