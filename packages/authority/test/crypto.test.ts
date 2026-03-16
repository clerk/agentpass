import { describe, it, expect } from 'vitest';
import {
  base64urlEncode,
  base64urlDecode,
  base64urlEncodeBuffer,
  base64urlDecodeBuffer,
  generateAgentPassValue,
  generateId,
  decodeJwtPayload,
} from '../src/crypto.js';

describe('Crypto utilities', () => {
  describe('base64url', () => {
    it('encodes and decodes strings', () => {
      const original = 'Hello, AgentPass!';
      const encoded = base64urlEncode(original);
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
      expect(base64urlDecode(encoded)).toBe(original);
    });

    it('encodes and decodes buffers', () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      const encoded = base64urlEncodeBuffer(bytes);
      const decoded = base64urlDecodeBuffer(encoded);
      expect(decoded).toEqual(bytes);
    });
  });

  describe('generateAgentPassValue', () => {
    it('generates values with ap_ prefix', () => {
      const value = generateAgentPassValue();
      expect(value).toMatch(/^ap_[0-9a-f]{64}$/);
    });

    it('generates unique values', () => {
      const a = generateAgentPassValue();
      const b = generateAgentPassValue();
      expect(a).not.toBe(b);
    });
  });

  describe('generateId', () => {
    it('generates IDs with prefix', () => {
      const id = generateId('req');
      expect(id).toMatch(/^req_[0-9a-f]{24}$/);
    });

    it('generates IDs without prefix', () => {
      const id = generateId();
      expect(id).toMatch(/^[0-9a-f]{24}$/);
    });
  });

  describe('decodeJwtPayload', () => {
    it('decodes JWT payload', () => {
      const payload = { iss: 'test', sub: 'user', iat: 1234567890 };
      const header = base64urlEncode(JSON.stringify({ alg: 'ES256' }));
      const body = base64urlEncode(JSON.stringify(payload));
      const jwt = `${header}.${body}.signature`;

      const decoded = decodeJwtPayload(jwt);
      expect(decoded.iss).toBe('test');
      expect(decoded.sub).toBe('user');
    });

    it('throws on invalid JWT format', () => {
      expect(() => decodeJwtPayload('not-a-jwt')).toThrow('Invalid JWT format');
    });
  });
});
