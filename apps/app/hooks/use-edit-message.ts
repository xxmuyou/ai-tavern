import { useCallback, useState } from 'react';

import { editChatMessage } from '@/api/companion-client';
import type { ChatMode } from '@/api/types';

type HistoryLike = {
  refresh: (options?: { silent?: boolean }) => Promise<void>;
};

export type UseEditMessageResult = {
  editingId: string | null;
  editingText: string;
  isSaving: boolean;
  setEditingText: (text: string) => void;
  beginEdit: (messageId: string, content: string) => void;
  cancelEdit: () => void;
  saveEdit: () => Promise<void>;
};

/**
 * Edit a user message: the server rewrites it, drops everything after it, and
 * generates a fresh reply. We reload history from the server afterwards rather
 * than splice locally, so the client never has to mirror the truncation.
 */
export function useEditMessage(
  companionId: string,
  history: HistoryLike,
  opts?: { chatMode?: ChatMode; storyId?: string | null; onSaved?: () => void; onError?: (message: string) => void },
): UseEditMessageResult {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const beginEdit = useCallback((messageId: string, content: string) => {
    setEditingId(messageId);
    setEditingText(content);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingText('');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId) {
      return;
    }
    const text = editingText.trim();
    if (!text) {
      return;
    }
    setIsSaving(true);
    try {
      await editChatMessage(companionId, editingId, text, { chat_mode: opts?.chatMode, story_id: opts?.storyId ?? undefined });
      await history.refresh({ silent: true });
      opts?.onSaved?.();
      setEditingId(null);
      setEditingText('');
    } catch (error) {
      opts?.onError?.(error instanceof Error ? error.message : 'Could not edit the message.');
    } finally {
      setIsSaving(false);
    }
  }, [companionId, editingId, editingText, history, opts]);

  return { beginEdit, cancelEdit, editingId, editingText, isSaving, saveEdit, setEditingText };
}
