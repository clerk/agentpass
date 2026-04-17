import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAuthorityHandler } from '../src/handler.js';
import { importSigningKey, signJwt } from '../src/crypto.js';
import { MemoryStorage } from '../src/storage.js';
import type { AuthorityConfig } from '../src/types.js';

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

    it('accepts a harness attestation from a pinned trusted issuer', async () => {
      const harnessKeys = await generateEcJwkPair();
      const attestorKeys = await generateEcJwkPair();
      const attestationJwt = await signHarnessAttestation({
        privateJwk: attestorKeys.privateJwk,
        issuer: 'https://attestor.example.com',
        subject: 'test-harness',
        harnessJwk: harnessKeys.publicJwk,
      });

      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

        if (url === 'https://attestor.example.com/jwks.json') {
          return new Response(JSON.stringify({ keys: [attestorKeys.publicJwk] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        throw new Error(`Unexpected fetch to ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const trustedHandler = createAuthorityHandler(
        {
          ...testConfig,
          trustedHarnessAttestationIssuers: [
            {
              issuer: 'https://attestor.example.com',
              jwksUri: 'https://attestor.example.com/jwks.json',
            },
          ],
        },
        storage,
      );

      const req = new Request('https://authority.example.com/agentpass-authority/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeIssuanceBody({
          harness: {
            id: 'test-harness',
            cnf: { jwk: harnessKeys.publicJwk },
            attestation: { jwt: attestationJwt },
          },
        })),
      });

      const res = await trustedHandler(req);
      expect(res.status).toBe(202);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('https://attestor.example.com/jwks.json');
    });

    it('rejects a harness attestation from an untrusted issuer without dereferencing issuer URLs', async () => {
      const harnessKeys = await generateEcJwkPair();
      const attestorKeys = await generateEcJwkPair();
      const attestationJwt = await signHarnessAttestation({
        privateJwk: attestorKeys.privateJwk,
        issuer: 'https://attestor.example.com',
        subject: 'test-harness',
        harnessJwk: harnessKeys.publicJwk,
      });

      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const req = new Request('https://authority.example.com/agentpass-authority/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeIssuanceBody({
          harness: {
            id: 'test-harness',
            cnf: { jwk: harnessKeys.publicJwk },
            attestation: { jwt: attestationJwt },
          },
        })),
      });

      const res = await handler(req);
      expect(res.status).toBe(401);

      const body = await res.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('attestation_error');
      expect(body.error.message).toContain('not trusted');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a harness attestation whose sub does not match harness.id', async () => {
      const harnessKeys = await generateEcJwkPair();
      const attestorKeys = await generateEcJwkPair();
      const attestationJwt = await signHarnessAttestation({
        privateJwk: attestorKeys.privateJwk,
        issuer: 'https://attestor.example.com',
        subject: 'different-harness',
        harnessJwk: harnessKeys.publicJwk,
      });

      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ keys: [attestorKeys.publicJwk] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
      vi.stubGlobal('fetch', fetchMock);

      const trustedHandler = createAuthorityHandler(
        {
          ...testConfig,
          trustedHarnessAttestationIssuers: [
            {
              issuer: 'https://attestor.example.com',
              jwksUri: 'https://attestor.example.com/jwks.json',
            },
          ],
        },
        storage,
      );

      const req = new Request('https://authority.example.com/agentpass-authority/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeIssuanceBody({
          harness: {
            id: 'test-harness',
            cnf: { jwk: harnessKeys.publicJwk },
            attestation: { jwt: attestationJwt },
          },
        })),
      });

      const res = await trustedHandler(req);
      expect(res.status).toBe(400);

      const body = await res.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('attestation_error');
      expect(body.error.message).toContain('sub must match harness.id');
    });

    it('accepts equivalent harness attestation cnf.jwk values with different metadata or field order', async () => {
      const harnessKeys = await generateEcJwkPair();
      const attestorKeys = await generateEcJwkPair();
      const attestationJwt = await signHarnessAttestation({
        privateJwk: attestorKeys.privateJwk,
        issuer: 'https://attestor.example.com',
        subject: 'test-harness',
        harnessJwk: {
          y: harnessKeys.publicJwk.y,
          x: harnessKeys.publicJwk.x,
          crv: harnessKeys.publicJwk.crv,
          kty: harnessKeys.publicJwk.kty,
          kid: 'vendor-key-1',
          use: 'sig',
        },
      });

      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ keys: [attestorKeys.publicJwk] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
      vi.stubGlobal('fetch', fetchMock);

      const trustedHandler = createAuthorityHandler(
        {
          ...testConfig,
          trustedHarnessAttestationIssuers: [
            {
              issuer: 'https://attestor.example.com',
              jwksUri: 'https://attestor.example.com/jwks.json',
            },
          ],
        },
        storage,
      );

      const req = new Request('https://authority.example.com/agentpass-authority/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeIssuanceBody({
          harness: {
            id: 'test-harness',
            cnf: { jwk: harnessKeys.publicJwk },
            attestation: { jwt: attestationJwt },
          },
        })),
      });

      const res = await trustedHandler(req);
      expect(res.status).toBe(202);
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

  describe('404 for unknown routes', () => {
    it('returns 404', async () => {
      const req = new Request('https://authority.example.com/unknown');
      const res = await handler(req);
      expect(res.status).toBe(404);
    });
  });
});

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

async function signHarnessAttestation(params: {
  privateJwk: JsonWebKey;
  issuer: string;
  subject: string;
  harnessJwk: JsonWebKey;
}): Promise<string> {
  const signingKey = await importSigningKey(params.privateJwk);
  const now = Math.floor(Date.now() / 1000);

  return signJwt(
    {
      iss: params.issuer,
      sub: params.subject,
      cnf: { jwk: params.harnessJwk },
      iat: now,
      exp: now + 60,
    },
    signingKey,
    'attestor-key-1',
  );
}
