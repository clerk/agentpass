/**
 * Durable Objects storage implementation for AgentPass Authority.
 *
 * Provides persistent, crash-resilient storage using Cloudflare Durable Objects.
 * - IssuanceDO: one instance per issuance request (KV storage, atomic consume)
 * - IssuanceIndexDO: singleton with SQLite for queries and lookups
 * - DurableObjectsStorage: orchestrates both DOs, implements AuthorityStorage
 *
 * Import from '@agentpass/authority/durable-objects' in your worker entrypoint.
 */

import { DurableObject } from 'cloudflare:workers';
import type { AuthorityStorage, IssuanceRecord } from './types.js';

/**
 * Durable Object that stores a single issuance record.
 * One instance per issuance request, keyed by request ID.
 */
export class IssuanceDO extends DurableObject {
  async create(record: IssuanceRecord): Promise<void> {
    await this.ctx.storage.put('record', record);
    await this.ctx.storage.put('consumed', false);
  }

  async get(): Promise<IssuanceRecord | null> {
    return await this.ctx.storage.get('record') ?? null;
  }

  async update(updates: Partial<IssuanceRecord>): Promise<IssuanceRecord> {
    const existing = await this.ctx.storage.get<IssuanceRecord>('record');
    if (!existing) throw new Error('Record not found');

    const updated = { ...existing, ...updates };
    await this.ctx.storage.put('record', updated);
    return updated;
  }

  /** Atomically consume the AgentPass. Returns the record if successful, null if already consumed/invalid. */
  async consume(): Promise<IssuanceRecord | null> {
    const consumed = await this.ctx.storage.get<boolean>('consumed');
    if (consumed) return null;

    const record = await this.ctx.storage.get<IssuanceRecord>('record');
    if (!record) return null;
    if (record.status !== 'approved') return null;
    if (new Date(record.expiresAt) < new Date()) return null;

    await this.ctx.storage.put('consumed', true);
    return record;
  }

  /** Revoke the authorization. Returns true if the record existed and was updated. */
  async revoke(): Promise<boolean> {
    const record = await this.ctx.storage.get<IssuanceRecord>('record');
    if (!record) return false;

    record.status = 'canceled';
    await this.ctx.storage.put('record', record);
    return true;
  }
}

/**
 * Singleton Durable Object with SQLite storage that indexes all issuance records.
 * Enables querying by status, agentpass value, and authorization ID.
 */
export class IssuanceIndexDO extends DurableObject {
  private tableReady = false;

  private ensureTable(): void {
    if (this.tableReady) return;
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS issuance_records (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        type TEXT NOT NULL,
        user_email TEXT NOT NULL,
        agentpass_value TEXT,
        authorization_id TEXT,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed INTEGER DEFAULT 0
      )
    `);
    this.tableReady = true;
  }

  async index(record: IssuanceRecord): Promise<void> {
    this.ensureTable();
    this.ctx.storage.sql.exec(
      `INSERT INTO issuance_records (id, status, type, user_email, agentpass_value, authorization_id, data, created_at, expires_at, consumed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      record.id,
      record.status,
      record.type,
      record.request.user.email,
      record.agentpass?.value ?? null,
      record.authorizationId ?? null,
      JSON.stringify(record),
      record.createdAt,
      record.expiresAt,
    );
  }

  async updateIndex(id: string, updates: {
    status?: string;
    agentpass_value?: string;
    authorization_id?: string;
    consumed?: boolean;
    data?: string;
  }): Promise<void> {
    this.ensureTable();
    const sets: string[] = [];
    const params: unknown[] = [];

    if (updates.status !== undefined) { sets.push('status = ?'); params.push(updates.status); }
    if (updates.agentpass_value !== undefined) { sets.push('agentpass_value = ?'); params.push(updates.agentpass_value); }
    if (updates.authorization_id !== undefined) { sets.push('authorization_id = ?'); params.push(updates.authorization_id); }
    if (updates.consumed !== undefined) { sets.push('consumed = ?'); params.push(updates.consumed ? 1 : 0); }
    if (updates.data !== undefined) { sets.push('data = ?'); params.push(updates.data); }

    if (sets.length === 0) return;
    params.push(id);
    this.ctx.storage.sql.exec(`UPDATE issuance_records SET ${sets.join(', ')} WHERE id = ?`, ...params);
  }

