'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.raw({ limit: '200mb' })); // For large audio segments

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Routes
app.use('/api/upload', require('./routes/upload'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/webhooks', require('./routes/webhooks'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    config: {
      hasElevenLabsKey: !!config.ELEVENLABS_API_KEY && config.ELEVENLABS_API_KEY !== 'ELEVENLABS_API_KEY_PLACEHOLDER',
      publicBaseUrl: config.PUBLIC_BASE_URL,
    }
  });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(config.PORT, config.HOST, () => {
  console.log(`🚀 Server listening on http://${config.HOST}:${config.PORT}`);
  console.log(`📁 Upload directory: ${path.resolve(config.UPLOAD_DIR)}`);
  console.log(`📂 Output directory: ${path.resolve(config.OUTPUT_DIR)}`);
  console.log(`🔑 ElevenLabs API configured: ${config.ELEVENLABS_API_KEY !== 'ELEVENLABS_API_KEY_PLACEHOLDER'}`);
  console.log(`🌐 Public base URL: ${config.PUBLIC_BASE_URL}`);
});