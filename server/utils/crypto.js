'use strict';

const crypto = require('crypto');

function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  try {
    // Common pattern: header like: v1,t=timestamp,hash=signature
    const parts = String(signatureHeader).split(',');
    const sig = parts.pop() || '';
    const toSign = rawBody;
    const hmac = crypto.createHmac('sha256', secret).update(toSign).digest('hex');
    return sig.endsWith(hmac);
  } catch (_) {
    return false;
  }
}

module.exports = {
  verifyWebhookSignature,
};
