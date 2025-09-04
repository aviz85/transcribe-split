'use strict';

const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  PORT: process.env.PORT || 5000,
  HOST: process.env.HOST || '0.0.0.0',
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || 'ELEVENLABS_API_KEY_PLACEHOLDER',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || 'WEBHOOK_SECRET_PLACEHOLDER',
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : `http://localhost:${process.env.PORT || 5000}`,
  UPLOAD_DIR: 'uploads',
  OUTPUT_DIR: 'outputs',
  SEGMENT_DURATION: 15 * 60, // 15 minutes in seconds
};
