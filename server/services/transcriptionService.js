'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');

async function startElevenLabsTranscription(jobId, segmentIndex, audioBuffer, mime) {
  const webhookUrl = `${config.PUBLIC_BASE_URL}/api/webhooks/elevenlabs`;
  console.log(`🔄 [SERVER->ELEVENLABS] Preparing transcription request for job ${jobId} segment ${segmentIndex}`);
  console.log(`📡 [SERVER->ELEVENLABS] Webhook URL: ${webhookUrl}`);
  console.log(`📊 [SERVER->ELEVENLABS] Audio data size: ${audioBuffer.length} bytes, MIME: ${mime}`);
  
  const form = new FormData();
  
  form.append('file', audioBuffer, { 
    filename: `segment_${segmentIndex}.wav`, 
    contentType: mime 
  });
  form.append('webhook_url', webhookUrl);
  form.append('metadata', JSON.stringify({ jobId, segmentIndex }));
  
  console.log(`📤 [SERVER->ELEVENLABS] Form data prepared:`, {
    filename: `segment_${segmentIndex}.wav`,
    webhookUrl,
    metadata: { jobId, segmentIndex }
  });

  // Placeholder ElevenLabs Scribe async API. Adjust to official endpoint.
  const url = 'https://api.elevenlabs.io/v1/speech-to-text/async';
  console.log(`🌐 [SERVER->ELEVENLABS] Making API request to: ${url}`);
  
  const resp = await axios.post(url, form, {
    headers: {
      'xi-api-key': config.ELEVENLABS_API_KEY,
      ...form.getHeaders(),
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 30000, // 30 second timeout
  });
  
  console.log(`✅ [ELEVENLABS->SERVER] API response received:`, {
    status: resp.status,
    statusText: resp.statusText,
    data: resp.data
  });

  const taskId = resp.data?.task_id || resp.data?.taskId || `${Date.now()}-${segmentIndex}`;
  console.log(`🎯 [ELEVENLABS->SERVER] Task ID received: ${taskId} for job ${jobId} segment ${segmentIndex}`);
  return taskId;
}

module.exports = {
  startElevenLabsTranscription,
};
