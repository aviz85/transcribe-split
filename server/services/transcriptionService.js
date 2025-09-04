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
    filename: `job_${jobId}_segment_${segmentIndex}.wav`, 
    contentType: mime 
  });
  form.append('model_id', 'scribe_v1');
  form.append('webhook', 'true');
  form.append('diarize', 'true');
  form.append('timestamp_granularity', 'word');
  
  console.log(`📤 [SERVER->ELEVENLABS] Form data prepared:`, {
    filename: `job_${jobId}_segment_${segmentIndex}.wav`,
    model_id: 'scribe_v1',
    webhook: true,
    diarize: true,
    timestamp_granularity: 'word'
  });

  // Official ElevenLabs Speech-to-Text API
  const url = 'https://api.elevenlabs.io/v1/speech-to-text';
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
