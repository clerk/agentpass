import { useState, useEffect, useCallback } from 'react';
import { useAgentPass } from './provider.js';
import type { IssuanceRecord } from '../types.js';

export interface UseIssuanceRequestsOptions {
  /** Filter by status */
  status?: 'pending' | 'approved' | 'denied' | 'expired' | 'canceled';
  /** Poll interval in ms (default: 3000, set to 0 to disable) */
  pollInterval?: number;
  /** Max records to fetch */
  limit?: number;
}

export interface UseIssuanceRequestsResult {
  requests: IssuanceRecord[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useIssuanceRequests(options: UseIssuanceRequestsOptions = {}): UseIssuanceRequestsResult {
  const { authorityUrl, getToken } = useAgentPass();
  const [requests, setRequests] = useState<IssuanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { status, pollInterval = 3000, limit = 50 } = options;

  const fetchRequests = useCallback(async () => {
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (limit) params.set('limit', String(limit));

      const response = await fetch(`${authorityUrl}/api/requests?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch requests: ${response.status}`);
      }

      const data = await response.json() as { requests: IssuanceRecord[] };
      setRequests(data.requests);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [authorityUrl, getToken, status, limit]);

  useEffect(() => {
    fetchRequests();

    if (pollInterval > 0) {
      const interval = setInterval(fetchRequests, pollInterval);
      return () => clearInterval(interval);
    }
  }, [fetchRequests, pollInterval]);

  return { requests, loading, error, refresh: fetchRequests };
}
