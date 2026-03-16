/**
 * Crypto utilities for JWT signing and verification.
 * Uses Web Crypto API (compatible with Cloudflare Workers).
 */

export async function importSigningKey(jwk: JsonWebKey): Promise<CryptoKey> {
  const alg = jwk.kty === 'EC' ? { name: 'ECDSA', namedCurve: jwk.crv || 'P-256' } :
    jwk.kty === 'RSA' ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } :
      (() => { throw new Error(`Unsupported key type: ${jwk.kty}`); })();

  return crypto.subtle.importKey('jwk', jwk, alg, false, ['sign']);
}

export async function importVerifyKey(jwk: JsonWebKey): Promise<CryptoKey> {
  const alg = jwk.kty === 'EC' ? { name: 'ECDSA', namedCurve: jwk.crv || 'P-256' } :
    jwk.kty === 'RSA' ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } :
      (() => { throw new Error(`Unsupported key type: ${jwk.kty}`); })();

  return crypto.subtle.importKey('jwk', jwk, alg, false, ['verify']);
}

export async function signJwt(
  payload: Record<string, unknown>,
  privateKey: CryptoKey,
  keyId: string,
): Promise<string> {
  const header = { alg: getAlg(privateKey), typ: 'JWT', kid: keyId };
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = await crypto.subtle.sign(
    getSignParams(privateKey),
    privateKey,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64urlEncodeBuffer(signature)}`;
}

export async function verifyJwt(
  token: string,
  publicKey: CryptoKey,
): Promise<{ header: Record<string, unknown>; payload: Record<string, unknown> }> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const [headerB64, payloadB64, signatureB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = base64urlDecodeBuffer(signatureB64);

  const valid = await crypto.subtle.verify(
    getSignParams(publicKey),
    publicKey,
    signature,
    new TextEncoder().encode(signingInput),
  );

  if (!valid) throw new Error('Invalid JWT signature');

  return {
    header: JSON.parse(base64urlDecode(headerB64)),
    payload: JSON.parse(base64urlDecode(payloadB64)),
  };
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
  return JSON.parse(base64urlDecode(parts[1]));
}

export async function fetchJwks(jwksUri: string): Promise<JsonWebKey[]> {
  const response = await fetch(jwksUri);
  if (!response.ok) throw new Error(`Failed to fetch JWKS: ${response.status}`);
  const jwks = await response.json() as { keys: JsonWebKey[] };
  return jwks.keys;
}

// ─── Helpers ───

function getAlg(key: CryptoKey): string {
  if (key.algorithm.name === 'ECDSA') return 'ES256';
  if (key.algorithm.name === 'RSASSA-PKCS1-v1_5') return 'RS256';
  throw new Error(`Unsupported algorithm: ${key.algorithm.name}`);
}

function getSignParams(key: CryptoKey): { name: string; hash?: string } {
  if (key.algorithm.name === 'ECDSA') return { name: 'ECDSA', hash: 'SHA-256' };
  return { name: 'RSASSA-PKCS1-v1_5' };
}

export function base64urlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return base64urlEncodeBuffer(bytes);
}

export function base64urlDecode(str: string): string {
  return new TextDecoder().decode(base64urlDecodeBuffer(str));
}

export function base64urlEncodeBuffer(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlDecodeBuffer(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
