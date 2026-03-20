/**
 * In-memory storage implementation for development/testing.
 * Production implementations should use Cloudflare KV, D1, or Durable Objects.
 */

import type { AuthorityStorage, IssuanceRecord } from './types.js';

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
    return record ? structuredClone(record) : null;
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

    if (options?.status) {
      records = records.filter(r => r.status === options.status);
    }

    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const offset = options?.offset || 0;
    const limit = options?.limit || 100;
    return records.slice(offset, offset + limit).map(r => structuredClone(r));
  }

  async getAgentPassRecord(value: string): Promise<IssuanceRecord | null> {
    const id = this.agentPassIndex.get(value);
    if (!id) return null;

    const record = this.records.get(id);
    if (!record) return null;
    if (record.status !== 'approved') return null;
    if (this.consumedPasses.has(value)) return null;

    // Check expiry
    if (new Date(record.expiresAt) < new Date()) return null;

    return structuredClone(record);
  }

  async consumeAgentPass(value: string, expectedServiceOrigin?: string): Promise<IssuanceRecord | null> {
    if (this.consumedPasses.has(value)) return null;

    const record = await this.getAgentPassRecord(value);
    if (!record) return null;
    if (expectedServiceOrigin && record.request.service.origin !== expectedServiceOrigin) return null;

    // Atomically consume
    this.consumedPasses.add(value);
    return record;
  }

  async getAuthorizationRecord(authorizationId: string): Promise<IssuanceRecord | null> {
    const id = this.authorizationIndex.get(authorizationId);
    if (!id) return null;
    const record = this.records.get(id);
    return record ? structuredClone(record) : null;
  }

  async revokeAuthorization(authorizationId: string): Promise<boolean> {
    const id = this.authorizationIndex.get(authorizationId);
    if (!id) return false;
    const record = this.records.get(id);
    if (!record) return false;
    record.status = 'canceled';
    this.authorizationIndex.delete(authorizationId);
    return true;
  }
}

/**
 * Cloudflare KV-backed storage implementation.
 */
export class KVStorage implements AuthorityStorage {
  constructor(private kv: KVNamespace) {}

  async createIssuanceRecord(record: IssuanceRecord): Promise<void> {
    const ttl = Math.max(60, Math.floor((new Date(record.expiresAt).getTime() - Date.now()) / 1000));
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
    return data ? JSON.parse(data) : null;
  }

  async updateIssuanceRecord(id: string, updates: Partial<IssuanceRecord>): Promise<void> {
    const existing = await this.getIssuanceRecord(id);
    if (!existing) throw new Error(`Record not found: ${id}`);

    const updated = { ...existing, ...updates };
    const ttl = Math.max(60, Math.floor((new Date(updated.expiresAt).getTime() - Date.now()) / 1000));

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

  async getAgentPassRecord(value: string): Promise<IssuanceRecord | null> {
    const id = await this.kv.get(`ap:${value}`);
    if (!id) return null;

    const record = await this.getIssuanceRecord(id);
    if (!record || record.status !== 'approved') return null;
    const consumed = await this.kv.get(`consumed:${value}`);
    if (consumed) return null;
    if (new Date(record.expiresAt) < new Date()) return null;

    return record;
  }

  async consumeAgentPass(value: string, expectedServiceOrigin?: string): Promise<IssuanceRecord | null> {
    const consumed = await this.kv.get(`consumed:${value}`);
    if (consumed) return null;

    const record = await this.getAgentPassRecord(value);
    if (!record) return null;
    if (expectedServiceOrigin && record.request.service.origin !== expectedServiceOrigin) return null;

    await this.kv.put(`consumed:${value}`, '1', { expirationTtl: 3600 });
    return record;
  }

  async getAuthorizationRecord(authorizationId: string): Promise<IssuanceRecord | null> {
    const id = await this.kv.get(`authz:${authorizationId}`);
    if (!id) return null;
    return this.getIssuanceRecord(id);
  }

  async revokeAuthorization(authorizationId: string): Promise<boolean> {
    const id = await this.kv.get(`authz:${authorizationId}`);
    if (!id) return false;
    await this.kv.delete(`authz:${authorizationId}`);
    const record = await this.getIssuanceRecord(id);
    if (record) {
      record.status = 'canceled';
      await this.kv.put(`record:${id}`, JSON.stringify(record));
    }
    return true;
  }
}
