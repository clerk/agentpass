import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServiceHandler } from '../src/handler.js';
import type { ServiceConfig, AuthorityValidationResponse } from '../src/types.js';

const testPrivateKey: JsonWebKey = {
  kty: 'EC',
  crv: 'P-256',
  x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU',
  y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0',
  d: 'jpsQnnGQmL-YBIffS1BSyVKhrlRhnaleIQIlZMkdBYA',
};

const baseConfig: ServiceConfig = {
  origin: 'https://service.example.com',
  name: 'Test Service',
  trust: {
    trustedFederatedAuthorities: [
      {
        authority: 'https://authority.example.com',
        authority_configuration_url: 'https://authority.example.com/ap',
      },
    ],
  },
  signingKey: testPrivateKey,
  signingKeyId: 'svc-key-1',
  onScopeDiscovery: async () => [
    { name: 'read', description: 'Read access' },
    { name: 'write', description: 'Write access' },
  ],
  onRedeemBrowserSession: async (params) => ({
    initialization_url: `https://service.example.com/init?user=${encodeURIComponent(params.userEmail)}`,
    expires_at: new Date(Date.now() + 300000).toISOString(),
  }),
  onRedeemBearerToken: async (params) => ({
    bearer_token: `tok_${params.userEmail}_${Date.now()}`,
    scope: params.scope,
    expires_in: 3600,
  }),
  dnsResolver: async () => [], // No enterprise DNS by default
};

