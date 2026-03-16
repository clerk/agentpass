/**
 * AgentPass Authority Reference Implementation
 * Uses @agentpass/authority with Clerk for authentication.
 *
 * Cloudflare Worker entry point.
 */

import { createAuthorityHandler } from '@agentpass/authority';
import type { IssuanceRequest, IssuanceContext } from '@agentpass/authority';
import { DurableObjectsStorage, IssuanceDO, IssuanceIndexDO } from '@agentpass/authority/durable-objects';

// Re-export Durable Object classes so wrangler can find them
export { IssuanceDO, IssuanceIndexDO };

export interface Env {
  AUTHORITY_ORIGIN: string;
  CLERK_JWKS_URI: string;
  SIGNING_KEY: string; // JSON-encoded JWK private key
  SIGNING_KEY_ID: string;
  TRUST_MODE: string;
  INTERNAL_ORIGIN_OVERRIDES?: string;
  SERVICE_CONFIG_OVERRIDES?: string;
  ISSUANCE_DO: DurableObjectNamespace;
  ISSUANCE_INDEX_DO: DurableObjectNamespace;
}

function parseKeyValuePairs(envVar?: string): Record<string, string> | undefined {
  if (!envVar) return undefined;
  const pairs: Record<string, string> = {};
  for (const pair of envVar.split(',')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const from = pair.slice(0, eqIdx);
    const to = pair.slice(eqIdx + 1);
    if (from && to) pairs[from] = to;
  }
  return Object.keys(pairs).length > 0 ? pairs : undefined;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const signingKey = JSON.parse(env.SIGNING_KEY) as JsonWebKey;

    // Issuance request handler — sets everything to pending for human approval
    const onIssuanceRequest = async (
      _request: IssuanceRequest,
      _ctx: IssuanceContext,
    ) => {
      // Every request requires human approval
      return { status: 'pending' as const };
    };

    const storage = new DurableObjectsStorage(env.ISSUANCE_DO, env.ISSUANCE_INDEX_DO);

    const handler = createAuthorityHandler(
      {
        authority: env.AUTHORITY_ORIGIN,
        trustMode: (env.TRUST_MODE || 'federated') as 'enterprise' | 'federated' | 'service',
        signingKey,
        signingKeyId: env.SIGNING_KEY_ID || 'authority-key-1',
        approval: {
          modes: ['poll'],
          defaultTtlSeconds: 300,
        },
        onIssuanceRequest,
        dnsResolver: async () => [],
        serviceConfigOverrides: parseKeyValuePairs(env.SERVICE_CONFIG_OVERRIDES),
        internalOriginOverrides: parseKeyValuePairs(env.INTERNAL_ORIGIN_OVERRIDES),
      },
      storage,
    );

    // Add CORS headers for SPA
    const response = await handler(request);
    const corsResponse = new Response(response.body, response);
    corsResponse.headers.set('Access-Control-Allow-Origin', '*');
    corsResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    corsResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    return corsResponse;
  },
};
