/**
 * In-memory storage implementation for development/testing.
 * Production implementations should use Cloudflare KV, D1, or Durable Objects.
 */

import type { AuthorityStorage, AuthorizationCloseAction, AuthorizationStatus, IssuanceRecord } from './types.js';

export class MemoryStorage implements AuthorityStorage {
  private records = new Map<string, IssuanceRecord>();
  private agentPassIndex = new Map<string, string>(); // value -> id
  private authorizationIndex = new Map<string, string>(); // authorizationId -> id
  private consumedPasses = new Set<string>();

  async createIssuanceRecord(record: IssuanceRecord): Promise<void> {
    this.records.set(record.id, structuredClone(record));
    if (record.agentpass) {
      this.agentPassIndex.set(record.agentpass.value, record.id);
    }
    if (record.authorizationId) {
      this.authorizationIndex.set(record.authorizationId, record.id);
    }
  }

  async getIssuanceRecord(id: string): Promise<IssuanceRecord | null> {
    const record = this.records.get(id);
    if (!record) return null;
    synchronizeAuthorizationExpiry(record);
    return structuredClone(record);
  }

  async updateIssuanceRecord(id: string, updates: Partial<IssuanceRecord>): Promise<void> {
    const existing = this.records.get(id);
    if (!existing) throw new Error(`Record not found: ${id}`);

    const updated = { ...existing, ...updates };
    this.records.set(id, updated);

    if (updates.agentpass) {
      this.agentPassIndex.set(updates.agentpass.value, id);
    }
    if (updates.authorizationId) {
      this.authorizationIndex.set(updates.authorizationId, id);
    }
  }

  async listIssuanceRecords(options?: { status?: string; limit?: number; offset?: number }): Promise<IssuanceRecord[]> {
    let records = Array.from(this.records.values());
    for (const record of records) {
      synchronizeAuthorizationExpiry(record);
    }

    if (options?.status) {
      records = records.filter(r => r.status === options.status);
    }

    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const offset = options?.offset || 0;
    const limit = options?.limit || 100;
    return records.slice(offset, offset + limit).map(r => structuredClone(r));
  }

  async consumeAgentPass(value: string): Promise<IssuanceRecord | null> {
    if (this.consumedPasses.has(value)) return null;

    const id = this.agentPassIndex.get(value);
    if (!id) return null;

    const record = this.records.get(id);
    if (!record) return null;
    if (record.status !== 'approved') return null;

    // Check expiry
    if (new Date(record.expiresAt) < new Date()) return null;
    if (synchronizeAuthorizationExpiry(record)) return null;
    if (getAuthorizationStatus(record) !== 'active') return null;

    // Atomically consume
    this.consumedPasses.add(value);
    return structuredClone(record);
  }

  async getAuthorizationRecord(authorizationId: string): Promise<IssuanceRecord | null> {
    const id = this.authorizationIndex.get(authorizationId);
    if (!id) return null;
    const record = this.records.get(id);
    if (!record) return null;
    synchronizeAuthorizationExpiry(record);
    return structuredClone(record);
  }

  async closeAuthorization(
    authorizationId: string,
    action: AuthorizationCloseAction,
    reason?: string,
    closedAt = new Date().toISOString(),
  ): Promise<IssuanceRecord | null> {
    const id = this.authorizationIndex.get(authorizationId);
    if (!id) return null;
    const record = this.records.get(id);
    if (!record) return null;

    synchronizeAuthorizationExpiry(record);
    const authorizationStatus = getAuthorizationStatus(record);
    if (authorizationStatus === 'active') {
      record.authorizationStatus = action === 'complete' ? 'completed' : 'revoked';
      record.authorizationClosedAt = closedAt;
      record.authorizationClosureReason = reason;
    }

    return structuredClone(record);
  }
}

/**
 * Cloudflare KV-backed storage implementation.
 */
export class KVStorage implements AuthorityStorage {
  constructor(private kv: KVNamespace) {}

  async createIssuanceRecord(record: IssuanceRecord): Promise<void> {
    const ttl = computeStorageTtlSeconds(record);
    await Promise.all([
      this.kv.put(`record:${record.id}`, JSON.stringify(record), { expirationTtl: ttl }),
      record.agentpass
        ? this.kv.put(`ap:${record.agentpass.value}`, record.id, { expirationTtl: ttl })
        : Promise.resolve(),
      record.authorizationId
        ? this.kv.put(`authz:${record.authorizationId}`, record.id, { expirationTtl: ttl })
        : Promise.resolve(),
    ]);
  }

  async getIssuanceRecord(id: string): Promise<IssuanceRecord | null> {
    const data = await this.kv.get(`record:${id}`);
    if (!data) return null;

    const record = JSON.parse(data) as IssuanceRecord;
    if (synchronizeAuthorizationExpiry(record)) {
      await this.kv.put(`record:${id}`, JSON.stringify(record), { expirationTtl: computeStorageTtlSeconds(record) });
    }
    return record;
  }

