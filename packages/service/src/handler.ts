/**
 * AgentPass Service HTTP handler for Cloudflare Workers.
 * Implements all Service protocol endpoints per spec Section 4.
 */

import type {
  ServiceConfig,
  AuthorityValidationResponse,
  AuthorityResolutionResult,
  TrustEntry,
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

  type AuthorityResolutionDecision =
    | {
      ok: true;
      response: AuthorityResolutionResult;
      authorities: ResolvedAuthority[];
    }
    | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

  interface ResolvedAuthority extends TrustEntry {
    source: 'enterprise' | 'service' | 'federated';
  }

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

    const decision = await resolveAuthoritiesForUserEmail(body.user.email);
    if (!decision.ok) {
      return errorResponse(decision.status, decision.code, decision.message);
    }

    return json(decision.response);
  }

  async function handleAvailableScopes(request: Request): Promise<Response> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse(401, 'missing_assertion', 'Authorization header with Bearer assertion required');
    }

    const assertionJwt = authHeader.slice(7);
    let assertionPayload: Record<string, unknown>;
    try {
      assertionPayload = decodeJwtPayload(assertionJwt);
      if (assertionPayload.aud !== config.origin) {
        return errorResponse(401, 'invalid_assertion', 'Assertion audience does not match this service');
      }
      if (assertionPayload.exp && (assertionPayload.exp as number) < Math.floor(Date.now() / 1000)) {
        return errorResponse(401, 'expired_assertion', 'Assertion has expired');
      }
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

    const resolvedAuthority = await resolveRequestedAuthority(body.user.email, assertionPayload.iss as string);
    if ('error' in resolvedAuthority) return resolvedAuthority.error;

    try {
      await verifyAuthorityAssertion(assertionJwt, resolvedAuthority);
    } catch (e) {
      return errorResponse(401, 'invalid_assertion', `Assertion verification failed: ${(e as Error).message}`);
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
    if (!body.user?.email) {
      return errorResponse(400, 'missing_field', 'user.email is required');
    }

    const resolvedAuthority = await resolveRequestedAuthority(body.user.email, body.authority);
    if ('error' in resolvedAuthority) return resolvedAuthority.error;

    // Validate AgentPass with Authority
    let validation: AuthorityValidationResponse;
    try {
      validation = await validateAgentPassWithAuthority(resolvedAuthority, body.agentpass.value);
    } catch (e) {
      return errorResponse(422, 'validation_failed', (e as Error).message);
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

    const harnessProofError = await verifyHarnessProof(validation.cnf, body.harness_proof?.jwt);
    if (harnessProofError) {
      return harnessProofError;
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
      });

      return json({
        initialization_url: result.initialization_url,
        expires_at: result.expires_at,
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
    if (!body.user?.email) {
      return errorResponse(400, 'missing_field', 'user.email is required');
    }

    const resolvedAuthority = await resolveRequestedAuthority(body.user.email, body.authority);
    if ('error' in resolvedAuthority) return resolvedAuthority.error;

    let validation: AuthorityValidationResponse;
    try {
      validation = await validateAgentPassWithAuthority(resolvedAuthority, body.agentpass.value);
    } catch (e) {
      return errorResponse(422, 'validation_failed', (e as Error).message);
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

    const harnessProofError = await verifyHarnessProof(validation.cnf, body.harness_proof?.jwt);
    if (harnessProofError) {
      return harnessProofError;
    }

    try {
      const result = await config.onRedeemBearerToken({
        userEmail: validation.user.email,
        agentId: validation.agent.id,
        scope: grantedScope,
        taskId: validation.task?.id,
        taskDescription: validation.task?.description,
        authorizationId: validation.authorization_id,
      });

      return json({
        bearer_token: result.bearer_token,
        scope: result.scope || grantedScope,
        expires_in: result.expires_in,
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

  async function resolveAuthoritiesForUserEmail(userEmail: string): Promise<AuthorityResolutionDecision> {
    if (config.onResolveAuthority) {
      try {
        const response = await config.onResolveAuthority({ userEmail });
        return {
          ok: true,
          response,
          authorities: normalizeAuthorityResolution(response),
        };
      } catch (e) {
        return {
          ok: false,
          status: 500,
          code: 'resolution_error',
          message: (e as Error).message,
        };
      }
    }

    const emailDomain = userEmail.split('@')[1];
    if (!emailDomain) {
      return {
        ok: false,
        status: 400,
        code: 'invalid_email',
        message: 'Invalid email address',
      };
    }

    const dnsResult = await discoverEnterprise(emailDomain);
    if (dnsResult === 'none') {
      return {
        ok: false,
        status: 403,
        code: 'delegation_disabled',
        message: 'Delegation is explicitly disabled for this domain',
      };
    }

    if (dnsResult) {
      try {
        const authConfig = await fetchAuthorityConfig(resolveUrl(dnsResult));
        if (config.trust.serviceAuthority) {
          const allowServiceAuth = authConfig.policy?.allow_service_authorities ?? true;
          if (allowServiceAuth) {
            const response = { service_authority: config.trust.serviceAuthority } satisfies AuthorityResolutionResult;
            return {
              ok: true,
              response,
              authorities: normalizeAuthorityResolution(response),
            };
          }
        }

        const response = {
          enterprise_authority: {
            authority: authConfig.authority,
            authority_configuration_url: dnsResult,
          },
        } satisfies AuthorityResolutionResult;
        return {
          ok: true,
          response,
          authorities: normalizeAuthorityResolution(response),
        };
      } catch {
        return {
          ok: false,
          status: 502,
          code: 'authority_fetch_failed',
          message: 'Failed to fetch or validate Enterprise Authority configuration',
        };
      }
    }

    if (config.trust.serviceAuthority) {
      const response = { service_authority: config.trust.serviceAuthority } satisfies AuthorityResolutionResult;
      return {
        ok: true,
        response,
        authorities: normalizeAuthorityResolution(response),
      };
    }

    if (config.trust.trustedFederatedAuthorities && config.trust.trustedFederatedAuthorities.length > 0) {
      const response = {
        trusted_federated_authorities: config.trust.trustedFederatedAuthorities,
      } satisfies AuthorityResolutionResult;
      return {
        ok: true,
        response,
        authorities: normalizeAuthorityResolution(response),
      };
    }

    return {
      ok: false,
      status: 404,
      code: 'no_authority',
      message: 'No enterprise authority and no trusted federated options',
    };
  }

  async function verifyHarnessProof(
    cnf: AuthorityValidationResponse['cnf'] | undefined,
    harnessProofJwt: string | undefined,
  ): Promise<Response | null> {
    if (!cnf) {
      return null;
    }

    if (!harnessProofJwt) {
      return errorResponse(401, 'invalid_proof', 'Harness proof is required when cnf is present');
    }

    try {
      const pubKey = await importVerifyKey(cnf.jwk);
      const { payload } = await verifyJwt(harnessProofJwt, pubKey);
      if (payload.aud !== config.origin) {
        return errorResponse(401, 'invalid_proof', 'Harness proof audience mismatch');
      }
    } catch {
      return errorResponse(401, 'invalid_proof', 'Harness proof verification failed');
    }

    return null;
  }

  async function resolveRequestedAuthority(
    userEmail: string,
    requestedAuthority: string,
  ): Promise<ResolvedAuthority | { error: Response }> {
    const decision = await resolveAuthoritiesForUserEmail(userEmail);
    if (!decision.ok) {
      return { error: errorResponse(decision.status, decision.code, decision.message) };
    }

    const matchedAuthority = decision.authorities.find(authority => authority.authority === requestedAuthority);
    if (!matchedAuthority) {
      return {
        error: errorResponse(
          403,
          'authority_precedence_violation',
          'Requested authority is not permitted for this user',
        ),
      };
    }

    return matchedAuthority;
  }

  function normalizeAuthorityResolution(result: AuthorityResolutionResult): ResolvedAuthority[] {
    if ('enterprise_authority' in result) {
      return [{ ...result.enterprise_authority, source: 'enterprise' }];
    }
    if ('service_authority' in result) {
      return [{ ...result.service_authority, source: 'service' }];
    }
    return result.trusted_federated_authorities.map(authority => ({
      ...authority,
      source: 'federated' as const,
    }));
  }

  async function validateAgentPassWithAuthority(
    authority: ResolvedAuthority,
    agentpassValue: string,
  ): Promise<AuthorityValidationResponse> {
    const authConfig = await fetchAuthorityConfig(resolveUrl(authority.authority_configuration_url));
    const validateUrl = authConfig.endpoints.validate;

    // Create Service assertion JWT
    const signingCryptoKey = await importSigningKey(config.signingKey);
    const assertion = await signJwt(
      {
        iss: config.origin,
        aud: authority.authority,
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

  async function verifyAuthorityAssertion(jwt: string, authority: ResolvedAuthority): Promise<void> {
    const authConfig = await fetchAuthorityConfig(resolveUrl(authority.authority_configuration_url));
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
  endpoints: { issuance: string; issuance_status: string; validate: string; authorization_check: string };
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
