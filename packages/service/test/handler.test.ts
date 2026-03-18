import { describe, it, expect, beforeEach } from 'vitest';
import { createServiceHandler } from '../src/handler.js';
import type { ServiceConfig } from '../src/types.js';

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
  });

  describe('404 for unknown routes', () => {
    it('returns 404', async () => {
      const req = new Request('https://service.example.com/unknown');
      const res = await handler(req);
      expect(res.status).toBe(404);
    });
  });
});
