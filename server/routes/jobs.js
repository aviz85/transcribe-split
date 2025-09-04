'use strict';

const express = require('express');
const { jobs, addSseClient } = require('../utils/storage');

const router = express.Router();

// SSE stream for job updates
router.get('/:id/stream', (req, res) => {
  const jobId = req.params.id;
  console.log(`🔄 [CLIENT->SERVER] SSE stream connection requested for job ${jobId}`);
  const job = jobs.get(jobId);
  
  if (!job) {
    console.warn(`❌ [SERVER->CLIENT] Job ${jobId} not found for SSE stream`);
    return res.status(404).json({ error: 'Job not found' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });

  // Send initial state
  console.log(`📤 [SERVER->CLIENT] SSE stream established for job ${jobId}, sending initial state`);
  res.write(`event: snapshot\ndata: ${JSON.stringify(job)}\n\n`);
  
  addSseClient(jobId, res);
  console.log(`🔗 [SERVER->CLIENT] SSE client added to job ${jobId}`);
});

// Get job status
router.get('/:id', (req, res) => {
  const jobId = req.params.id;
  console.log(`📋 [CLIENT->SERVER] Job status requested for ${jobId}`);
  const job = jobs.get(jobId);
  if (!job) {
    console.warn(`❌ [SERVER->CLIENT] Job ${jobId} not found`);
    return res.status(404).json({ error: 'Job not found' });
  }
  console.log(`✅ [SERVER->CLIENT] Job status sent for ${jobId}: ${job.status}`);
  res.json(job);
});

// Get all jobs (for debugging)
router.get('/', (req, res) => {
  console.log('📋 [CLIENT->SERVER] All jobs list requested');
  const allJobs = Array.from(jobs.values()).map(job => ({
    id: job.id,
    status: job.status,
    originalName: job.originalName,
    createdAt: job.createdAt,
    totalSegments: job.totalSegments,
    completedTranscriptions: job.transcriptions.filter(t => t.status === 'completed').length,
  }));
  console.log(`✅ [SERVER->CLIENT] Jobs list sent: ${allJobs.length} jobs`);
  res.json(allJobs);
});

module.exports = router;
