const fs = require('fs').promises;
const path = require('path');

// Global test setup
global.beforeAll(async () => {
  // Create test directories
  const testDirs = ['uploads', 'outputs', 'tests/fixtures'];
  for (const dir of testDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }
});

global.afterAll(async () => {
  // Cleanup test files
  try {
    const testFiles = await fs.readdir('uploads');
    for (const file of testFiles) {
      if (file.startsWith('test-')) {
        await fs.unlink(path.join('uploads', file));
      }
    }
  } catch (error) {
    // Directory might not exist
  }
});

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.PORT = '5001';
process.env.ELEVENLABS_API_KEY = 'test-api-key';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';
process.env.PUBLIC_BASE_URL = 'http://localhost:5001';