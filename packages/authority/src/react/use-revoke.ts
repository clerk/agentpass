import { useState, useCallback } from 'react';
import { useAgentPass } from './provider.js';

export interface UseRevokeResult {
  revoke: (authorizationId: string) => Promise<void>;
  loading: boolean;
  error: Error | null;
}

export function useRevoke(): UseRevokeResult {
  const { authorityUrl, getToken } = useAgentPass();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const revoke = useCallback(
    async (authorizationId: string) => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const response = await fetch(`${authorityUrl}/api/revoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ authorization_id: authorizationId }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({})) as { error?: { message?: string } };
          throw new Error(errData.error?.message || `Revoke failed: ${response.status}`);
        }
      } catch (e) {
        setError(e as Error);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [authorityUrl, getToken],
  );

  return { revoke, loading, error };
}
