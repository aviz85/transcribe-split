'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');

async function startElevenLabsTranscription(jobId, segmentIndex, audioBuffer, mime) {
  const webhookUrl = `${config.PUBLIC_BASE_URL}/api/webhooks/elevenlabs`;
  const form = new FormData();
  
  form.append('file', audioBuffer, { 
    filename: `segment_${segmentIndex}.wav`, 
    contentType: mime 
  });
  form.append('webhook_url', webhookUrl);
  form.append('metadata', JSON.stringify({ jobId, segmentIndex }));

  // Placeholder ElevenLabs Scribe async API. Adjust to official endpoint.
  const url = 'https://api.elevenlabs.io/v1/speech-to-text/async';
  
  const resp = await axios.post(url, form, {
    headers: {
      'xi-api-key': config.ELEVENLABS_API_KEY,
      ...form.getHeaders(),
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 30000, // 30 second timeout
  });

  const taskId = resp.data?.task_id || resp.data?.taskId || `${Date.now()}-${segmentIndex}`;
  return taskId;
}

module.exports = {
  startElevenLabsTranscription,
};
