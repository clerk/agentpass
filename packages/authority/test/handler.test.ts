import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAuthorityHandler } from '../src/handler.js';
import { importSigningKey, signJwt } from '../src/crypto.js';
import { MemoryStorage } from '../src/storage.js';
import type { AuthorityConfig, IssuanceRecord } from '../src/types.js';

// Test EC key pair (P-256)
const testPrivateKey: JsonWebKey = {
  kty: 'EC',
  crv: 'P-256',
  x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU',
  y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0',
  d: 'jpsQnnGQmL-YBIffS1BSyVKhrlRhnaleIQIlZMkdBYA',
};

const testConfig: AuthorityConfig = {
  authority: 'https://authority.example.com',
  trustMode: 'federated',
  signingKey: testPrivateKey,
  signingKeyId: 'test-key-1',
  approval: {
    modes: ['poll'],
    defaultTtlSeconds: 300,
  },
};

function makeIssuanceBody(overrides = {}) {
  return {
    type: 'bearer_token',
    service: { origin: 'https://service.example.com' },
    user: { email: 'alex@example.com' },
    harness: { id: 'test-harness' },
    task: {
      id: 'task_001',
      description: 'Test task description',
    },
    ...overrides,
  };
}

describe('Authority Handler', () => {
  let storage: MemoryStorage;
  let handler: ReturnType<typeof createAuthorityHandler>;

  beforeEach(() => {
    storage = new MemoryStorage();
    handler = createAuthorityHandler(testConfig, storage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('GET /agentpass-authority/ap (configuration)', () => {
    it('returns Authority configuration document', async () => {
      const req = new Request('https://authority.example.com/agentpass-authority/ap');
      const res = await handler(req);
      expect(res.status).toBe(200);

      const body = await res.json() as Record<string, unknown>;
      expect(body.version).toBe('0.1');
      expect(body.authority).toBe('https://authority.example.com');
      expect(body.trust_mode).toBe('federated');
      expect(body.jwks_uri).toBe('https://authority.example.com/agentpass-authority/jwks.json');
      expect((body.endpoints as Record<string, string>).issuance).toContain('/requests');
      expect((body.endpoints as Record<string, string>).validate).toContain('/validate');
    });
  });

  describe('GET /agentpass-authority/jwks.json', () => {
    it('returns public key without private components', async () => {
      const req = new Request('https://authority.example.com/agentpass-authority/jwks.json');
      const res = await handler(req);
      expect(res.status).toBe(200);

      const body = await res.json() as { keys: JsonWebKey[] };
      expect(body.keys).toHaveLength(1);
      expect(body.keys[0].d).toBeUndefined();
      expect(body.keys[0].kty).toBe('EC');
    });
  });

  describe('POST /agentpass-authority/requests (issuance)', () => {
    it('creates a pending issuance request', async () => {
      const req = new Request('https://authority.example.com/agentpass-authority/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeIssuanceBody()),
      });

      const res = await handler(req);
      expect(res.status).toBe(202);

      const body = await res.json() as Record<string, unknown>;
      expect(body.status).toBe('pending');
      expect(body.id).toBeDefined();
      expect(body.poll_after_ms).toBeDefined();
    });

    it('returns 400 for missing required fields', async () => {
      const req = new Request('https://authority.example.com/agentpass-authority/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'bearer_token' }),
      });

      const res = await handler(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid type', async () => {
      const req = new Request('https://authority.example.com/agentpass-authority/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeIssuanceBody({ type: 'invalid' })),
      });

      const res = await handler(req);
      expect(res.status).toBe(400);
    });

    it('immediately approves when handler returns approved', async () => {
      const approveHandler = createAuthorityHandler(
        {
          ...testConfig,
          onIssuanceRequest: async () => ({
            status: 'approved',
            scope: ['read', 'write'],
          }),
        },
        storage,
      );

      const req = new Request('https://authority.example.com/agentpass-authority/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeIssuanceBody()),
      });

      const res = await approveHandler(req);
      expect(res.status).toBe(202);

      const body = await res.json() as Record<string, unknown>;
      expect(body.status).toBe('approved');
      expect(body.agentpass).toBeDefined();
    });
  });

  describe('GET /agentpass-authority/requests/:id (status)', () => {
    it('returns status of existing request', async () => {
      // Create a request first
      const createReq = new Request('https://authority.example.com/agentpass-authority/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeIssuanceBody()),
      });

      const createRes = await handler(createReq);
      const { id } = await createRes.json() as { id: string };

      // Check status
      const statusReq = new Request(`https://authority.example.com/agentpass-authority/requests/${id}`);
      const statusRes = await handler(statusReq);
      expect(statusRes.status).toBe(200);

      const body = await statusRes.json() as Record<string, unknown>;
      expect(body.id).toBe(id);
      expect(body.status).toBe('pending');
    });

    it('returns 404 for unknown id', async () => {
      const req = new Request('https://authority.example.com/agentpass-authority/requests/unknown-id');
      const res = await handler(req);
      expect(res.status).toBe(404);
    });
  });

  describe('Dashboard API', () => {
    it('lists requests with Bearer auth', async () => {
      // Create a request
      const createReq = new Request('https://authority.example.com/agentpass-authority/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeIssuanceBody()),
      });
      await handler(createReq);

      // List
      const listReq = new Request('https://authority.example.com/agentpass-authority/api/requests', {
        headers: { Authorization: 'Bearer test-token' },
      });
      const res = await handler(listReq);
      expect(res.status).toBe(200);

      const body = await res.json() as { requests: unknown[] };
      expect(body.requests.length).toBeGreaterThan(0);
    });

    it('approves a pending request via decision API', async () => {
      // Create a request
      const createReq = new Request('https://authority.example.com/agentpass-authority/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeIssuanceBody()),
      });
      const createRes = await handler(createReq);
      const { id } = await createRes.json() as { id: string };

      // Approve
      const approveReq = new Request(`https://authority.example.com/agentpass-authority/api/requests/${id}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({ decision: 'approved', scope: ['read'] }),
      });
      const res = await handler(approveReq);
      expect(res.status).toBe(200);

      const body = await res.json() as Record<string, unknown>;
      expect(body.status).toBe('approved');
      expect(body.agentpass).toBeDefined();
    });

    it('denies a pending request via decision API', async () => {
      const createReq = new Request('https://authority.example.com/agentpass-authority/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeIssuanceBody()),
      });
      const createRes = await handler(createReq);
      const { id } = await createRes.json() as { id: string };

      const denyReq = new Request(`https://authority.example.com/agentpass-authority/api/requests/${id}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({ decision: 'denied', reason: 'Not authorized' }),
      });
      const res = await handler(denyReq);
      expect(res.status).toBe(200);

      const body = await res.json() as Record<string, unknown>;
      expect(body.status).toBe('denied');
    });
  });

  describe('Validation and authorization check', () => {
    it('returns authorization_expires_at from the validation endpoint', async () => {
      const serviceKeys = await generateEcJwkPair();
      const fetchMock = mockServiceDiscovery(serviceKeys.publicJwk);
      const authorizationExpiresAt = new Date(Date.now() + 3600000).toISOString();
      const authorityHandler = createAuthorityHandler(
        {
          ...testConfig,
          serviceConfigOverrides: {
            'https://service.example.com': 'https://service.example.com/config.json',
          },
        },
        storage,
      );

      await storage.createIssuanceRecord(makeValidationRecord({
        agentpass: { type: 'bearer_token', value: 'ap_validate' },
        authorizationId: 'authz_validate',
        authorizationExpiresAt,
      }));

      const req = new Request('https://authority.example.com/agentpass-authority/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await signServiceAssertion(serviceKeys.privateJwk)}`,
        },
        body: JSON.stringify({ agentpass: { value: 'ap_validate' } }),
      });

      const res = await authorityHandler(req);
      expect(res.status).toBe(200);

      const body = await res.json() as { authorization_expires_at: string };
      expect(body.authorization_expires_at).toBe(authorizationExpiresAt);
      expect(fetchMock).toHaveBeenCalled();
    });

    it('returns authorization_expires_at from authorization check and rejects expired delegations', async () => {
      const serviceKeys = await generateEcJwkPair();
      mockServiceDiscovery(serviceKeys.publicJwk);
      const authorizationExpiresAt = new Date(Date.now() + 3600000).toISOString();
      const authorityHandler = createAuthorityHandler(
        {
          ...testConfig,
          serviceConfigOverrides: {
            'https://service.example.com': 'https://service.example.com/config.json',
          },
        },
        storage,
      );

      await storage.createIssuanceRecord(makeValidationRecord({
        id: 'req_active',
        authorizationId: 'authz_active',
        authorizationExpiresAt,
      }));
      await storage.createIssuanceRecord(makeValidationRecord({
        id: 'req_expired',
        authorizationId: 'authz_expired',
        authorizationExpiresAt: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      }));

      const activeReq = new Request('https://authority.example.com/agentpass-authority/authorization-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await signServiceAssertion(serviceKeys.privateJwk)}`,
        },
        body: JSON.stringify({ authorization_id: 'authz_active' }),
      });

      const activeRes = await authorityHandler(activeReq);
      expect(activeRes.status).toBe(200);
      const activeBody = await activeRes.json() as { authorization_expires_at: string; scope: string[] };
      expect(activeBody.authorization_expires_at).toBe(authorizationExpiresAt);
      expect(activeBody.scope).toEqual(['read']);

      const expiredReq = new Request('https://authority.example.com/agentpass-authority/authorization-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await signServiceAssertion(serviceKeys.privateJwk)}`,
        },
        body: JSON.stringify({ authorization_id: 'authz_expired' }),
      });

      const expiredRes = await authorityHandler(expiredReq);
      expect(expiredRes.status).toBe(404);
    });
  });

  describe('404 for unknown routes', () => {
    it('returns 404', async () => {
      const req = new Request('https://authority.example.com/unknown');
      const res = await handler(req);
      expect(res.status).toBe(404);
    });
  });
});

