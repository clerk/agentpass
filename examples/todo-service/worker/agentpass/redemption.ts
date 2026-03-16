import type {
  BrowserSessionRedemptionHandler,
  BearerTokenRedemptionHandler,
} from '@agentpass/service';

export interface ApiTokenInfo {
  userEmail: string;
  agentId: string;
  scope: string[];
  expiresAt: number;
  authorizationId: string;
}

// In-memory token store shared across the worker
export const apiTokens = new Map<string, ApiTokenInfo>();

export function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return 'aptok_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function createRedeemBrowserSession(
  serviceOrigin: string,
): BrowserSessionRedemptionHandler {
  return async (params) => {
    const initToken = generateToken();
    apiTokens.set(initToken, {
      userEmail: params.userEmail,
      agentId: params.agentId,
      scope: params.scope,
      expiresAt: Date.now() + 300000, // 5 min
      authorizationId: params.authorizationId,
    });

    return {
      initialization_url: `${serviceOrigin}/init?token=${initToken}`,
      expires_at: new Date(Date.now() + 300000).toISOString(),
    };
  };
}

export function createRedeemBearerToken(): BearerTokenRedemptionHandler {
  return async (params) => {
    const token = generateToken();
    apiTokens.set(token, {
      userEmail: params.userEmail,
      agentId: params.agentId,
      scope: params.scope,
      expiresAt: Date.now() + 3600000, // 1 hour
      authorizationId: params.authorizationId,
    });

    return {
      bearer_token: token,
      scope: params.scope,
      expires_in: 3600,
    };
  };
}
