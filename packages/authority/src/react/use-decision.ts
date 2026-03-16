import { useState, useCallback } from 'react';
import { useAgentPass } from './provider.js';
import type { IssuanceStatusResponse } from '../types.js';

export interface UseDecisionResult {
  approve: (requestId: string, scope?: string[]) => Promise<IssuanceStatusResponse>;
  deny: (requestId: string, reason?: string) => Promise<IssuanceStatusResponse>;
  loading: boolean;
  error: Error | null;
}

export function useDecision(): UseDecisionResult {
  const { authorityUrl, getToken } = useAgentPass();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const makeDecision = useCallback(
    async (requestId: string, decision: 'approved' | 'denied', scope?: string[], reason?: string) => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const response = await fetch(`${authorityUrl}/api/requests/${requestId}/decision`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ decision, scope, reason }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({})) as { error?: { message?: string } };
          throw new Error(errData.error?.message || `Decision failed: ${response.status}`);
        }

        return await response.json() as IssuanceStatusResponse;
      } catch (e) {
        setError(e as Error);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [authorityUrl, getToken],
  );

  const approve = useCallback(
    (requestId: string, scope?: string[]) => makeDecision(requestId, 'approved', scope),
    [makeDecision],
  );

  const deny = useCallback(
    (requestId: string, reason?: string) => makeDecision(requestId, 'denied', undefined, reason),
    [makeDecision],
  );

  return { approve, deny, loading, error };
}