  async list(options?: { status?: string; limit?: number; offset?: number }): Promise<IssuanceRecord[]> {
    this.ensureTable();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;

    params.push(limit, offset);
    const rows = this.ctx.storage.sql.exec(
      `SELECT data FROM issuance_records ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      ...params,
    ).toArray();

    return rows.map((row: Record<string, unknown>) => JSON.parse(row.data as string) as IssuanceRecord);
  }

  async lookupByAgentPass(value: string): Promise<{ id: string; consumed: boolean } | null> {
    this.ensureTable();
    const rows = this.ctx.storage.sql.exec(
      'SELECT id, consumed FROM issuance_records WHERE agentpass_value = ?',
      value,
    ).toArray();

    if (rows.length === 0) return null;
    return { id: rows[0].id as string, consumed: rows[0].consumed === 1 };
  }

  async lookupByAuthorizationId(authzId: string): Promise<string | null> {
    this.ensureTable();
    const rows = this.ctx.storage.sql.exec(
      'SELECT id FROM issuance_records WHERE authorization_id = ?',
      authzId,
    ).toArray();

    return rows.length > 0 ? rows[0].id as string : null;
  }

  async removeAuthorizationId(authzId: string): Promise<void> {
    this.ensureTable();
    this.ctx.storage.sql.exec(
      'UPDATE issuance_records SET authorization_id = NULL WHERE authorization_id = ?',
      authzId,
    );
  }
}

/**
 * Durable Objects-backed storage implementation.
 * Uses IssuanceDO (one per request) for atomic record operations
 * and IssuanceIndexDO (singleton with SQLite) for queries.
 */
export class DurableObjectsStorage implements AuthorityStorage {
  private indexStub: DurableObjectStub<IssuanceIndexDO>;

  constructor(
    private issuanceNS: DurableObjectNamespace<IssuanceDO>,
    private indexNS: DurableObjectNamespace<IssuanceIndexDO>,
  ) {
    this.indexStub = this.indexNS.get(this.indexNS.idFromName('index'));
  }

  private getIssuanceStub(id: string): DurableObjectStub<IssuanceDO> {
    return this.issuanceNS.get(this.issuanceNS.idFromName(id));
  }

  async createIssuanceRecord(record: IssuanceRecord): Promise<void> {
    const stub = this.getIssuanceStub(record.id);
    await stub.create(record);
    await this.indexStub.index(record);
  }

  async getIssuanceRecord(id: string): Promise<IssuanceRecord | null> {
    const stub = this.getIssuanceStub(id);
    return stub.get();
  }

  async updateIssuanceRecord(id: string, updates: Partial<IssuanceRecord>): Promise<void> {
    const stub = this.getIssuanceStub(id);
    const updated = await stub.update(updates);

    // Sync index with changes
    const indexUpdates: Parameters<IssuanceIndexDO['updateIndex']>[1] = {
      data: JSON.stringify(updated),
    };
    if (updates.status) indexUpdates.status = updates.status;
    if (updates.agentpass) indexUpdates.agentpass_value = updates.agentpass.value;
    if (updates.authorizationId) indexUpdates.authorization_id = updates.authorizationId;

    await this.indexStub.updateIndex(id, indexUpdates);
  }

  async listIssuanceRecords(options?: { status?: string; limit?: number; offset?: number }): Promise<IssuanceRecord[]> {
    return this.indexStub.list(options);
  }

  async consumeAgentPass(value: string): Promise<IssuanceRecord | null> {
    // Look up which record has this agentpass value
    const lookup = await this.indexStub.lookupByAgentPass(value);
    if (!lookup || lookup.consumed) return null;

    // Atomically consume in the IssuanceDO (single-threaded guarantee)
    const stub = this.getIssuanceStub(lookup.id);
    const record = await stub.consume();
    if (!record) return null;

    // Mark consumed in index
    await this.indexStub.updateIndex(lookup.id, { consumed: true });
    return record;
  }

  async getAuthorizationRecord(authorizationId: string): Promise<IssuanceRecord | null> {
    const id = await this.indexStub.lookupByAuthorizationId(authorizationId);
    if (!id) return null;
    return this.getIssuanceRecord(id);
  }

  async revokeAuthorization(authorizationId: string): Promise<boolean> {
    const id = await this.indexStub.lookupByAuthorizationId(authorizationId);
    if (!id) return false;

    const stub = this.getIssuanceStub(id);
    const revoked = await stub.revoke();
    if (!revoked) return false;

    // Update index: remove authorization mapping and update status
    const record = await stub.get();
    await this.indexStub.updateIndex(id, {
      status: 'canceled',
      authorization_id: undefined,
      data: record ? JSON.stringify(record) : undefined,
    });
    await this.indexStub.removeAuthorizationId(authorizationId);
    return true;
  }
}
