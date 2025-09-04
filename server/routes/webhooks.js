'use strict';

const express = require('express');
const config = require('../config');
const { jobs, sseSend } = require('../utils/storage');
const { verifyWebhookSignature } = require('../utils/crypto');

const router = express.Router();

// Webhook endpoint to receive Scribe results
router.post('/elevenlabs', express.raw({ type: '*/*' }), (req, res) => {
  const raw = req.body;
  let payload;
  
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const signature = req.headers['x-elevenlabs-signature'] || req.headers['elevenlabs-signature'];
  if (!verifyWebhookSignature(raw, signature, config.WEBHOOK_SECRET)) {
    console.warn('Invalid webhook signature');
    return res.status(400).send('Invalid signature');
  }

  const { jobId, segmentIndex, status, text, taskId, metadata } = payload;
  
  // Extract from metadata if not in root
  const actualJobId = jobId || metadata?.jobId;
  const actualSegmentIndex = segmentIndex !== undefined ? segmentIndex : metadata?.segmentIndex;
  
  if (!actualJobId) {
    console.warn('No jobId in webhook payload');
    return res.status(200).send('ok');
  }
  
  const job = jobs.get(actualJobId);
  if (!job) {
    console.warn(`Job ${actualJobId} not found`);
    return res.status(200).send('ok');
  }

  let entry = job.transcriptions.find(t => t.segmentIndex === actualSegmentIndex) || null;
  if (!entry) {
    entry = { segmentIndex: actualSegmentIndex, taskId, status: 'processing', text: '' };
    job.transcriptions.push(entry);
  }
  
  if (status) entry.status = status;
  if (text) entry.text = text;
  if (taskId) entry.taskId = taskId;

  // Calculate progress
  const completedCount = job.transcriptions.filter(t => t.status === 'completed').length;
  const totalSegments = job.segments.length;
  const transcriptionProgress = totalSegments > 0 ? (completedCount / totalSegments) * 50 : 0; // Second 50%
  const overallProgress = 50 + transcriptionProgress; // First 50% was splitting

  // Check if all segments are completed
  const allCompleted = totalSegments > 0 && completedCount === totalSegments;
  
  if (allCompleted && job.status !== 'completed') {
    job.status = 'completed';
    job.combinedText = job.transcriptions
      .sort((a, b) => a.segmentIndex - b.segmentIndex)
      .map(t => t.text || '')
      .filter(text => text.trim().length > 0)
      .join('\n\n');
    job.completedAt = Date.now();
  }

  sseSend(job.id, 'transcription_update', { 
    entry, 
    status: job.status, 
    progress: overallProgress,
    completed: completedCount,
    total: totalSegments,
    allCompleted 
  });

  res.status(200).send('ok');
});

module.exports = router;
