/**
 * AgentPass Authority SDK Types
 * Spec version: 0.1
 */

// ─── Configuration ───

export interface AuthorityConfig {
  /** HTTPS authority identifier */
  authority: string;
  /** Trust mode: enterprise, federated, or service */
  trustMode: 'enterprise' | 'federated' | 'service';
  /** Base path for authority endpoints (default: '/agentpass-authority') */
  basePath?: string;
  /** Policy settings */
  policy?: {
    /** When false, Services MUST NOT use a Service Authority for users of this Enterprise Authority's domain. Default: true */
    allowServiceAuthorities?: boolean;
  };
  /** Approval hints */
  approval?: {
    modes?: ('poll')[];
    defaultTtlSeconds?: number;
  };
  /** Handler called when a new issuance request arrives. If not provided, all requests go to pending. */
  onIssuanceRequest?: IssuanceRequestHandler;
  /** Handler to fetch available scopes from a Service (Authority calls Service's available_scopes endpoint) */
  onScopeDiscovery?: ScopeDiscoveryHandler;
  /** Signing key for Authority JWT assertions (JWK private key) */
  signingKey: JsonWebKey;
  /** Key ID for the signing key */
  signingKeyId: string;
  /** Map of public origins to internal origins for Docker/container networking */
  internalOriginOverrides?: Record<string, string>;
  /** Optional DNS resolver for service discovery (defaults to DNS-over-HTTPS) */
  dnsResolver?: DnsResolver;
  /** Override service discovery for specific origins (bypasses DNS). Maps service origin → service configuration URL */
  serviceConfigOverrides?: Record<string, string>;
}

// ─── DNS ───

export type DnsResolver = (name: string, type: string) => Promise<string[]>;

// ─── Issuance ───

export interface IssuanceRequest {
  type: 'browser_session' | 'bearer_token';
  service: { origin: string };
  user: { email: string };
  harness: {
    id: string;
    cnf?: { jwk: JsonWebKey };
    attestation?: { jwt: string };
  };
  task: {
    id: string;
    description: string;
    attestation?: { jwt: string };
  };
  intent?: { destination_url?: string };
}

export interface IssuanceRecord {
  id: string;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'canceled';
  type: 'browser_session' | 'bearer_token';
  request: IssuanceRequest;
  scope?: string[];
  agentpass?: { type: string; value: string };
  authorizationId?: string;
  createdAt: string;
  expiresAt: string;
  pollAfterMs?: number;
  reason?: string;
}

export type IssuanceRequestHandler = (
  request: IssuanceRequest,
  ctx: IssuanceContext,
) => Promise<IssuanceDecision>;

export interface IssuanceContext {
  requestId: string;
  availableScopes: ScopeItem[];
}

export interface IssuanceDecision {
  status: 'approved' | 'denied' | 'pending';
  scope?: string[];
  reason?: string;
}

export interface ScopeDiscoveryHandler {
  (params: {
    userEmail: string;
    agentId: string;
    serviceOrigin: string;
    taskId?: string;
    taskDescription?: string;
  }): Promise<ScopeItem[]>;
}

// ─── Validation ───

export interface ValidationRequest {
  agentpass: { value: string };
}

export interface ValidationResponse {
  authorization_id: string;
  user: { email: string };
  agent: { id: string };
  scope: string[];
  type: 'browser_session' | 'bearer_token';
  destination_url?: string;
  cnf?: { jwk: JsonWebKey };
  task?: {
    id: string;
    description: string;
    attested?: boolean;
  };
}

// ─── Authorization Check ───

export interface AuthorizationCheckRequest {
  authorization_id: string;
}

export interface AuthorizationCheckResponse {
  scope: string[];
}

// ─── Scope ───

export interface ScopeItem {
  name: string;
  description?: string;
}

// ─── Status Response ───

export interface IssuanceStatusResponse {
  id: string;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'canceled';
  type?: 'browser_session' | 'bearer_token';
  expires_at?: string;
  poll_after_ms?: number;
  reason?: string;
  agentpass?: { type: string; value: string };
  links?: { self?: string; events?: string };
}

// ─── Storage Interface ───

export interface AuthorityStorage {
  createIssuanceRecord(record: IssuanceRecord): Promise<void>;
  getIssuanceRecord(id: string): Promise<IssuanceRecord | null>;
  updateIssuanceRecord(id: string, updates: Partial<IssuanceRecord>): Promise<void>;
  listIssuanceRecords(options?: { status?: string; limit?: number; offset?: number }): Promise<IssuanceRecord[]>;
  consumeAgentPass(value: string): Promise<IssuanceRecord | null>;
  getAuthorizationRecord(authorizationId: string): Promise<IssuanceRecord | null>;
  revokeAuthorization(authorizationId: string): Promise<boolean>;
}

// ─── Error ───

export interface AgentPassError {
  error: {
    code: string;
    message: string;
  };
}
