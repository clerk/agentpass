import { useState } from 'react';
import { useIssuanceRequests, useDecision, useRevoke } from '@agentpass/authority/react';
import type { IssuanceRecord } from '@agentpass/authority';

type TabFilter = 'pending' | 'approved' | 'denied' | undefined;

export function Dashboard() {
  const [tab, setTab] = useState<TabFilter>('pending');
  const { requests, loading, error, refresh } = useIssuanceRequests({
    status: tab,
    pollInterval: 3000,
  });

  if (loading && requests.length === 0) {
    return <p>Loading requests...</p>;
  }

  if (error) {
    return <p style={{ color: 'red' }}>Error: {error.message}</p>;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {(['pending', 'approved', 'denied', undefined] as TabFilter[]).map((t) => (
          <button
            key={t ?? 'all'}
            onClick={() => setTab(t)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: tab === t ? '2px solid #2563eb' : '1px solid #ddd',
              background: tab === t ? '#eff6ff' : 'white',
              cursor: 'pointer',
              fontWeight: tab === t ? 600 : 400,
            }}
          >
            {t ?? 'All'}
          </button>
        ))}
        <button onClick={refresh} style={{ marginLeft: 'auto', padding: '0.5rem 1rem', cursor: 'pointer', borderRadius: '6px', border: '1px solid #ddd' }}>
          Refresh
        </button>
      </div>

      {requests.length === 0 ? (
        <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>
          No {tab || ''} requests found.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {requests.map((req) => (
            <RequestCard key={req.id} request={req} onAction={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ request, onAction }: { request: IssuanceRecord; onAction: () => void }) {
  const { approve, deny, loading } = useDecision();
  const { revoke, loading: revokeLoading } = useRevoke();

  const handleApprove = async () => {
    try {
      await approve(request.id, request.scope);
      onAction();
    } catch (e) {
      console.error('Approve failed:', e);
    }
  };

  const handleDeny = async () => {
    try {
      await deny(request.id, 'Denied by administrator');
      onAction();
    } catch (e) {
      console.error('Deny failed:', e);
    }
  };

  const handleRevoke = async () => {
    if (!request.authorizationId) return;
    try {
      await revoke(request.authorizationId);
      onAction();
    } catch (e) {
      console.error('Revoke failed:', e);
    }
  };

  const statusColor = {
    pending: '#f59e0b',
    approved: '#10b981',
    denied: '#ef4444',
    expired: '#6b7280',
    canceled: '#6b7280',
  }[request.status];

  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '1.25rem',
      background: 'white',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div>
          <span style={{
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'white',
            background: statusColor,
            textTransform: 'uppercase',
          }}>
            {request.status}
          </span>
          <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
            {request.type === 'browser_session' ? 'Browser Session' : 'Bearer Token'}
          </span>
        </div>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
          {request.id}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
        <div><strong>User:</strong> {request.request.user.email}</div>
        <div><strong>Agent:</strong> {request.request.harness.id}</div>
        <div><strong>Service:</strong> {request.request.service.origin}</div>
        <div><strong>Task:</strong> {request.request.task.id}</div>
      </div>

      <div style={{ fontSize: '0.875rem', marginBottom: '0.75rem', padding: '0.5rem', background: '#f9fafb', borderRadius: '4px' }}>
        <strong>Task Description:</strong> {request.request.task.description}
      </div>

      {request.scope && request.scope.length > 0 && (
        <div style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>
          <strong>Scopes:</strong>{' '}
          {request.scope.map((s) => (
            <span key={s} style={{
              display: 'inline-block',
              padding: '0.125rem 0.5rem',
              margin: '0.125rem',
              background: '#e5e7eb',
              borderRadius: '4px',
              fontSize: '0.75rem',
            }}>
              {s}
            </span>
          ))}
        </div>
      )}

      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
        Created: {new Date(request.createdAt).toLocaleString()} | Expires: {new Date(request.expiresAt).toLocaleString()}
      </div>

      {request.status === 'pending' && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleApprove}
            disabled={loading}
            style={{
              padding: '0.5rem 1.5rem', borderRadius: '6px', border: 'none',
              background: '#10b981', color: 'white', cursor: 'pointer', fontWeight: 600,
            }}
          >
            {loading ? 'Processing...' : 'Approve'}
          </button>
          <button
            onClick={handleDeny}
            disabled={loading}
            style={{
              padding: '0.5rem 1.5rem', borderRadius: '6px', border: '1px solid #ef4444',
              background: 'white', color: '#ef4444', cursor: 'pointer', fontWeight: 600,
            }}
          >
            {loading ? 'Processing...' : 'Deny'}
          </button>
        </div>
      )}

      {request.status === 'approved' && request.authorizationId && (
        <button
          onClick={handleRevoke}
          disabled={revokeLoading}
          style={{
            padding: '0.5rem 1.5rem', borderRadius: '6px', border: '1px solid #ef4444',
            background: 'white', color: '#ef4444', cursor: 'pointer', fontWeight: 600,
          }}
        >
          {revokeLoading ? 'Revoking...' : 'Revoke'}
        </button>
      )}
    </div>
  );
}
