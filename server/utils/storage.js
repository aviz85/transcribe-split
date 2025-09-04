'use strict';

// In-memory job store (replace with DB in production)
const jobs = new Map();

// SSE clients per job
const sseClients = new Map(); // jobId -> Set(res)

const addSseClient = (jobId, res) => {
  if (!sseClients.has(jobId)) sseClients.set(jobId, new Set());
  sseClients.get(jobId).add(res);
  reqOnClose(res, () => {
    const clients = sseClients.get(jobId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        sseClients.delete(jobId);
      }
    }
  });
};

const reqOnClose = (res, cb) => {
  res.on('close', cb);
  res.on('finish', cb);
  res.on('error', cb);
};

const sseSend = (jobId, event, data) => {
  const set = sseClients.get(jobId);
  if (!set) return;
  const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(line);
    } catch (err) {
      console.error('SSE send error:', err);
    }
  }
};

module.exports = {
  jobs,
  sseClients,
  addSseClient,
  sseSend,
};
