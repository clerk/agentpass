import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorage } from '../src/storage.js';
import type { IssuanceRecord } from '../src/types.js';

function makeRecord(overrides: Partial<IssuanceRecord> = {}): IssuanceRecord {
  return {
    id: 'req_001',
    status: 'pending',
    type: 'bearer_token',
    request: {
      type: 'bearer_token',
      service: { origin: 'https://service.example.com' },
      user: { email: 'alex@example.com' },
      harness: { id: 'test-harness' },
      task: { id: 'task_001', description: 'Test task' },
    },
    scope: ['read'],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    ...overrides,
  };
}

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('creates and retrieves issuance records', async () => {
    const record = makeRecord();
    await storage.createIssuanceRecord(record);
    const retrieved = await storage.getIssuanceRecord('req_001');
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe('req_001');
    expect(retrieved!.status).toBe('pending');
  });

  it('updates issuance records', async () => {
    await storage.createIssuanceRecord(makeRecord());
    await storage.updateIssuanceRecord('req_001', { status: 'approved' });
    const updated = await storage.getIssuanceRecord('req_001');
    expect(updated!.status).toBe('approved');
  });

  it('lists records with filters', async () => {
    await storage.createIssuanceRecord(makeRecord({ id: 'req_001', status: 'pending' }));
    await storage.createIssuanceRecord(makeRecord({ id: 'req_002', status: 'approved' }));

    const pending = await storage.listIssuanceRecords({ status: 'pending' });
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('req_001');

    const all = await storage.listIssuanceRecords();
    expect(all).toHaveLength(2);
  });

  it('consumes an AgentPass atomically', async () => {
    const record = makeRecord({
      status: 'approved',
      agentpass: { type: 'bearer_token', value: 'ap_test123' },
    });
    await storage.createIssuanceRecord(record);

    const consumed = await storage.consumeAgentPass('ap_test123');
    expect(consumed).toBeDefined();
    expect(consumed!.id).toBe('req_001');

    // Second consume should fail (single-use)
    const second = await storage.consumeAgentPass('ap_test123');
    expect(second).toBeNull();
  });

  it('rejects consuming unknown AgentPass', async () => {
    const result = await storage.consumeAgentPass('unknown');
    expect(result).toBeNull();
  });

  it('rejects consuming expired AgentPass', async () => {
    const record = makeRecord({
      status: 'approved',
      agentpass: { type: 'bearer_token', value: 'ap_expired' },
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    await storage.createIssuanceRecord(record);

    const result = await storage.consumeAgentPass('ap_expired');
    expect(result).toBeNull();
  });

  it('manages authorization records', async () => {
    const record = makeRecord({
      status: 'approved',
      authorizationId: 'authz_001',
    });
    await storage.createIssuanceRecord(record);

    const authz = await storage.getAuthorizationRecord('authz_001');
    expect(authz).toBeDefined();
    expect(authz!.authorizationId).toBe('authz_001');
  });

  it('revokes authorizations', async () => {
    const record = makeRecord({
      status: 'approved',
      authorizationId: 'authz_001',
    });
    await storage.createIssuanceRecord(record);

    const revoked = await storage.revokeAuthorization('authz_001');
    expect(revoked).toBe(true);

    const authz = await storage.getAuthorizationRecord('authz_001');
    expect(authz).toBeNull();
  });
});
