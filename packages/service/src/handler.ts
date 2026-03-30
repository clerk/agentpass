/**
 * AgentPass Service HTTP handler for Cloudflare Workers.
 * Implements all Service protocol endpoints per spec Section 4.
 */

import type {
  ServiceConfig,
  AuthorityValidationResponse,
  AgentPassError,
} from './types.js';
import {
  signJwt,
  verifyJwt,
  decodeJwtPayload,
  importSigningKey,
  importVerifyKey,
  fetchJwks,
} from './crypto.js';

export function createServiceHandler(config: ServiceConfig) {
  const basePath = (config.basePath ?? '/agentpass-service').replace(/\/$/, '');
  const jwksUri = `${config.origin}${basePath}/jwks.json`;

  return async function handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Service configuration (GET)
    if (request.method === 'GET' && path === `${basePath}/config.json`) {
      return handleConfiguration();
    }

    // JWKS endpoint (GET)
    if (request.method === 'GET' && path === `${basePath}/jwks.json`) {
      return handleJwks();
    }

    // Authority resolution (POST)
    if (request.method === 'POST' && path === `${basePath}/agentpass/resolve-authorities`) {
      return handleResolveAuthorities(request);
    }

    // Available scopes (POST)
    if (request.method === 'POST' && path === `${basePath}/agentpass/scopes`) {
      return handleAvailableScopes(request);
    }

    // Browser session redemption (POST)
    if (request.method === 'POST' && path === `${basePath}/agentpass/redeem-browser-session`) {
      return handleRedeemBrowserSession(request);
    }

    // Bearer token redemption (POST)
    if (request.method === 'POST' && path === `${basePath}/agentpass/redeem-bearer-token`) {
      return handleRedeemBearerToken(request);
    }

    return notFound();
  };

  function handleConfiguration(): Response {
    const configDoc = {
      version: '0.1',
      kind: 'service',
      service: {
        origin: config.origin,
        ...(config.name && { name: config.name }),
      },
      jwks_uri: jwksUri,
      trust: {
        ...(config.trust.trustedFederatedAuthorities && {
          trusted_federated_authorities: config.trust.trustedFederatedAuthorities,
        }),
        ...(config.trust.serviceAuthority && {
          service_authority: config.trust.serviceAuthority,
        }),
      },
      endpoints: {
        resolve_authorities: `${config.origin}${basePath}/agentpass/resolve-authorities`,
        redeem_browser_session: `${config.origin}${basePath}/agentpass/redeem-browser-session`,
        redeem_bearer_token: `${config.origin}${basePath}/agentpass/redeem-bearer-token`,
        available_scopes: `${config.origin}${basePath}/agentpass/scopes`,
      },
    };

    return json(configDoc, 200, { 'Cache-Control': 'public, max-age=300' });
  }

  async function handleJwks(): Promise<Response> {
    const publicJwk = { ...config.signingKey };
    delete publicJwk.d;
    delete publicJwk.dp;
    delete publicJwk.dq;
    delete publicJwk.p;
    delete publicJwk.q;
    delete publicJwk.qi;
    publicJwk.key_ops = ['verify'];
    delete publicJwk.ext;

    return json({
      keys: [{ ...publicJwk, kid: config.signingKeyId, use: 'sig' }],
    });
  }

  async function handleResolveAuthorities(request: Request): Promise<Response> {
    let body: { user: { email: string } };
    try {
      body = await request.json() as typeof body;
    } catch {
      return errorResponse(400, 'invalid_request', 'Invalid JSON body');
    }

    if (!body.user?.email) {
      return errorResponse(400, 'missing_field', 'user.email is required');
    }

    // If custom handler provided, use it
    if (config.onResolveAuthority) {
      try {
        const result = await config.onResolveAuthority({ userEmail: body.user.email });
        return json(result);
      } catch (e) {
        return errorResponse(500, 'resolution_error', (e as Error).message);
      }
    }

    // Default resolution algorithm per spec Section 4.2
    const emailDomain = body.user.email.split('@')[1];
    if (!emailDomain) {
      return errorResponse(400, 'invalid_email', 'Invalid email address');
    }

    // Step 1: Try enterprise discovery via DNS
    const dnsResult = await discoverEnterprise(emailDomain);

    if (dnsResult === 'none') {
      // Explicitly disabled — reject
      return errorResponse(403, 'delegation_disabled', 'Delegation is explicitly disabled for this domain');
    }

    if (dnsResult) {
      // Enterprise Authority found
      try {
        const authConfig = await fetchAuthorityConfig(dnsResult);

        // Check if Service Authority is allowed
        if (config.trust.serviceAuthority) {
          const allowServiceAuth = authConfig.policy?.allow_service_authorities ?? true;
          if (allowServiceAuth) {
            return json({ service_authority: config.trust.serviceAuthority });
          }
        }

        return json({
          enterprise_authority: {
            authority: authConfig.authority,
            authority_configuration_url: dnsResult,
          },
        });
      } catch {
        // Fetch/validation failure — reject per spec
        return errorResponse(502, 'authority_fetch_failed', 'Failed to fetch or validate Enterprise Authority configuration');
      }
    }

    // No DNS record — return federated authorities
    if (config.trust.trustedFederatedAuthorities && config.trust.trustedFederatedAuthorities.length > 0) {
      return json({
        trusted_federated_authorities: config.trust.trustedFederatedAuthorities,
      });
    }

    // Check for service authority as fallback
    if (config.trust.serviceAuthority) {
      return json({
        service_authority: config.trust.serviceAuthority,
      });
    }

    return errorResponse(404, 'no_authority', 'No enterprise authority and no trusted federated options');
  }

  async function handleAvailableScopes(request: Request): Promise<Response> {
    // Verify Authority assertion
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse(401, 'missing_assertion', 'Authorization header with Bearer assertion required');
    }

    try {
      const payload = decodeJwtPayload(authHeader.slice(7));
      if (payload.aud !== config.origin) {
        return errorResponse(401, 'invalid_assertion', 'Assertion audience does not match this service');
      }
      if (payload.exp && (payload.exp as number) < Math.floor(Date.now() / 1000)) {
        return errorResponse(401, 'expired_assertion', 'Assertion has expired');
      }
      // Verify Authority signature
      await verifyAuthorityAssertion(authHeader.slice(7), payload.iss as string);
    } catch (e) {
      return errorResponse(401, 'invalid_assertion', `Assertion verification failed: ${(e as Error).message}`);
    }

    let body: { user: { email: string }; agent: { id: string }; task?: { id?: string; description?: string } };
    try {
      body = await request.json() as typeof body;
    } catch {
      return errorResponse(400, 'invalid_request', 'Invalid JSON body');
    }

    if (!body.user?.email || !body.agent?.id) {
      return errorResponse(400, 'missing_field', 'user.email and agent.id are required');
    }

    try {
      const scopes = await config.onScopeDiscovery({
        userEmail: body.user.email,
        agentId: body.agent.id,
        taskId: body.task?.id,
        taskDescription: body.task?.description,
      });

      return json({ scopes });
    } catch (e) {
      return errorResponse(500, 'scope_error', (e as Error).message);
    }
  }

  async function handleRedeemBrowserSession(request: Request): Promise<Response> {
    let body: {
      agentpass: { type: string; value: string };
      authority: string;
      user?: { email?: string };
      harness_proof?: { jwt: string };
      requested_scope?: string[];
    };
    try {
      body = await request.json() as typeof body;
    } catch {
      return errorResponse(400, 'invalid_request', 'Invalid JSON body');
    }

    // Validate required fields
    if (!body.agentpass?.type || !body.agentpass?.value) {
      return errorResponse(400, 'missing_field', 'agentpass.type and agentpass.value are required');
    }
    if (body.agentpass.type !== 'browser_session') {
      return errorResponse(400, 'invalid_type', 'agentpass.type must be browser_session');
    }
    if (!body.authority) {
      return errorResponse(400, 'missing_field', 'authority is required');
    }

    // Verify authority is trusted
    if (!isTrustedAuthority(body.authority)) {
      return errorResponse(403, 'untrusted_authority', 'Authority is not trusted by this service');
    }

    // Validate AgentPass with Authority
    let validation: AuthorityValidationResponse;
    try {
      validation = await validateAgentPassWithAuthority(body.authority, body.agentpass.value);
    } catch (e) {
      return errorResponse(422, 'validation_failed', (e as Error).message);
    }

    const authorizationExpiry = parseFutureDate(validation.authorization_expires_at);
    if (!authorizationExpiry) {
      return errorResponse(422, 'validation_failed', 'Delegation has already expired or returned an invalid authorization_expires_at');
    }

    // Scope validation
    let grantedScope = validation.scope;
    if (body.requested_scope) {
      grantedScope = validation.scope.includes('*')
        ? body.requested_scope
        : body.requested_scope.filter(s => validation.scope.includes(s));
      if (grantedScope.length === 0) {
        return errorResponse(403, 'scope_mismatch', 'No intersection between requested and approved scopes');
      }
    }

    // Verify harness proof if cnf is present
    if (validation.cnf && body.harness_proof?.jwt) {
      try {
        const pubKey = await importVerifyKey(validation.cnf.jwk);
        const { payload } = await verifyJwt(body.harness_proof.jwt, pubKey);
        if (payload.aud !== config.origin) {
          return errorResponse(401, 'invalid_proof', 'Harness proof audience mismatch');
        }
      } catch {
        return errorResponse(401, 'invalid_proof', 'Harness proof verification failed');
      }
    }

    // Call implementer's handler
    try {
      const result = await config.onRedeemBrowserSession({
        userEmail: validation.user.email,
        agentId: validation.agent.id,
        scope: grantedScope,
        destinationUrl: validation.destination_url,
        taskId: validation.task?.id,
        taskDescription: validation.task?.description,
        authorizationId: validation.authorization_id,
        authorizationExpiresAt: validation.authorization_expires_at,
      });

      const expiresAt = clampIsoTimestamp(result.expires_at, authorizationExpiry);

      return json({
        initialization_url: result.initialization_url,
        ...(expiresAt && { expires_at: expiresAt }),
        one_time: true,
      });
    } catch (e) {
      return errorResponse(500, 'redemption_error', (e as Error).message);
    }
  }

  async function handleRedeemBearerToken(request: Request): Promise<Response> {
    let body: {
      agentpass: { type: string; value: string };
      authority: string;
      user?: { email?: string };
      harness_proof?: { jwt: string };
      requested_scope?: string[];
    };
    try {
      body = await request.json() as typeof body;
    } catch {
      return errorResponse(400, 'invalid_request', 'Invalid JSON body');
    }

    if (!body.agentpass?.type || !body.agentpass?.value) {
      return errorResponse(400, 'missing_field', 'agentpass.type and agentpass.value are required');
    }
    if (body.agentpass.type !== 'bearer_token') {
      return errorResponse(400, 'invalid_type', 'agentpass.type must be bearer_token');
    }
    if (!body.authority) {
      return errorResponse(400, 'missing_field', 'authority is required');
    }

    if (!isTrustedAuthority(body.authority)) {
      return errorResponse(403, 'untrusted_authority', 'Authority is not trusted by this service');
    }

    let validation: AuthorityValidationResponse;
    try {
      validation = await validateAgentPassWithAuthority(body.authority, body.agentpass.value);
    } catch (e) {
      return errorResponse(422, 'validation_failed', (e as Error).message);
    }

    const authorizationExpiry = parseFutureDate(validation.authorization_expires_at);
    if (!authorizationExpiry) {
      return errorResponse(422, 'validation_failed', 'Delegation has already expired or returned an invalid authorization_expires_at');
    }

    let grantedScope = validation.scope;
    if (body.requested_scope) {
      grantedScope = validation.scope.includes('*')
        ? body.requested_scope
        : body.requested_scope.filter(s => validation.scope.includes(s));
      if (grantedScope.length === 0) {
        return errorResponse(403, 'scope_mismatch', 'No intersection between requested and approved scopes');
      }
    }

    if (validation.cnf && body.harness_proof?.jwt) {
      try {
        const pubKey = await importVerifyKey(validation.cnf.jwk);
        const { payload } = await verifyJwt(body.harness_proof.jwt, pubKey);
        if (payload.aud !== config.origin) {
          return errorResponse(401, 'invalid_proof', 'Harness proof audience mismatch');
        }
      } catch {
        return errorResponse(401, 'invalid_proof', 'Harness proof verification failed');
      }
    }

    try {
      const result = await config.onRedeemBearerToken({
        userEmail: validation.user.email,
        agentId: validation.agent.id,
        scope: grantedScope,
        taskId: validation.task?.id,
        taskDescription: validation.task?.description,
        authorizationId: validation.authorization_id,
        authorizationExpiresAt: validation.authorization_expires_at,
      });

      const expiresIn = clampExpiresInSeconds(result.expires_in, authorizationExpiry);

      return json({
        bearer_token: result.bearer_token,
        scope: result.scope || grantedScope,
        ...(expiresIn !== undefined && { expires_in: expiresIn }),
      });
    } catch (e) {
      return errorResponse(500, 'redemption_error', (e as Error).message);
    }
  }

  // ─── Helpers ───

  function resolveUrl(url: string): string {
    if (!config.internalOriginOverrides) return url;
    for (const [from, to] of Object.entries(config.internalOriginOverrides)) {
      if (url.startsWith(from)) return url.replace(from, to);
    }
    return url;
  }

  function isTrustedAuthority(authority: string): boolean {
    // Check service authority
    if (config.trust.serviceAuthority?.authority === authority) return true;
    // Check federated authorities
    if (config.trust.trustedFederatedAuthorities?.some(a => a.authority === authority)) return true;
    return false;
  }

  async function validateAgentPassWithAuthority(
    authority: string,
    agentpassValue: string,
  ): Promise<AuthorityValidationResponse> {
    // Find the authority config URL
    let configUrl: string | undefined;
    if (config.trust.serviceAuthority?.authority === authority) {
      configUrl = config.trust.serviceAuthority.authority_configuration_url;
    }
    if (!configUrl) {
      const fed = config.trust.trustedFederatedAuthorities?.find(a => a.authority === authority);
      if (fed) configUrl = fed.authority_configuration_url;
    }
    if (!configUrl) throw new Error('Authority not found in trust configuration');

    // Fetch authority configuration
    const authConfig = await fetchAuthorityConfig(resolveUrl(configUrl));
    const validateUrl = authConfig.endpoints.validate;

    // Create Service assertion JWT
    const signingCryptoKey = await importSigningKey(config.signingKey);
    const assertion = await signJwt(
      {
        iss: config.origin,
        aud: authority,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
      },
      signingCryptoKey,
      config.signingKeyId,
    );

    const response = await fetch(resolveUrl(validateUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${assertion}`,
      },
      body: JSON.stringify({ agentpass: { value: agentpassValue } }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(err.error?.message || `Validation failed: ${response.status}`);
    }

    return response.json() as Promise<AuthorityValidationResponse>;
  }

  async function verifyAuthorityAssertion(jwt: string, authorityId: string): Promise<void> {
    // Find the authority's config URL from trust config
    let configUrl: string | undefined;
    if (config.trust.serviceAuthority?.authority === authorityId) {
      configUrl = config.trust.serviceAuthority.authority_configuration_url;
    }
    if (!configUrl) {
      const fed = config.trust.trustedFederatedAuthorities?.find(a => a.authority === authorityId);
      if (fed) configUrl = fed.authority_configuration_url;
    }

    if (!configUrl) {
      throw new Error('Authority not found in trust configuration');
    }

    const authConfig = await fetchAuthorityConfig(resolveUrl(configUrl));
    const authorityJwksUri = authConfig.jwks_uri;

    const keys = await fetchJwks(resolveUrl(authorityJwksUri));
    let verified = false;
    for (const key of keys) {
      try {
        const pubKey = await importVerifyKey(key);
        await verifyJwt(jwt, pubKey);
        verified = true;
        break;
      } catch {
        continue;
      }
    }
    if (!verified) throw new Error('Could not verify Authority assertion');
  }

  async function discoverEnterprise(emailDomain: string): Promise<string | 'none' | null> {
    // Check overrides first
    if (config.authorityConfigOverrides?.[emailDomain]) {
      return config.authorityConfigOverrides[emailDomain];
    }

    try {
      const resolver = config.dnsResolver || defaultDnsResolver;
      const records = await resolver(`_agentpass.${emailDomain}`, 'TXT');

      if (records.length === 0) return null;

      for (const record of records) {
        const value = record.replace(/"/g, '').trim();
        if (value === 'none') return 'none';
        if (value.startsWith('https://')) return value;
      }
      return null;
    } catch {
      return null; // No DNS record
    }
  }
}

async function fetchAuthorityConfig(configUrl: string): Promise<{
  authority: string;
  trust_mode: string;
  jwks_uri: string;
  endpoints: {
    issuance: string;
    issuance_status: string;
    validate: string;
    authorization_check: string;
    authorization_close: string;
  };
  policy?: { allow_service_authorities?: boolean };
}> {
  const response = await fetch(configUrl);
  if (!response.ok) throw new Error(`Failed to fetch authority config: ${response.status}`);
  return response.json() as Promise<ReturnType<typeof fetchAuthorityConfig>>;
}

async function defaultDnsResolver(name: string, type: string): Promise<string[]> {
  // Use DNS-over-HTTPS (Cloudflare)
  const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { Accept: 'application/dns-json' },
  });
  if (!response.ok) return [];
  const data = await response.json() as { Answer?: { data: string }[] };
  return (data.Answer || []).map(a => a.data);
}

// ─── Utility functions ───

function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  const body: AgentPassError = { error: { code, message } };
  return json(body, status);
}

function notFound(): Response {
  return errorResponse(404, 'not_found', 'Endpoint not found');
}

function parseFutureDate(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getTime() <= Date.now()) return null;
  return parsed;
}

function clampIsoTimestamp(value: string | undefined, max: Date): string | undefined {
  if (!value) return undefined;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid expires_at returned by onRedeemBrowserSession');
  }

  return new Date(Math.min(parsed.getTime(), max.getTime())).toISOString();
}

function clampExpiresInSeconds(value: number | undefined, max: Date): number | undefined {
  const maxSeconds = Math.max(0, Math.floor((max.getTime() - Date.now()) / 1000));
  if (value === undefined) return undefined;
  return Math.max(0, Math.min(value, maxSeconds));
}
