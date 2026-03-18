export { createServiceHandler } from './handler.js';
export type {
  ServiceConfig,
  TrustEntry,
  ScopeDiscoveryHandler,
  ScopeItem,
  HarnessProofReplayStore,
  BrowserSessionRedemptionHandler,
  BearerTokenRedemptionHandler,
  AuthorityResolutionHandler,
  AuthorityResolutionResult,
  AuthorityValidationResponse,
  DnsResolver,
  AgentPassError,
} from './types.js';
export { InMemoryHarnessProofReplayStore } from './replay-store.js';
export {
  signJwt,
  verifyJwt,
  decodeJwtPayload,
  importSigningKey,
  importVerifyKey,
  fetchJwks,
  sha256Base64Url,
} from './crypto.js';
