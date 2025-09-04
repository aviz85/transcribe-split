const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const request = require('supertest');
const fs = require('fs').promises;
const path = require('path');
const nock = require('nock');

// Import the full app
const app = require('../../server/index.js');

describe('End-to-End Integration Tests', () => {
  let server;
  const testPort = 5002;

  beforeAll(async () => {
    // Start test server
    server = app.listen(testPort);
    
    // Create test audio file
    const testAudioPath = path.join('tests/fixtures/test-audio.wav');
    await fs.writeFile(testAudioPath, Buffer.alloc(1024, 'A')); // 1KB fake audio
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
    nock.cleanAll();
    
    // Cleanup test files
    try {
      await fs.unlink(path.join('tests/fixtures/test-audio.wav'));
    } catch (error) {
      // File might not exist
    }
  });

  describe('Complete Transcription Workflow', () => {
    it('should handle complete transcription workflow', async () => {
      // Step 1: Create job
      const jobResponse = await request(app)
        .post('/api/jobs')
        .send({
          filename: 'test-audio.wav',
          segmentCount: 2
        })
        .expect(201);

      const jobId = jobResponse.body.jobId;
      expect(jobId).toBeDefined();

      // Step 2: Check job status
      const statusResponse = await request(app)
        .get(`/api/jobs/${jobId}`)
        .expect(200);

      expect(statusResponse.body.status).toBe('created');

      // Step 3: Mock ElevenLabs API for segments upload
      nock('https://api.elevenlabs.io')
        .post('/v1/speech-to-text')
        .times(2) // For 2 segments
        .reply(200, (uri, requestBody) => ({
          transcription_id: `trans-${Math.random().toString(36).substr(2, 9)}`,
          status: 'processing'
        }));

      // Step 4: Upload segments
      const fakeAudioData = Buffer.alloc(1024, 'A');
      
      for (let i = 0; i < 2; i++) {
        await request(app)
          .post(`/api/upload/${jobId}/segment/${i}`)
          .set('Content-Type', 'audio/wav')
          .send(fakeAudioData)
          .expect(200);
      }

      // Step 5: Simulate webhook responses
      const updatedJob = await request(app)
        .get(`/api/jobs/${jobId}`)
        .expect(200);

      expect(updatedJob.body.segments).toHaveLength(2);
      updatedJob.body.segments.forEach(segment => {
        expect(segment.status).toBe('processing');
        expect(segment.transcriptionId).toBeDefined();
      });
    });

    it('should handle workflow errors gracefully', async () => {
      // Create job
      const jobResponse = await request(app)
        .post('/api/jobs')
        .send({
          filename: 'error-test.wav',
          segmentCount: 1
        })
        .expect(201);

      const jobId = jobResponse.body.jobId;

      // Mock ElevenLabs API error
      nock('https://api.elevenlabs.io')
        .post('/v1/speech-to-text')
        .reply(401, { message: 'Invalid API key' });

      // Try to upload segment
      const fakeAudioData = Buffer.alloc(1024, 'A');
      
      await request(app)
        .post(`/api/upload/${jobId}/segment/0`)
        .set('Content-Type', 'audio/wav')
        .send(fakeAudioData)
        .expect(500);

      // Job should still exist but segment should be failed
      const jobStatus = await request(app)
        .get(`/api/jobs/${jobId}`)
        .expect(200);

      expect(jobStatus.body.segments[0].status).toBe('failed');
    });
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.config).toBeDefined();
      expect(response.body.config.elevenLabsConfigured).toBe(true);
    });
  });

  describe('Static File Serving', () => {
    it('should serve static files', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
    });

    it('should serve JavaScript files', async () => {
      const response = await request(app)
        .get('/js/app.js')
        .expect(200);

      expect(response.headers['content-type']).toContain('application/javascript');
    });

    it('should serve CSS files', async () => {
      const response = await request(app)
        .get('/css/style.css')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/css');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for non-existent routes', async () => {
      await request(app)
        .get('/non-existent-route')
        .expect(404);
    });

    it('should handle invalid JSON in POST requests', async () => {
      await request(app)
        .post('/api/jobs')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });
  });

  describe('CORS', () => {
    it('should include CORS headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should handle preflight requests', async () => {
      await request(app)
        .options('/api/jobs')
        .expect(200);
    });
  });
});