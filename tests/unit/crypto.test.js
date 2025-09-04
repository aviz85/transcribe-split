const { describe, it, expect } = require('@jest/globals');
const crypto = require('crypto');
const { verifyWebhookSignature } = require('../../server/utils/crypto');

describe('Crypto Utils', () => {
  describe('verifyWebhookSignature', () => {
    const testSecret = 'test-webhook-secret';
    const testPayload = JSON.stringify({ test: 'data' });

    it('should verify valid webhook signature', () => {
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(testPayload)
        .digest('hex');

      const result = verifyWebhookSignature(testPayload, signature, testSecret);
      expect(result).toBe(true);
    });

    it('should reject invalid webhook signature', () => {
      const invalidSignature = 'invalid-signature';
      
      const result = verifyWebhookSignature(testPayload, invalidSignature, testSecret);
      expect(result).toBe(false);
    });

    it('should reject signature with wrong secret', () => {
      const wrongSecret = 'wrong-secret';
      const signature = crypto
        .createHmac('sha256', wrongSecret)
        .update(testPayload)
        .digest('hex');

      const result = verifyWebhookSignature(testPayload, signature, testSecret);
      expect(result).toBe(false);
    });

    it('should handle empty payload', () => {
      const emptyPayload = '';
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(emptyPayload)
        .digest('hex');

      const result = verifyWebhookSignature(emptyPayload, signature, testSecret);
      expect(result).toBe(true);
    });

    it('should handle malformed signature gracefully', () => {
      const malformedSignatures = [null, undefined, '', 'not-hex'];
      
      malformedSignatures.forEach(sig => {
        const result = verifyWebhookSignature(testPayload, sig, testSecret);
        expect(result).toBe(false);
      });
    });
  });
});