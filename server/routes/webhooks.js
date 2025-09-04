'use strict';

const express = require('express');
const config = require('../config');
const { jobs, sseSend } = require('../utils/storage');
const { verifyWebhookSignature } = require('../utils/crypto');

const router = express.Router();

// Webhook endpoint to receive Scribe results
router.post('/elevenlabs', express.raw({ type: '*/*' }), (req, res) => {
  console.log('📨 [ELEVENLABS->SERVER] Webhook received from ElevenLabs');
  console.log('📊 [ELEVENLABS->SERVER] Headers:', req.headers);
  
  const raw = req.body;
  let payload;
  
  try {
    // Handle both raw buffer and already parsed object
    if (typeof raw === 'object' && raw !== null && !Buffer.isBuffer(raw)) {
      payload = raw; // Already parsed by Express
      console.log('📝 [ELEVENLABS->SERVER] Webhook payload (pre-parsed):', JSON.stringify(payload, null, 2));
    } else {
      // Parse raw buffer/string
      const bodyString = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
      console.log('📝 [ELEVENLABS->SERVER] Raw webhook body:', bodyString);
      payload = JSON.parse(bodyString);
      console.log('📝 [ELEVENLABS->SERVER] Webhook payload (parsed):', JSON.stringify(payload, null, 2));
    }
  } catch (err) {
    console.error('❌ [ELEVENLABS->SERVER] Invalid JSON in webhook:', `"${raw}" is not valid JSON`);
    console.error('❌ [ELEVENLABS->SERVER] Parse error:', err.message);
    return res.status(400).send('Invalid JSON');
  }

  const signature = req.headers['x-elevenlabs-signature'] || req.headers['elevenlabs-signature'];
  console.log('🔐 [ELEVENLABS->SERVER] Signature verification:', { signature: signature ? 'present' : 'missing' });
  
  if (!verifyWebhookSignature(raw, signature, config.WEBHOOK_SECRET)) {
    console.warn('❌ [ELEVENLABS->SERVER] Invalid webhook signature');
    return res.status(400).send('Invalid signature');
  }
  console.log('✅ [ELEVENLABS->SERVER] Signature verified successfully');

  // ElevenLabs webhook format according to docs:
  // { type: "speech_to_text", data: { transcript, language, words, etc }, webhook_metadata }
  let transcriptData, requestId, transcript, language, confidence;
  
  if (payload.type === 'speech_to_text' && payload.data) {
    // New webhook format
    transcriptData = payload.data;
    transcript = transcriptData.transcript;
    language = transcriptData.language;
    confidence = transcriptData.language_confidence;
    // Extract request_id from webhook_metadata or filename
    requestId = payload.webhook_metadata?.request_id || payload.webhook_metadata?.filename;
    console.log('🔄 [ELEVENLABS->SERVER] Using new webhook format');
  } else {
    // Legacy format or direct response
    const { request_id, text, language_code, language_probability } = payload;
    requestId = request_id;
    transcript = text;
    language = language_code;
    confidence = language_probability;
    console.log('🔄 [ELEVENLABS->SERVER] Using legacy webhook format');
  }
  
  // Extract job info from request_id (which should be the filename we sent)
  // Format: job_{jobId}_segment_{segmentIndex}
  const filenameMatch = requestId?.match(/job_([^_]+)_segment_(\d+)/);
  if (!filenameMatch) {
    console.warn('⚠️ [ELEVENLABS->SERVER] Cannot parse job info from request_id:', requestId);
    console.log('🔍 [ELEVENLABS->SERVER] Available payload keys:', Object.keys(payload));
    return res.status(200).send('ok');
  }
  
  const actualJobId = filenameMatch[1];
  const actualSegmentIndex = parseInt(filenameMatch[2]);
  
  if (!actualJobId || isNaN(actualSegmentIndex)) {
    console.warn('⚠️ [ELEVENLABS->SERVER] Invalid job info parsed from request_id:', requestId);
    return res.status(200).send('ok');
  }
  
  console.log(`🎯 [ELEVENLABS->SERVER] Processing webhook for job ${actualJobId} segment ${actualSegmentIndex}`);
  
  const job = jobs.get(actualJobId);
  if (!job) {
    console.warn(`❌ [ELEVENLABS->SERVER] Job ${actualJobId} not found`);
    return res.status(200).send('ok');
  }
  
  console.log(`📋 [ELEVENLABS->SERVER] Found job ${actualJobId}, current status: ${job.status}`);

  let entry = job.transcriptions.find(t => t.segmentIndex === actualSegmentIndex) || null;
  if (!entry) {
    entry = { segmentIndex: actualSegmentIndex, taskId: requestId, status: 'processing', text: '' };
    job.transcriptions.push(entry);
  }
  
  // ElevenLabs webhook means transcription is completed
  entry.status = 'completed';
  entry.text = transcript || '';
  entry.language = language;
  entry.confidence = confidence;

  console.log(`✅ [ELEVENLABS->SERVER] Transcription completed for job ${actualJobId} segment ${actualSegmentIndex}:`, {
    text: transcript?.substring(0, 100) + (transcript?.length > 100 ? '...' : ''),
    language: language,
    confidence: confidence
  });
  
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
  
  console.log(`📤 [SERVER->CLIENT] SSE update sent for job ${actualJobId}: progress ${Math.round(overallProgress)}%, completed ${completedCount}/${totalSegments}`);
  
  if (allCompleted) {
    console.log(`🎉 [SERVER->CLIENT] Job ${actualJobId} completed! Combined transcript length: ${job.combinedText?.length || 0} characters`);
  }

  console.log('✅ [SERVER->ELEVENLABS] Webhook processed successfully');
  res.status(200).send('ok');
});

module.exports = router;
