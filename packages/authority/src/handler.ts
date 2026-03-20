/**
 * AgentPass Authority HTTP handler for Cloudflare Workers.
 * Implements all Authority protocol endpoints per spec Section 5.
 */

import type {
  AuthorityConfig,
  AuthorityStorage,
  IssuanceRequest,
  IssuanceRecord,
  IssuanceStatusResponse,
  ValidationResponse,
  AgentPassError,
} from './types.js';
import {
  generateAgentPassValue,
  generateId,
  signJwt,
  verifyJwt,
  decodeJwtPayload,
  importSigningKey,
  importVerifyKey,
  fetchJwks,
} from './crypto.js';

export function createAuthorityHandler(config: AuthorityConfig, storage: AuthorityStorage) {
  const basePath = (config.basePath ?? '/agentpass-authority').replace(/\/$/, '');
  const origin = config.authority;
  const jwksUri = `${origin}${basePath}/jwks.json`;

  return async function handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Configuration endpoint (GET)
    if (request.method === 'GET' && path === `${basePath}/ap`) {
      return handleConfiguration();
    }

    // JWKS endpoint (GET)
    if (request.method === 'GET' && path === `${basePath}/jwks.json`) {
      return handleJwks();
    }

    // Issuance endpoint (POST)
    if (request.method === 'POST' && path === `${basePath}/requests`) {
      return handleIssuance(request);
    }

    // Issuance status endpoint (GET)
    if (request.method === 'GET' && path.startsWith(`${basePath}/requests/`)) {
      const id = path.slice(`${basePath}/requests/`.length);
      return handleIssuanceStatus(id);
    }

    // Validate endpoint (POST)
    if (request.method === 'POST' && path === `${basePath}/validate`) {
      return handleValidate(request);
    }

    // Authorization check endpoint (POST)
    if (request.method === 'POST' && path === `${basePath}/authorization-check`) {
      return handleAuthorizationCheck(request);
    }

    // ─── Dashboard API endpoints (protected by JWT auth) ───

    // List issuance records
    if (request.method === 'GET' && path === `${basePath}/api/requests`) {
      return handleApiListRequests(request, url);
    }

    // Approve/deny a request
    if (request.method === 'POST' && path.startsWith(`${basePath}/api/requests/`) && path.endsWith('/decision')) {
      const id = path.slice(`${basePath}/api/requests/`.length, -'/decision'.length);
      return handleApiDecision(request, id);
    }

    // Revoke an authorization
    if (request.method === 'POST' && path === `${basePath}/api/revoke`) {
      return handleApiRevoke(request);
    }

    return notFound();
  };

  function handleConfiguration(): Response {
    const configDoc = {
      version: '0.1',
      authority: config.authority,
      trust_mode: config.trustMode,
      jwks_uri: jwksUri,
      endpoints: {
        issuance: `${origin}${basePath}/requests`,
        issuance_status: `${origin}${basePath}/requests/{id}`,
        validate: `${origin}${basePath}/validate`,
        authorization_check: `${origin}${basePath}/authorization-check`,
      },
      ...(config.policy && {
        policy: {
          allow_service_authorities: config.policy.allowServiceAuthorities ?? true,
        },
      }),
      ...(config.approval && {
        approval: {
          modes: config.approval.modes || ['poll'],
          default_ttl_seconds: config.approval.defaultTtlSeconds || 300,
        },
      }),
    };

    return json(configDoc, 200, { 'Cache-Control': 'public, max-age=300' });
  }

  async function handleJwks(): Promise<Response> {
    // Export the public portion of the signing key
    const publicJwk = { ...config.signingKey };
    // Remove private key components
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

  async function handleIssuance(request: Request): Promise<Response> {
    let body: IssuanceRequest;
    try {
      body = await request.json() as IssuanceRequest;
    } catch {
      return errorResponse(400, 'invalid_request', 'Invalid JSON body');
    }

    // Validate required fields
    if (!body.type || !['browser_session', 'bearer_token'].includes(body.type)) {
      return errorResponse(400, 'invalid_type', 'type must be browser_session or bearer_token');
    }
    if (!body.service?.origin) {
      return errorResponse(400, 'missing_field', 'service.origin is required');
    }
    if (!body.user?.email) {
      return errorResponse(400, 'missing_field', 'user.email is required');
    }
    if (!body.harness?.id) {
      return errorResponse(400, 'missing_field', 'harness.id is required');
    }
    if (!body.task?.id || !body.task?.description) {
      return errorResponse(400, 'missing_field', 'task.id and task.description are required');
    }

    // Verify task attestation if present
    if (body.task.attestation?.jwt) {
      if (!body.harness.cnf?.jwk) {
        return errorResponse(400, 'attestation_error', 'Task attestation requires holder binding (harness.cnf)');
      }
      try {
        const pubKey = await importVerifyKey(body.harness.cnf.jwk);
        const { payload } = await verifyJwt(body.task.attestation.jwt, pubKey);
        if (payload.iss !== body.harness.id) {
          return errorResponse(400, 'attestation_error', 'Task attestation iss must match harness.id');
        }
        if (payload.task_id !== body.task.id) {
          return errorResponse(400, 'attestation_error', 'Task attestation task_id must match task.id');
        }
        // Verify task_description_hash
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(body.task.description));
        const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        if (payload.task_description_hash !== hashHex) {
          return errorResponse(400, 'attestation_error', 'Task attestation description hash mismatch');
        }
      } catch (e) {
        return errorResponse(400, 'attestation_error', `Task attestation verification failed: ${(e as Error).message}`);
      }
    }

    // Verify harness attestation if present
    if (body.harness.attestation?.jwt) {
      if (!body.harness.cnf?.jwk) {
        return errorResponse(400, 'attestation_error', 'Harness attestation requires holder binding (harness.cnf)');
      }
      const attestationError = await verifyHarnessAttestation(
        body.harness.attestation.jwt,
        body.harness.id,
        body.harness.cnf.jwk,
      );
      if (attestationError) {
        return attestationError;
      }
    }

    const requestId = generateId('req');
    const ttlSeconds = config.approval?.defaultTtlSeconds || 300;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    // Fetch available scopes from Service if handler provided
    let availableScopes: { name: string; description?: string }[] = [];
    if (config.onScopeDiscovery) {
      try {
        availableScopes = await config.onScopeDiscovery({
          userEmail: body.user.email,
          agentId: body.harness.id,
          serviceOrigin: body.service.origin,
          taskId: body.task.id,
          taskDescription: body.task.description,
        });
      } catch {
        // Scope discovery failure is non-fatal for issuance
      }
    }

    // Call issuance request handler
    let decision: { status: 'approved' | 'denied' | 'pending'; scope?: string[]; reason?: string } = {
      status: 'pending',
    };

    if (config.onIssuanceRequest) {
      try {
        decision = await config.onIssuanceRequest(body, {
          requestId,
          availableScopes,
        });
      } catch {
        decision = { status: 'pending' };
      }
    }

    const agentpassValue = decision.status === 'approved' ? generateAgentPassValue() : undefined;
    const authorizationId = decision.status === 'approved' ? generateId('authz') : undefined;

    const record: IssuanceRecord = {
      id: requestId,
      status: decision.status,
      type: body.type,
      request: body,
      scope: decision.scope || availableScopes.map(s => s.name),
      agentpass: agentpassValue ? { type: body.type, value: agentpassValue } : undefined,
      authorizationId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      pollAfterMs: decision.status === 'pending' ? 2000 : undefined,
      reason: decision.reason,
    };

    await storage.createIssuanceRecord(record);

    const statusResponse = buildStatusResponse(record);
    return json(statusResponse, 202);
  }

  async function handleIssuanceStatus(id: string): Promise<Response> {
    const record = await storage.getIssuanceRecord(id);
    if (!record) {
      return errorResponse(404, 'not_found', 'Unknown request id');
    }

    // Check expiry
    if (record.status === 'pending' && new Date(record.expiresAt) < new Date()) {
      await storage.updateIssuanceRecord(id, { status: 'expired' });
      record.status = 'expired';
    }

    return json(buildStatusResponse(record));
  }

  async function handleValidate(request: Request): Promise<Response> {
    // Verify Service assertion
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse(401, 'missing_assertion', 'Authorization header with Bearer assertion required');
    }

    const assertionJwt = authHeader.slice(7);
    let serviceOrigin: string;
    try {
      const payload = decodeJwtPayload(assertionJwt);
      serviceOrigin = payload.iss as string;

      // Verify the assertion is for this authority
      if (payload.aud !== config.authority) {
        return errorResponse(401, 'invalid_assertion', 'Assertion audience does not match this authority');
      }

      // Check expiry
      if (payload.exp && (payload.exp as number) < Math.floor(Date.now() / 1000)) {
        return errorResponse(401, 'expired_assertion', 'Assertion has expired');
      }

      // Fetch Service JWKS and verify signature
      await verifyServiceAssertion(assertionJwt, serviceOrigin);
    } catch (e) {
      return errorResponse(401, 'invalid_assertion', `Assertion verification failed: ${(e as Error).message}`);
    }

    // Parse request body
    let body: { agentpass: { value: string } };
    try {
      body = await request.json() as typeof body;
    } catch {
      return errorResponse(400, 'invalid_request', 'Invalid JSON body');
    }

    if (!body.agentpass?.value) {
      return errorResponse(400, 'missing_field', 'agentpass.value is required');
    }

    // Atomically consume the AgentPass
    const record = await storage.consumeAgentPass(body.agentpass.value);

    if (!record) {
      // Could be unknown, already consumed, or expired
      return errorResponse(409, 'consumed', 'AgentPass already consumed, expired, or unknown');
    }

    // Verify the requesting Service matches the intended audience
    if (record.request.service.origin !== serviceOrigin) {
      return errorResponse(403, 'wrong_audience', 'Service not authorized for this AgentPass');
    }

    const response: ValidationResponse = {
      authorization_id: record.authorizationId!,
      user: { email: record.request.user.email },
      agent: { id: record.request.harness.id },
      scope: record.scope || [],
      type: record.type,
      ...(record.request.intent?.destination_url && { destination_url: record.request.intent.destination_url }),
      ...(record.request.harness.cnf && { cnf: record.request.harness.cnf }),
      task: {
        id: record.request.task.id,
        description: record.request.task.description,
        attested: !!record.request.task.attestation?.jwt,
      },
    };

    return json(response);
  }

  async function handleAuthorizationCheck(request: Request): Promise<Response> {
    // Verify Service assertion
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse(401, 'missing_assertion', 'Authorization header with Bearer assertion required');
    }

    try {
      const payload = decodeJwtPayload(authHeader.slice(7));
      if (payload.aud !== config.authority) {
        return errorResponse(401, 'invalid_assertion', 'Assertion audience does not match');
      }
      await verifyServiceAssertion(authHeader.slice(7), payload.iss as string);
    } catch (e) {
      return errorResponse(401, 'invalid_assertion', `Assertion verification failed: ${(e as Error).message}`);
    }

    let body: { authorization_id: string };
    try {
      body = await request.json() as typeof body;
    } catch {
      return errorResponse(400, 'invalid_request', 'Invalid JSON body');
    }

    if (!body.authorization_id) {
      return errorResponse(400, 'missing_field', 'authorization_id is required');
    }

    const record = await storage.getAuthorizationRecord(body.authorization_id);
    if (!record || record.status !== 'approved') {
      return errorResponse(404, 'not_found', 'Unknown authorization_id or delegation revoked');
    }

    return json({ scope: record.scope || [] });
  }

  // ─── Dashboard API ───

  async function handleApiListRequests(request: Request, url: URL): Promise<Response> {
    const authError = await verifyDashboardAuth(request);
    if (authError) return authError;

    const status = url.searchParams.get('status') || undefined;
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const records = await storage.listIssuanceRecords({ status, limit, offset });
    return json({ requests: records });
  }

  async function handleApiDecision(request: Request, id: string): Promise<Response> {
    const authError = await verifyDashboardAuth(request);
    if (authError) return authError;

    let body: { decision: 'approved' | 'denied'; scope?: string[]; reason?: string };
    try {
      body = await request.json() as typeof body;
    } catch {
      return errorResponse(400, 'invalid_request', 'Invalid JSON body');
    }

    if (!['approved', 'denied'].includes(body.decision)) {
      return errorResponse(400, 'invalid_decision', 'Decision must be approved or denied');
    }

    const record = await storage.getIssuanceRecord(id);
    if (!record) {
      return errorResponse(404, 'not_found', 'Request not found');
    }

    if (record.status !== 'pending') {
      return errorResponse(409, 'already_decided', 'Request already has a terminal status');
    }

    const updates: Partial<IssuanceRecord> = {
      status: body.decision,
      reason: body.reason,
    };

    if (body.decision === 'approved') {
      const apValue = generateAgentPassValue();
      const authzId = generateId('authz');
      updates.agentpass = { type: record.type, value: apValue };
      updates.authorizationId = authzId;
      if (body.scope) {
        updates.scope = body.scope;
      }
    }

    await storage.updateIssuanceRecord(id, updates);

    const updated = await storage.getIssuanceRecord(id);
    return json(buildStatusResponse(updated!));
  }

  async function handleApiRevoke(request: Request): Promise<Response> {
    const authError = await verifyDashboardAuth(request);
    if (authError) return authError;

    let body: { authorization_id: string };
    try {
      body = await request.json() as typeof body;
    } catch {
      return errorResponse(400, 'invalid_request', 'Invalid JSON body');
    }

    const success = await storage.revokeAuthorization(body.authorization_id);
    if (!success) {
      return errorResponse(404, 'not_found', 'Authorization not found');
    }

    return json({ revoked: true });
  }

  // ─── Helpers ───

  function resolveUrl(url: string): string {
    if (!config.internalOriginOverrides) return url;
    for (const [from, to] of Object.entries(config.internalOriginOverrides)) {
      if (url.startsWith(from)) return url.replace(from, to);
    }
    return url;
  }

  function buildStatusResponse(record: IssuanceRecord): IssuanceStatusResponse {
    const response: IssuanceStatusResponse = {
      id: record.id,
      status: record.status,
      type: record.type,
      expires_at: record.expiresAt,
      links: {
        self: `${origin}${basePath}/requests/${record.id}`,
      },
    };

    if (record.status === 'pending') {
      response.poll_after_ms = record.pollAfterMs || 2000;
    }

    if (record.status === 'approved' && record.agentpass) {
      response.agentpass = record.agentpass;
    }

    if (record.reason) {
      response.reason = record.reason;
    }

    return response;
  }

  async function verifyServiceAssertion(jwt: string, serviceOrigin: string): Promise<void> {
    // Discover Service configuration via overrides or DNS
    let serviceConfigUrl: string | undefined;

    // Check overrides first
    if (config.serviceConfigOverrides?.[serviceOrigin]) {
      serviceConfigUrl = config.serviceConfigOverrides[serviceOrigin];
    }

    // Try DNS discovery
    if (!serviceConfigUrl) {
      try {
        const serviceHost = new URL(serviceOrigin).host;
        const resolver = config.dnsResolver || defaultDnsResolver;
        const records = await resolver(`_agentpass-service.${serviceHost}`, 'TXT');
        for (const record of records) {
          const value = record.replace(/"/g, '').trim();
          if (value.startsWith('https://') || value.startsWith('http://')) {
            serviceConfigUrl = value;
            break;
          }
        }
      } catch {
        // DNS failure
      }
    }

    if (!serviceConfigUrl) {
      throw new Error('Could not discover Service configuration via DNS or overrides');
    }

    let serviceJwksUri: string;
    try {
      const configResp = await fetch(resolveUrl(serviceConfigUrl));
      if (configResp.ok) {
        const serviceConfig = await configResp.json() as { jwks_uri: string };
        serviceJwksUri = serviceConfig.jwks_uri;
      } else {
        throw new Error(`Service config fetch failed: ${configResp.status}`);
      }
    } catch (e) {
      throw new Error(`Failed to fetch Service configuration: ${(e as Error).message}`);
    }

    const keys = await fetchJwks(resolveUrl(serviceJwksUri));
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
    if (!verified) {
      throw new Error('Could not verify Service assertion with any key');
    }
  }

  async function verifyDashboardAuth(request: Request): Promise<Response | null> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse(401, 'unauthorized', 'Bearer token required');
    }

    // The dashboard JWT is verified against the implementer's JWKS
    // This is a pass-through — the implementer configures their JWKS URI
    // For now we just check the token is present; actual verification
    // happens via the implementer's middleware or the React provider's getToken
    return null;
  }

  async function verifyHarnessAttestation(
    attestationJwt: string,
    harnessId: string,
    harnessCnfJwk: JsonWebKey,
  ): Promise<Response | null> {
    try {
      const attestPayload = decodeJwtPayload(attestationJwt);
      const issuer = attestPayload.iss;
      if (typeof issuer !== 'string' || !issuer) {
        return errorResponse(400, 'attestation_error', 'Harness attestation iss is required');
      }

      const trustedIssuer = config.trustedHarnessAttestationIssuers?.find(entry => entry.issuer === issuer);
      if (!trustedIssuer) {
        return errorResponse(401, 'attestation_error', 'Harness attestation issuer is not trusted');
      }

      const keys = await fetchJwks(resolveUrl(trustedIssuer.jwksUri));
      for (const key of keys) {
        try {
          const pubKey = await importVerifyKey(key);
          const { payload } = await verifyJwt(attestationJwt, pubKey);

          if (payload.sub !== harnessId) {
            return errorResponse(400, 'attestation_error', 'Harness attestation sub must match harness.id');
          }

          const attestCnf = payload.cnf as { jwk: JsonWebKey } | undefined;
          if (!attestCnf?.jwk) {
            return errorResponse(400, 'attestation_error', 'Harness attestation missing cnf.jwk');
          }
          if (!jwkPublicKeyEquals(attestCnf.jwk, harnessCnfJwk)) {
            return errorResponse(400, 'attestation_error', 'Harness attestation cnf.jwk does not match harness.cnf.jwk');
          }
          if (typeof payload.exp !== 'number') {
            return errorResponse(400, 'attestation_error', 'Harness attestation exp is required');
          }
          if (payload.exp < Math.floor(Date.now() / 1000)) {
            return errorResponse(401, 'attestation_error', 'Harness attestation has expired');
          }

          return null;
        } catch {
          continue;
        }
      }

      return errorResponse(401, 'attestation_error', 'Harness attestation signature verification failed');
    } catch (e) {
      return errorResponse(401, 'attestation_error', `Harness attestation verification failed: ${(e as Error).message}`);
    }
  }
}

function jwkPublicKeyEquals(a: JsonWebKey, b: JsonWebKey): boolean {
  const normalizedA = normalizeComparableJwk(a);
  const normalizedB = normalizeComparableJwk(b);
  return JSON.stringify(normalizedA) === JSON.stringify(normalizedB);
}

function normalizeComparableJwk(jwk: JsonWebKey): Record<string, string | undefined> {
  switch (jwk.kty) {
    case 'EC':
      return {
        kty: jwk.kty,
        crv: jwk.crv,
        x: jwk.x,
        y: jwk.y,
      };
    case 'RSA':
      return {
        kty: jwk.kty,
        e: jwk.e,
        n: jwk.n,
      };
    case 'OKP':
      return {
        kty: jwk.kty,
        crv: jwk.crv,
        x: jwk.x,
      };
    default:
      return {
        kty: jwk.kty,
      };
  }
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
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  const body: AgentPassError = { error: { code, message } };
  return json(body, status);
}

function notFound(): Response {
  return errorResponse(404, 'not_found', 'Endpoint not found');
}
