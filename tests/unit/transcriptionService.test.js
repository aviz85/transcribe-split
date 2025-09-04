const { describe, it, expect, jest, beforeEach, afterEach } = require('@jest/globals');
const nock = require('nock');
const fs = require('fs').promises;
const path = require('path');
const TranscriptionService = require('../../server/services/transcriptionService');

describe('TranscriptionService', () => {
  let transcriptionService;
  const mockJobStore = new Map();
  const mockSendSSE = jest.fn();

  beforeEach(() => {
    transcriptionService = new TranscriptionService(mockJobStore, mockSendSSE);
    jest.clearAllMocks();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('startTranscription', () => {
    it('should successfully start transcription with valid audio file', async () => {
      // Mock ElevenLabs API response
      const mockResponse = {
        transcription_id: 'test-transcription-id',
        status: 'processing'
      };

      nock('https://api.elevenlabs.io')
        .post('/v1/speech-to-text')
        .reply(200, mockResponse);

      // Create test audio file
      const testFilePath = path.join('tests/fixtures/test-audio.wav');
      await fs.writeFile(testFilePath, Buffer.from('fake audio data'));

      const result = await transcriptionService.startTranscription('test-job-id', 0, testFilePath);

      expect(result).toEqual({
        transcriptionId: 'test-transcription-id',
        status: 'processing'
      });

      // Cleanup
      await fs.unlink(testFilePath);
    });

    it('should handle API errors gracefully', async () => {
      nock('https://api.elevenlabs.io')
        .post('/v1/speech-to-text')
        .reply(401, { message: 'Invalid API key' });

      const testFilePath = path.join('tests/fixtures/test-audio.wav');
      await fs.writeFile(testFilePath, Buffer.from('fake audio data'));

      await expect(transcriptionService.startTranscription('test-job-id', 0, testFilePath))
        .rejects.toThrow('ElevenLabs API error: 401');

      await fs.unlink(testFilePath);
    });

    it('should handle missing files', async () => {
      await expect(transcriptionService.startTranscription('test-job-id', 0, 'nonexistent.wav'))
        .rejects.toThrow('File not found');
    });
  });

  describe('handleWebhook', () => {
    beforeEach(() => {
      mockJobStore.set('test-job-id', {
        id: 'test-job-id',
        segments: [
          { index: 0, status: 'processing', transcriptionId: 'trans-id-1' }
        ],
        status: 'processing'
      });
    });

    it('should handle successful transcription webhook', async () => {
      const webhookData = {
        transcription_id: 'trans-id-1',
        status: 'completed',
        transcript: 'Hello world, this is a test transcription.'
      };

      await transcriptionService.handleWebhook(webhookData);

      const job = mockJobStore.get('test-job-id');
      expect(job.segments[0].status).toBe('completed');
      expect(job.segments[0].transcript).toBe('Hello world, this is a test transcription.');
      expect(mockSendSSE).toHaveBeenCalledWith('test-job-id', expect.objectContaining({
        type: 'segment-completed',
        segmentIndex: 0
      }));
    });

    it('should handle failed transcription webhook', async () => {
      const webhookData = {
        transcription_id: 'trans-id-1',
        status: 'failed',
        error: 'Audio quality too poor'
      };

      await transcriptionService.handleWebhook(webhookData);

      const job = mockJobStore.get('test-job-id');
      expect(job.segments[0].status).toBe('failed');
      expect(job.segments[0].error).toBe('Audio quality too poor');
      expect(mockSendSSE).toHaveBeenCalledWith('test-job-id', expect.objectContaining({
        type: 'segment-failed',
        segmentIndex: 0
      }));
    });

    it('should handle webhook for unknown transcription ID', async () => {
      const webhookData = {
        transcription_id: 'unknown-trans-id',
        status: 'completed',
        transcript: 'Unknown transcription'
      };

      await expect(transcriptionService.handleWebhook(webhookData))
        .resolves.not.toThrow();
    });
  });

  describe('getJobStatus', () => {
    it('should return job status correctly', () => {
      const mockJob = {
        id: 'test-job-id',
        status: 'processing',
        segments: [
          { index: 0, status: 'completed' },
          { index: 1, status: 'processing' }
        ]
      };
      mockJobStore.set('test-job-id', mockJob);

      const status = transcriptionService.getJobStatus('test-job-id');
      expect(status).toEqual(mockJob);
    });

    it('should return null for non-existent job', () => {
      const status = transcriptionService.getJobStatus('non-existent-job');
      expect(status).toBeNull();
    });
  });
});