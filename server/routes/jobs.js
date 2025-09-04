'use strict';

const express = require('express');
const { jobs, addSseClient } = require('../utils/storage');

const router = express.Router();

// SSE stream for job updates
router.get('/:id/stream', (req, res) => {
  const jobId = req.params.id;
  const job = jobs.get(jobId);
  
  if (!job) {
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
  res.write(`event: snapshot\ndata: ${JSON.stringify(job)}\n\n`);
  
  addSseClient(jobId, res);
});

// Get job status
router.get('/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// Get all jobs (for debugging)
router.get('/', (req, res) => {
  const allJobs = Array.from(jobs.values()).map(job => ({
    id: job.id,
    status: job.status,
    originalName: job.originalName,
    createdAt: job.createdAt,
    totalSegments: job.totalSegments,
    completedTranscriptions: job.transcriptions.filter(t => t.status === 'completed').length,
  }));
  res.json(allJobs);
});

module.exports = router;
