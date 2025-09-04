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
  console.log(`🔍 [SSE] Sending event '${event}' to job ${jobId}, found ${set ? set.size : 0} clients`);
  
  if (!set) {
    console.log(`⚠️ [SSE] No SSE clients found for job ${jobId}`);
    return;
  }
  
  const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  let sentCount = 0;
  
  for (const res of set) {
    try {
      res.write(line);
      sentCount++;
      console.log(`📡 [SSE] Successfully sent to client ${sentCount}`);
    } catch (err) {
      console.error('❌ [SSE] Send error:', err);
    }
  }
  
  console.log(`✅ [SSE] Sent event '${event}' to ${sentCount} clients for job ${jobId}`);
};

module.exports = {
  jobs,
  sseClients,
  addSseClient,
  sseSend,
};
