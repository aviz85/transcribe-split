'use strict';

const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const { jobs, sseSend } = require('../utils/storage');
const { startElevenLabsTranscription } = require('../services/transcriptionService');

const router = express.Router();

// Create job endpoint (no file upload needed anymore)
router.post('/', (req, res) => {
  const { filename, segmentCount } = req.body;
  
  if (!filename || !segmentCount || segmentCount <= 0) {
    return res.status(400).json({ error: 'filename and segmentCount are required' });
  }

  const jobId = crypto.randomUUID();
  const job = {
    id: jobId,
    filename: filename,
    status: 'created',
    createdAt: new Date().toISOString(),
    segments: Array.from({ length: segmentCount }, (_, i) => ({
      index: i,
      status: 'pending',
      transcription: null,
      taskId: null
    })),
    transcriptions: {},
    completedSegments: 0,
    totalSegments: segmentCount,
  };

  jobs.set(jobId, job);
  sseSend(jobId, 'job_created', job);

  res.json({ jobId, message: 'Job created successfully' });
});

// Upload segment endpoint - receives raw audio data
router.post('/:jobId/segment/:segmentIndex', express.raw({ type: '*/*', limit: '200mb' }), (req, res) => {
  const { jobId, segmentIndex } = req.params;
  const segmentIdx = parseInt(segmentIndex);
  
  const job = jobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (segmentIdx < 0 || segmentIdx >= job.totalSegments) {
    return res.status(400).json({ error: 'Invalid segment index' });
  }

  // Get the uploaded audio data from request body
  const audioBuffer = req.body;
  if (!audioBuffer || audioBuffer.length === 0) {
    return res.status(400).json({ error: 'No audio data received' });
  }

  // Update segment status
  job.segments[segmentIdx].status = 'uploaded';
  sseSend(jobId, 'segment_uploaded', { segmentIndex: segmentIdx });

  // Start transcription for this segment
  startElevenLabsTranscription(jobId, segmentIdx, audioBuffer, 'audio/wav')
    .then(taskId => {
      job.segments[segmentIdx].taskId = taskId;
      job.segments[segmentIdx].status = 'transcribing';
      sseSend(jobId, 'segment_transcribing', { segmentIndex: segmentIdx, taskId });
    })
    .catch(err => {
      console.error(`Failed to start transcription for job ${jobId} segment ${segmentIdx}:`, err);
      job.segments[segmentIdx].status = 'error';
      job.segments[segmentIdx].error = err.message;
      sseSend(jobId, 'segment_error', { segmentIndex: segmentIdx, error: err.message });
    });

  res.json({ success: true });
});

module.exports = router;