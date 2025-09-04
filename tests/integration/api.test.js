const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const request = require('supertest');
const express = require('express');
const nock = require('nock');
const fs = require('fs').promises;
const path = require('path');

// Import routes
const jobsRouter = require('../../server/routes/jobs');
const uploadRouter = require('../../server/routes/upload');
const webhookRouter = require('../../server/routes/webhooks');

describe('API Integration Tests', () => {
  let app;
  let jobStore;

  beforeEach(() => {
    // Create test app
    app = express();
    app.use(express.json());
    app.use(express.raw({ type: 'audio/*', limit: '200mb' }));
    
    // Initialize job store
    jobStore = new Map();
    
    // Mock SSE function
    const mockSendSSE = jest.fn();
    
    // Add routes with dependencies
    app.use('/api/jobs', jobsRouter);
    app.use('/api/upload', uploadRouter);
    app.use('/api/webhooks', webhookRouter);
    
    // Inject dependencies
    app.locals.jobStore = jobStore;
    app.locals.sendSSE = mockSendSSE;
    
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('POST /api/jobs', () => {
    it('should create a new transcription job', async () => {
      const jobData = {
        filename: 'test-audio.mp3',
        segmentCount: 5
      };

      const response = await request(app)
        .post('/api/jobs')
        .send(jobData)
        .expect(201);

      expect(response.body).toHaveProperty('jobId');
      expect(response.body).toHaveProperty('segmentCount', 5);
      expect(response.body).toHaveProperty('status', 'created');
      
      // Verify job was stored
      const storedJob = jobStore.get(response.body.jobId);
      expect(storedJob).toBeDefined();
      expect(storedJob.filename).toBe('test-audio.mp3');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/jobs')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/jobs/:jobId', () => {
    it('should return job status for existing job', async () => {
      // Create test job
      const jobId = 'test-job-123';
      jobStore.set(jobId, {
        id: jobId,
        filename: 'test.mp3',
        status: 'processing',
        segments: []
      });

      const response = await request(app)
        .get(`/api/jobs/${jobId}`)
        .expect(200);

      expect(response.body.id).toBe(jobId);
      expect(response.body.status).toBe('processing');
    });

    it('should return 404 for non-existent job', async () => {
      const response = await request(app)
        .get('/api/jobs/non-existent')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Job not found');
    });
  });

  describe('POST /api/upload/:jobId/segment/:segmentIndex', () => {
    let jobId;
    
    beforeEach(() => {
      jobId = 'test-upload-job';
      jobStore.set(jobId, {
        id: jobId,
        status: 'processing',
        segments: [
          { index: 0, status: 'pending' }
        ]
      });
    });

    it('should upload audio segment and start transcription', async () => {
      // Mock ElevenLabs API
      nock('https://api.elevenlabs.io')
        .post('/v1/speech-to-text')
        .reply(200, {
          transcription_id: 'test-transcription-id',
          status: 'processing'
        });

      const fakeAudioData = Buffer.from('fake audio data');

      const response = await request(app)
        .post(`/api/upload/${jobId}/segment/0`)
        .set('Content-Type', 'audio/wav')
        .send(fakeAudioData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('transcriptionId', 'test-transcription-id');
    });

    it('should handle invalid job ID', async () => {
      const fakeAudioData = Buffer.from('fake audio data');

      const response = await request(app)
        .post('/api/upload/invalid-job/segment/0')
        .set('Content-Type', 'audio/wav')
        .send(fakeAudioData)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Job not found');
    });

    it('should handle ElevenLabs API errors', async () => {
      // Mock ElevenLabs API error
      nock('https://api.elevenlabs.io')
        .post('/v1/speech-to-text')
        .reply(401, { message: 'Invalid API key' });

      const fakeAudioData = Buffer.from('fake audio data');

      const response = await request(app)
        .post(`/api/upload/${jobId}/segment/0`)
        .set('Content-Type', 'audio/wav')
        .send(fakeAudioData)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/webhooks/elevenlabs', () => {
    let jobId;
    
    beforeEach(() => {
      jobId = 'webhook-test-job';
      jobStore.set(jobId, {
        id: jobId,
        status: 'processing',
        segments: [
          { index: 0, status: 'processing', transcriptionId: 'test-transcription-id' }
        ]
      });
    });

    it('should handle successful transcription webhook', async () => {
      const webhookData = {
        transcription_id: 'test-transcription-id',
        status: 'completed',
        transcript: 'Hello world, this is a test.'
      };

      const response = await request(app)
        .post('/api/webhooks/elevenlabs')
        .send(webhookData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      
      // Verify job was updated
      const updatedJob = jobStore.get(jobId);
      expect(updatedJob.segments[0].status).toBe('completed');
      expect(updatedJob.segments[0].transcript).toBe('Hello world, this is a test.');
    });

    it('should handle failed transcription webhook', async () => {
      const webhookData = {
        transcription_id: 'test-transcription-id',
        status: 'failed',
        error: 'Audio quality too poor'
      };

      const response = await request(app)
        .post('/api/webhooks/elevenlabs')
        .send(webhookData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      
      // Verify job was updated
      const updatedJob = jobStore.get(jobId);
      expect(updatedJob.segments[0].status).toBe('failed');
      expect(updatedJob.segments[0].error).toBe('Audio quality too poor');
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});