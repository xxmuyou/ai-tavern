import { useCallback, useEffect, useState } from 'react';

import {
  addAdminAllowlistEmail,
  listAdminAllowlist,
  removeAdminAllowlistEmail,
} from '@/api/companion-client';
import type { AdminAllowlistItem } from '@/api/types';

import { useErrorBanner } from './use-error-banner';

export function useAdminMembers() {
  const { pushError } = useErrorBanner();
  const [emails, setEmails] = useState<AdminAllowlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const payload = await listAdminAllowlist();
    setEmails(payload.emails);
  }, []);

  useEffect(() => {
    let mounted = true;
    listAdminAllowlist()
      .then((payload) => {
        if (mounted) setEmails(payload.emails);
      })
      .catch(() => pushError('Could not load admin members.'))
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [pushError]);

  const addEmail = useCallback(
    async (email: string, note: string): Promise<boolean> => {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        pushError('Enter an email address.');
        return false;
      }
      setIsSaving(true);
      try {
        await addAdminAllowlistEmail(trimmedEmail, note.trim());
        await refresh();
        return true;
      } catch {
        pushError('Could not add this email.');
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [pushError, refresh],
  );

  const removeEmail = useCallback(
    async (targetEmail: string) => {
      setRemovingEmail(targetEmail);
      try {
        await removeAdminAllowlistEmail(targetEmail);
        await refresh();
      } catch {
        pushError('Could not remove this email.');
      } finally {
        setRemovingEmail(null);
      }
    },
    [pushError, refresh],
  );

  return { addEmail, emails, isLoading, isSaving, removeEmail, removingEmail };
}
