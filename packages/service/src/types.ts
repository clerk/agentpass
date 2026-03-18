/**
 * AgentPass Service SDK Types
 * Spec version: 0.1
 */

// ─── Configuration ───

export interface ServiceConfig {
  /** Service origin (HTTPS) */
  origin: string;
  /** Human-readable service name */
  name?: string;
  /** Trust configuration */
  trust: {
    /** Federated Authorities this Service trusts */
    trustedFederatedAuthorities?: TrustEntry[];
    /** Service Authority (if this Service operates its own Authority) */
    serviceAuthority?: TrustEntry;
  };
  /** Base path for service endpoints (default: '') */
  basePath?: string;
  /** Signing key for Service JWT assertions (JWK private key) */
  signingKey: JsonWebKey;
  /** Key ID for the signing key */
  signingKeyId: string;
  /** Handler to resolve available scopes for a user/agent context */
  onScopeDiscovery: ScopeDiscoveryHandler;
  /** Handler for browser session redemption — must return an initialization URL */
  onRedeemBrowserSession: BrowserSessionRedemptionHandler;
  /** Handler for bearer token redemption — must return a bearer token */
  onRedeemBearerToken: BearerTokenRedemptionHandler;
  /** Optional: Custom authority resolution logic. If not provided, uses default spec algorithm. */
  onResolveAuthority?: AuthorityResolutionHandler;
  /** Optional DNS resolver for authority discovery (defaults to DNS-over-HTTPS) */
  dnsResolver?: DnsResolver;
  /** Override authority discovery for specific email domains (bypasses DNS). Maps email domain → authority configuration URL */
  authorityConfigOverrides?: Record<string, string>;
  /** Map of public origins to internal origins for Docker/container networking */
  internalOriginOverrides?: Record<string, string>;
  /** Replay store for holder-binding proofs. Required for cnf-bound redemptions. */
  harnessProofReplayStore?: HarnessProofReplayStore;
}

export interface TrustEntry {
  authority: string;
  authority_configuration_url: string;
}

// ─── Scope Discovery ───

export type ScopeDiscoveryHandler = (params: {
  userEmail: string;
  agentId: string;
  taskId?: string;
  taskDescription?: string;
}) => Promise<ScopeItem[]>;

export interface ScopeItem {
  name: string;
  description?: string;
}

export interface HarnessProofReplayStore {
  /**
   * Atomically stores a proof key until its expiry.
   * Returns true if stored for the first time, false if the proof was already seen.
   */
  checkAndStore(proofKey: string, expiresAt: Date): Promise<boolean>;
}

// ─── Browser Session Redemption ───

export type BrowserSessionRedemptionHandler = (params: {
  userEmail: string;
  agentId: string;
  scope: string[];
  destinationUrl?: string;
  taskId?: string;
  taskDescription?: string;
  authorizationId: string;
}) => Promise<{
  initialization_url: string;
  expires_at?: string;
}>;

// ─── Bearer Token Redemption ───

export type BearerTokenRedemptionHandler = (params: {
  userEmail: string;
  agentId: string;
  scope: string[];
  taskId?: string;
  taskDescription?: string;
  authorizationId: string;
}) => Promise<{
  bearer_token: string;
  scope?: string[];
  expires_in?: number;
}>;

// ─── Authority Resolution ───

export type AuthorityResolutionHandler = (params: {
  userEmail: string;
}) => Promise<AuthorityResolutionResult>;

export type AuthorityResolutionResult =
  | { enterprise_authority: TrustEntry }
  | { trusted_federated_authorities: TrustEntry[] }
  | { service_authority: TrustEntry };

// ─── DNS ───

export type DnsResolver = (name: string, type: string) => Promise<string[]>;

// ─── Validation ───

export interface AuthorityValidationResponse {
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

// ─── Error ───

export interface AgentPassError {
  error: {
    code: string;
    message: string;
  };
}
