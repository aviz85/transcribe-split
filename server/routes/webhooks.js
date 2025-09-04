'use strict';

const express = require('express');
const config = require('../config');
const { jobs, sseSend } = require('../utils/storage');
const { verifyWebhookSignature } = require('../utils/crypto');
const { transcriptionTasks } = require('../services/transcriptionService');

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
  console.log('🔐 [ELEVENLABS->SERVER] Signature verification: SKIPPED (disabled for development)');
  
  // Skip signature validation for now
  // if (!verifyWebhookSignature(raw, signature, config.WEBHOOK_SECRET)) {
  //   console.warn('❌ [ELEVENLABS->SERVER] Invalid webhook signature');
  //   return res.status(400).send('Invalid signature');
  // }
  console.log('✅ [ELEVENLABS->SERVER] Signature verification bypassed');

  // ElevenLabs webhook format from actual response:
  // { type: "speech_to_text_transcription", data: { transcription: { text, language_code, words }, request_id } }
  let transcriptData, requestId, transcript, language, confidence, words;
  
  if (payload.type === 'speech_to_text_transcription' && payload.data) {
    // Actual ElevenLabs webhook format
    const data = payload.data;
    transcriptData = data.transcription;
    requestId = data.request_id;
    transcript = transcriptData.text;
    language = transcriptData.language_code;
    confidence = transcriptData.language_probability;
    words = transcriptData.words;
    console.log('🔄 [ELEVENLABS->SERVER] Using actual ElevenLabs webhook format');
    console.log('📝 [ELEVENLABS->SERVER] Transcription details:', {
      language,
      confidence,
      textLength: transcript?.length,
      wordsCount: words?.length,
      requestId
    });
  } else if (payload.type === 'speech_to_text' && payload.data) {
    // Alternative format
    transcriptData = payload.data;
    transcript = transcriptData.transcript;
    language = transcriptData.language;
    confidence = transcriptData.language_confidence;
    requestId = payload.webhook_metadata?.request_id || payload.webhook_metadata?.filename;
    console.log('🔄 [ELEVENLABS->SERVER] Using alternative webhook format');
  } else {
    // Legacy format or direct response
    const { request_id, text, language_code, language_probability } = payload;
    requestId = request_id;
    transcript = text;
    language = language_code;
    confidence = language_probability;
    console.log('🔄 [ELEVENLABS->SERVER] Using legacy webhook format');
  }
  
  // Look up job info from our task mapping using request_id
  let actualJobId, actualSegmentIndex;
  
  // Find task by ElevenLabs request_id
  const taskEntry = transcriptionTasks ? Object.entries(transcriptionTasks).find(([taskId, task]) => 
    task.elevenlabsRequestId === requestId
  ) : null;
  
  if (taskEntry) {
    const [taskId, task] = taskEntry;
    actualJobId = task.jobId;
    actualSegmentIndex = task.segmentIndex;
    console.log('✅ [ELEVENLABS->SERVER] Found task mapping:', { taskId, jobId: actualJobId, segmentIndex: actualSegmentIndex, requestId });
  } else {
    // Fallback: try to parse from filename if available
    const filenameMatch = requestId?.match(/job_([^_]+)_segment_(\d+)/);
    if (filenameMatch) {
      actualJobId = filenameMatch[1];
      actualSegmentIndex = parseInt(filenameMatch[2]);
      console.log('⚡ [ELEVENLABS->SERVER] Using filename fallback:', { jobId: actualJobId, segmentIndex: actualSegmentIndex });
    } else {
      console.warn('⚠️ [ELEVENLABS->SERVER] Cannot find task mapping for request_id:', requestId);
      console.log('🔍 [ELEVENLABS->SERVER] Available tasks:', transcriptionTasks ? Object.keys(transcriptionTasks) : 'none');
      console.log('🔍 [ELEVENLABS->SERVER] Available payload keys:', payload ? Object.keys(payload) : 'none');
      
      // EMERGENCY FIX: Find any active job and use it
      const activeJobs = Array.from(jobs.keys());
      if (activeJobs.length > 0) {
        actualJobId = activeJobs[0]; // Use the first active job
        actualSegmentIndex = 0; // Assume segment 0
        console.log('🚨 [ELEVENLABS->SERVER] Emergency fallback: using active job', actualJobId);
      } else {
        // No active jobs - log and return
        console.log('📝 [ELEVENLABS->SERVER] Transcription received but no active jobs:', {
          text: transcript?.substring(0, 200) + (transcript?.length > 200 ? '...' : ''),
          language,
          confidence
        });
        return res.status(200).send('ok');
      }
    }
  }
  
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

  // SIMPLIFIED: Just update job status and send text directly to client
  job.status = 'completed';
  
  console.log('🎉 [ELEVENLABS->SERVER] Transcription received:', {
    jobId: actualJobId,
    segmentIndex: actualSegmentIndex,
    textPreview: transcript?.substring(0, 100) + '...',
    language,
    confidence
  });

  // Send transcription directly to SSE clients using sseSend utility
  const sseSendData = {
    type: 'transcription_complete',
    jobId: actualJobId,
    segmentIndex: actualSegmentIndex,
    status: 'completed',
    text: transcript || '',
    language: language,
    confidence: confidence,
    progress: 100
  };

  console.log(`📡 [ELEVENLABS->SERVER] Sending transcription via SSE:`, {
    jobId: actualJobId,
    textPreview: transcript?.substring(0, 50) + '...',
    language,
    confidence
  });

  // Use the existing SSE infrastructure
  try {
    sseSend(actualJobId, 'transcription_complete', sseSendData);
    console.log(`✅ [ELEVENLABS->SERVER] Transcription sent to SSE system for job ${actualJobId}`);
    
    // Also try sending via direct job SSE clients as backup
    const sseClients = job.sseClients || [];
    console.log(`🔍 [ELEVENLABS->SERVER] Job has ${sseClients.length} direct SSE clients`);
    
    if (sseClients.length > 0) {
      sseClients.forEach((client, index) => {
        if (client.res && !client.res.destroyed) {
          try {
            const message = `data: ${JSON.stringify(sseSendData)}\n\n`;
            client.res.write(message);
            console.log(`📡 [ELEVENLABS->SERVER] Direct SSE sent to client ${index}`);
          } catch (directSseError) {
            console.error(`❌ [ELEVENLABS->SERVER] Direct SSE error for client ${index}:`, directSseError);
          }
        } else {
          console.log(`⚠️ [ELEVENLABS->SERVER] SSE client ${index} is destroyed or invalid`);
        }
      });
    } else {
      console.log(`⚠️ [ELEVENLABS->SERVER] No direct SSE clients found for job ${actualJobId}`);
    }
  } catch (sseError) {
    console.error('❌ [ELEVENLABS->SERVER] SSE send error:', sseError);
  }
  
  // Store the transcription text on the job object
  if (!job.combinedText) {
    job.combinedText = '';
  }
  job.combinedText += transcript + '\n\n';
  job.completedAt = Date.now();

  console.log('✅ [SERVER->ELEVENLABS] Webhook processed successfully');
  res.status(200).send('ok');
});

module.exports = router;