  async updateIssuanceRecord(id: string, updates: Partial<IssuanceRecord>): Promise<void> {
    const existing = await this.getIssuanceRecord(id);
    if (!existing) throw new Error(`Record not found: ${id}`);

    const updated = { ...existing, ...updates };
    const ttl = computeStorageTtlSeconds(updated);

    await this.kv.put(`record:${id}`, JSON.stringify(updated), { expirationTtl: ttl });

    if (updates.agentpass) {
      await this.kv.put(`ap:${updates.agentpass.value}`, id, { expirationTtl: ttl });
    }
    if (updates.authorizationId) {
      await this.kv.put(`authz:${updates.authorizationId}`, id, { expirationTtl: ttl });
    }
  }

  async listIssuanceRecords(options?: { status?: string; limit?: number; offset?: number }): Promise<IssuanceRecord[]> {
    const list = await this.kv.list({ prefix: 'record:' });
    const records: IssuanceRecord[] = [];
    for (const key of list.keys) {
      const data = await this.kv.get(key.name);
      if (data) {
        const record = JSON.parse(data) as IssuanceRecord;
        if (synchronizeAuthorizationExpiry(record)) {
          await this.kv.put(`record:${record.id}`, JSON.stringify(record), { expirationTtl: computeStorageTtlSeconds(record) });
        }
        if (!options?.status || record.status === options.status) {
          records.push(record);
        }
      }
    }
    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const offset = options?.offset || 0;
    const limit = options?.limit || 100;
    return records.slice(offset, offset + limit);
  }

  async consumeAgentPass(value: string): Promise<IssuanceRecord | null> {
    const consumed = await this.kv.get(`consumed:${value}`);
    if (consumed) return null;

    const id = await this.kv.get(`ap:${value}`);
    if (!id) return null;

    const record = await this.getIssuanceRecord(id);
    if (!record || record.status !== 'approved') return null;
    if (new Date(record.expiresAt) < new Date()) return null;
    if (synchronizeAuthorizationExpiry(record)) {
      await this.kv.put(`record:${id}`, JSON.stringify(record), { expirationTtl: computeStorageTtlSeconds(record) });
      return null;
    }
    if (getAuthorizationStatus(record) !== 'active') return null;

    await this.kv.put(`consumed:${value}`, '1', { expirationTtl: 3600 });
    return record;
  }

  async getAuthorizationRecord(authorizationId: string): Promise<IssuanceRecord | null> {
    const id = await this.kv.get(`authz:${authorizationId}`);
    if (!id) return null;
    const record = await this.getIssuanceRecord(id);
    if (!record) return null;
    if (synchronizeAuthorizationExpiry(record)) {
      await this.kv.put(`record:${id}`, JSON.stringify(record), { expirationTtl: computeStorageTtlSeconds(record) });
    }
    return record;
  }

  async closeAuthorization(
    authorizationId: string,
    action: AuthorizationCloseAction,
    reason?: string,
    closedAt = new Date().toISOString(),
  ): Promise<IssuanceRecord | null> {
    const id = await this.kv.get(`authz:${authorizationId}`);
    if (!id) return null;
    const record = await this.getIssuanceRecord(id);
    if (!record) return null;

    synchronizeAuthorizationExpiry(record);
    if (getAuthorizationStatus(record) === 'active') {
      record.authorizationStatus = action === 'complete' ? 'completed' : 'revoked';
      record.authorizationClosedAt = closedAt;
      record.authorizationClosureReason = reason;
      await this.kv.put(`record:${id}`, JSON.stringify(record), { expirationTtl: computeStorageTtlSeconds(record) });
    }
    return record;
  }
}

function getAuthorizationExpiry(record: IssuanceRecord): string {
  return record.authorizationExpiresAt || record.expiresAt;
}

function getAuthorizationStatus(record: IssuanceRecord): AuthorizationStatus {
  if (record.authorizationStatus) {
    return record.authorizationStatus;
  }
  if (record.authorizationId) {
    return 'active';
  }
  return 'expired';
}

function synchronizeAuthorizationExpiry(record: IssuanceRecord): boolean {
  if (
    getAuthorizationStatus(record) === 'active'
    && new Date(getAuthorizationExpiry(record)) < new Date()
  ) {
    record.authorizationStatus = 'expired';
    record.authorizationClosedAt = record.authorizationClosedAt || getAuthorizationExpiry(record);
    return true;
  }
  return getAuthorizationStatus(record) === 'expired';
}

function computeStorageTtlSeconds(record: IssuanceRecord): number {
  const latestExpiry = Math.max(
    new Date(record.expiresAt).getTime(),
    new Date(getAuthorizationExpiry(record)).getTime(),
  );
  return Math.max(60, Math.floor((latestExpiry - Date.now()) / 1000));
}