describe('Service Handler', () => {
  let handler: ReturnType<typeof createServiceHandler>;

  beforeEach(() => {
    handler = createServiceHandler(baseConfig);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('GET /agentpass-service/config.json (configuration)', () => {
    it('returns Service configuration document', async () => {
      const req = new Request('https://service.example.com/agentpass-service/config.json');
      const res = await handler(req);
      expect(res.status).toBe(200);

      const body = await res.json() as Record<string, unknown>;
      expect(body.version).toBe('0.1');
      expect(body.kind).toBe('service');
      expect((body.service as Record<string, string>).origin).toBe('https://service.example.com');
      expect((body.service as Record<string, string>).name).toBe('Test Service');
      expect(body.jwks_uri).toBe('https://service.example.com/agentpass-service/jwks.json');

      const endpoints = body.endpoints as Record<string, string>;
      expect(endpoints.resolve_authorities).toContain('/agentpass/resolve-authorities');
      expect(endpoints.redeem_browser_session).toContain('/agentpass/redeem-browser-session');
      expect(endpoints.redeem_bearer_token).toContain('/agentpass/redeem-bearer-token');
      expect(endpoints.available_scopes).toContain('/agentpass/scopes');
    });
  });

  describe('GET /agentpass-service/jwks.json', () => {
    it('returns public keys', async () => {
      const req = new Request('https://service.example.com/agentpass-service/jwks.json');
      const res = await handler(req);
      expect(res.status).toBe(200);

      const body = await res.json() as { keys: JsonWebKey[] };
      expect(body.keys).toHaveLength(1);
      expect(body.keys[0].d).toBeUndefined();
    });
  });

  describe('POST /agentpass-service/agentpass/resolve-authorities', () => {
    it('returns federated authorities when no enterprise DNS', async () => {
      const req = new Request('https://service.example.com/agentpass-service/agentpass/resolve-authorities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: { email: 'alex@example.com' } }),
      });

      const res = await handler(req);
      expect(res.status).toBe(200);

      const body = await res.json() as { trusted_federated_authorities: unknown[] };
      expect(body.trusted_federated_authorities).toHaveLength(1);
    });

    it('returns 400 for missing email', async () => {
      const req = new Request('https://service.example.com/agentpass-service/agentpass/resolve-authorities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: {} }),
      });

      const res = await handler(req);
      expect(res.status).toBe(400);
    });

    it('returns 403 when domain has none', async () => {
      const noneHandler = createServiceHandler({
        ...baseConfig,
        dnsResolver: async () => ['"none"'],
      });

      const req = new Request('https://service.example.com/agentpass-service/agentpass/resolve-authorities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: { email: 'alex@disabled.com' } }),
      });

      const res = await noneHandler(req);
      expect(res.status).toBe(403);
    });

    it('prefers service authority over federated authorities when no enterprise DNS exists', async () => {
      const serviceAuthorityHandler = createServiceHandler({
        ...baseConfig,
        trust: {
          ...baseConfig.trust,
          serviceAuthority: {
            authority: 'https://service-authority.example.com',
            authority_configuration_url: 'https://service-authority.example.com/ap',
          },
        },
      });

      const req = new Request('https://service.example.com/agentpass-service/agentpass/resolve-authorities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: { email: 'alex@example.com' } }),
      });

      const res = await serviceAuthorityHandler(req);
      expect(res.status).toBe(200);

      const body = await res.json() as { service_authority: { authority: string } };
      expect(body.service_authority.authority).toBe('https://service-authority.example.com');
    });

    it('uses custom resolver when provided', async () => {
      const customHandler = createServiceHandler({
        ...baseConfig,
        onResolveAuthority: async () => ({
          service_authority: {
            authority: 'https://custom.example.com',
            authority_configuration_url: 'https://custom.example.com/ap',
          },
        }),
      });

      const req = new Request('https://service.example.com/agentpass-service/agentpass/resolve-authorities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: { email: 'alex@example.com' } }),
      });

      const res = await customHandler(req);
      expect(res.status).toBe(200);

      const body = await res.json() as { service_authority: { authority: string } };
      expect(body.service_authority.authority).toBe('https://custom.example.com');
    });
  });

  describe('POST /agentpass-service/agentpass/redeem-bearer-token', () => {
    it('returns 400 for missing fields', async () => {
      const req = new Request('https://service.example.com/agentpass-service/agentpass/redeem-bearer-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const res = await handler(req);
      expect(res.status).toBe(400);
    });

    it('returns 403 for untrusted authority', async () => {
      const req = new Request('https://service.example.com/agentpass-service/agentpass/redeem-bearer-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentpass: { type: 'bearer_token', value: 'ap_test' },
          authority: 'https://untrusted.example.com',
        }),
      });

      const res = await handler(req);
      expect(res.status).toBe(403);
    });

    it('returns 400 for wrong type', async () => {
      const req = new Request('https://service.example.com/agentpass-service/agentpass/redeem-bearer-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentpass: { type: 'browser_session', value: 'ap_test' },
          authority: 'https://authority.example.com',
        }),
      });

      const res = await handler(req);
      expect(res.status).toBe(400);
    });

    it('passes authorization expiry to the redemption handler and caps expires_in', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-18T15:00:00.000Z'));

      const authorizationExpiresAt = '2026-03-18T15:01:30.000Z';
      const signingKey = await generateEcPrivateJwk();
      mockAuthorityValidation({ authorization_expires_at: authorizationExpiresAt });
      const onRedeemBearerToken = vi.fn(async (params) => ({
        bearer_token: `tok_${params.userEmail}`,
        scope: params.scope,
        expires_in: 3600,
      }));
      const cappedHandler = createServiceHandler({
        ...baseConfig,
        signingKey,
        onRedeemBearerToken,
      });

      const req = new Request('https://service.example.com/agentpass-service/agentpass/redeem-bearer-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentpass: { type: 'bearer_token', value: 'ap_test' },
          authority: 'https://authority.example.com',
        }),
      });

      const res = await cappedHandler(req);
      expect(res.status).toBe(200);

      const body = await res.json() as { expires_in: number };
      expect(body.expires_in).toBe(90);
      expect(onRedeemBearerToken).toHaveBeenCalledWith(expect.objectContaining({
        authorizationExpiresAt,
      }));
    });

    it('rejects bearer-token redemption when delegation is already expired', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-18T15:00:00.000Z'));

      const signingKey = await generateEcPrivateJwk();
      mockAuthorityValidation({ authorization_expires_at: '2026-03-18T14:59:59.000Z' });
      const onRedeemBearerToken = vi.fn(baseConfig.onRedeemBearerToken);
      const expiredHandler = createServiceHandler({
        ...baseConfig,
        signingKey,
        onRedeemBearerToken,
      });

      const req = new Request('https://service.example.com/agentpass-service/agentpass/redeem-bearer-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentpass: { type: 'bearer_token', value: 'ap_test' },
          authority: 'https://authority.example.com',
        }),
      });

      const res = await expiredHandler(req);
      expect(res.status).toBe(422);
      expect(onRedeemBearerToken).not.toHaveBeenCalled();
    });

    it('normalizes negative expires_in values to zero', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-18T15:00:00.000Z'));

      const signingKey = await generateEcPrivateJwk();
      mockAuthorityValidation({ authorization_expires_at: '2026-03-18T15:05:00.000Z' });
      const zeroFloorHandler = createServiceHandler({
        ...baseConfig,
        signingKey,
        onRedeemBearerToken: async () => ({
          bearer_token: 'tok_negative',
          scope: ['read'],
          expires_in: -1,
        }),
      });

      const req = new Request('https://service.example.com/agentpass-service/agentpass/redeem-bearer-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentpass: { type: 'bearer_token', value: 'ap_test' },
          authority: 'https://authority.example.com',
        }),
      });

      const res = await zeroFloorHandler(req);
      expect(res.status).toBe(200);

      const body = await res.json() as { expires_in: number };
      expect(body.expires_in).toBe(0);
    });
  });

  describe('POST /agentpass-service/agentpass/redeem-browser-session', () => {
    it('returns 400 for wrong type', async () => {
      const req = new Request('https://service.example.com/agentpass-service/agentpass/redeem-browser-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentpass: { type: 'bearer_token', value: 'ap_test' },
          authority: 'https://authority.example.com',
        }),
      });

      const res = await handler(req);
      expect(res.status).toBe(400);
    });

    it('passes authorization expiry to the browser-session handler and caps expires_at', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-18T15:00:00.000Z'));

      const authorizationExpiresAt = '2026-03-18T15:02:00.000Z';
      const signingKey = await generateEcPrivateJwk();
      mockAuthorityValidation({
        type: 'browser_session',
        authorization_expires_at: authorizationExpiresAt,
      });
      const onRedeemBrowserSession = vi.fn(async (params) => ({
        initialization_url: `https://service.example.com/init?user=${encodeURIComponent(params.userEmail)}`,
        expires_at: '2026-03-18T15:10:00.000Z',
      }));
      const cappedHandler = createServiceHandler({
        ...baseConfig,
        signingKey,
        onRedeemBrowserSession,
      });

      const req = new Request('https://service.example.com/agentpass-service/agentpass/redeem-browser-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentpass: { type: 'browser_session', value: 'ap_test' },
          authority: 'https://authority.example.com',
        }),
      });

      const res = await cappedHandler(req);
      expect(res.status).toBe(200);

      const body = await res.json() as { expires_at: string };
      expect(body.expires_at).toBe(authorizationExpiresAt);
      expect(onRedeemBrowserSession).toHaveBeenCalledWith(expect.objectContaining({
        authorizationExpiresAt,
      }));
    });
  });

  describe('404 for unknown routes', () => {
    it('returns 404', async () => {
      const req = new Request('https://service.example.com/unknown');
      const res = await handler(req);
      expect(res.status).toBe(404);
    });
  });
});

function mockAuthorityValidation(overrides: Partial<AuthorityValidationResponse> = {}) {
  const validationResponse: AuthorityValidationResponse = {
    authorization_id: 'authz_test',
    authorization_expires_at: '2026-03-18T15:05:00.000Z',
    user: { email: 'alex@example.com' },
    agent: { id: 'test-harness' },
    scope: ['read'],
    type: 'bearer_token',
    ...overrides,
  };

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (url === 'https://authority.example.com/ap') {
      return new Response(JSON.stringify({
        authority: 'https://authority.example.com',
        trust_mode: 'federated',
        jwks_uri: 'https://authority.example.com/jwks.json',
        endpoints: {
          issuance: 'https://authority.example.com/issue',
          issuance_status: 'https://authority.example.com/requests/{id}',
          validate: 'https://authority.example.com/validate',
          authorization_check: 'https://authority.example.com/authorization-check',
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://authority.example.com/validate') {
      expect(init?.method).toBe('POST');
      return new Response(JSON.stringify(validationResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch to ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function generateEcPrivateJwk(): Promise<JsonWebKey> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );

  return crypto.subtle.exportKey('jwk', keyPair.privateKey);
}
