import type { HarnessProofReplayStore } from './types.js';

/**
 * Best-effort single-process replay store for holder-binding proofs.
 * Use only for single-process testing or development.
 * Production deployments should provide a shared durable store.
 */
export class InMemoryHarnessProofReplayStore implements HarnessProofReplayStore {
  private expirations = new Map<string, number>();

  async checkAndStore(proofKey: string, expiresAt: Date): Promise<boolean> {
    const now = Date.now();
    this.evictExpired(now);

    const expiresAtMs = expiresAt.getTime();
    if (expiresAtMs <= now) {
      return false;
    }

    const existingExpiry = this.expirations.get(proofKey);
    if (existingExpiry && existingExpiry > now) {
      return false;
    }

    this.expirations.set(proofKey, expiresAtMs);
    return true;
  }

  private evictExpired(now: number): void {
    for (const [proofKey, expiryMs] of this.expirations.entries()) {
      if (expiryMs <= now) {
        this.expirations.delete(proofKey);
      }
    }
  }
}