function makeValidationRecord(overrides: Partial<IssuanceRecord> = {}): IssuanceRecord {
  return {
    id: 'req_validate',
    status: 'approved',
    type: 'bearer_token',
    request: {
      type: 'bearer_token',
      service: { origin: 'https://service.example.com' },
      user: { email: 'alex@example.com' },
      harness: { id: 'test-harness' },
      task: { id: 'task_001', description: 'Test task description' },
    },
    scope: ['read'],
    agentpass: { type: 'bearer_token', value: 'ap_default' },
    authorizationId: 'authz_default',
    authorizationExpiresAt: new Date(Date.now() + 300000).toISOString(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    ...overrides,
  };
}

async function generateEcJwkPair(): Promise<{ privateJwk: JsonWebKey; publicJwk: JsonWebKey }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );

  return {
    privateJwk: await crypto.subtle.exportKey('jwk', keyPair.privateKey),
    publicJwk: await crypto.subtle.exportKey('jwk', keyPair.publicKey),
  };
}

function mockServiceDiscovery(servicePublicJwk: JsonWebKey) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (url === 'https://service.example.com/config.json') {
      return new Response(JSON.stringify({ jwks_uri: 'https://service.example.com/jwks.json' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === 'https://service.example.com/jwks.json') {
      return new Response(JSON.stringify({ keys: [servicePublicJwk] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch to ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function signServiceAssertion(privateJwk: JsonWebKey): Promise<string> {
  const signingKey = await importSigningKey(privateJwk);
  const now = Math.floor(Date.now() / 1000);

  return signJwt(
    {
      iss: 'https://service.example.com',
      aud: 'https://authority.example.com',
      iat: now,
      exp: now + 60,
    },
    signingKey,
    'service-key-1',
  );
}
