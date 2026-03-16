export { createServiceHandler } from './handler.js';
export type {
  ServiceConfig,
  TrustEntry,
  ScopeDiscoveryHandler,
  ScopeItem,
  BrowserSessionRedemptionHandler,
  BearerTokenRedemptionHandler,
  AuthorityResolutionHandler,
  AuthorityResolutionResult,
  AuthorityValidationResponse,
  DnsResolver,
  AgentPassError,
} from './types.js';
export {
  signJwt,
  verifyJwt,
  decodeJwtPayload,
  importSigningKey,
  importVerifyKey,
  fetchJwks,
} from './crypto.js';
