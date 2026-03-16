import { createServiceHandler } from '@agentpass/service';
import type { Context } from 'hono';
import { onScopeDiscovery } from './scopes';
import {
  createRedeemBrowserSession,
  createRedeemBearerToken,
} from './redemption';

export { apiTokens, generateToken } from './redemption';
export type { ApiTokenInfo } from './redemption';

interface AgentPassEnv {
  SERVICE_ORIGIN: string;
  SIGNING_KEY: string;
  SIGNING_KEY_ID: string;
  AUTHORITY_URL: string;
  AUTHORITY_CONFIG_OVERRIDES?: string;
  INTERNAL_ORIGIN_OVERRIDES?: string;
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

export function createAgentPassHandler(
  c: Context<{ Bindings: AgentPassEnv }>,
): (request: Request) => Promise<Response> {
  const env = c.env;
  const signingKey = JSON.parse(env.SIGNING_KEY) as JsonWebKey;

  return createServiceHandler({
    origin: env.SERVICE_ORIGIN,
    name: 'AgentPass Todo Service',
    trust: {
      trustedFederatedAuthorities: [
        {
          authority: env.AUTHORITY_URL,
          authority_configuration_url: `${env.AUTHORITY_URL}/agentpass-authority/ap`,
        },
      ],
    },
    signingKey,
    signingKeyId: env.SIGNING_KEY_ID || 'service-key-1',
    onScopeDiscovery,
    onRedeemBrowserSession: createRedeemBrowserSession(env.SERVICE_ORIGIN),
    onRedeemBearerToken: createRedeemBearerToken(),
    dnsResolver: async () => [],
    authorityConfigOverrides: parseKeyValuePairs(env.AUTHORITY_CONFIG_OVERRIDES),
    internalOriginOverrides: parseKeyValuePairs(env.INTERNAL_ORIGIN_OVERRIDES),
  });
}
