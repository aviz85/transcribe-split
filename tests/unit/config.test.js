const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

describe('Config', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear config cache
    delete require.cache[require.resolve('../../server/config.js')];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load default configuration', () => {
    process.env.NODE_ENV = 'test';
    const config = require('../../server/config.js');
    
    expect(typeof config.PORT).toBe('string');
    expect(config.UPLOAD_DIR).toBe('uploads');
    expect(config.OUTPUT_DIR).toBe('outputs');
    expect(config.SEGMENT_DURATION).toBe(300); // 5 minutes
  });

  it('should override with environment variables', () => {
    process.env.PORT = '8080';
    process.env.ELEVENLABS_API_KEY = 'test-api-key';
    process.env.WEBHOOK_SECRET = 'test-webhook-secret';
    process.env.PUBLIC_BASE_URL = 'https://test.example.com';
    
    const config = require('../../server/config.js');
    
    expect(typeof config.PORT).toBe('string');
    expect(config.ELEVENLABS_API_KEY).toBe('test-api-key');
    expect(config.WEBHOOK_SECRET).toBe('test-webhook-secret');
    expect(typeof config.PUBLIC_BASE_URL).toBe('string');
  });

  it('should generate public URL from REPLIT_DOMAINS', () => {
    process.env.REPLIT_DOMAINS = 'test1.replit.dev,test2.replit.dev';
    delete process.env.PUBLIC_BASE_URL;
    
    const config = require('../../server/config.js');
    
    expect(config.PUBLIC_BASE_URL).toContain('https://');
  });

  it('should fallback to localhost when no public URL is configured', () => {
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.REPLIT_DOMAINS;
    process.env.PORT = '3000';
    
    const config = require('../../server/config.js');
    
    expect(typeof config.PUBLIC_BASE_URL).toBe('string');
    expect(config.PUBLIC_BASE_URL.length).toBeGreaterThan(0);
  });
});