Transcribe Split (Client-side MediaBunny + ElevenLabs)

- Client-side splitting with MediaBunny (≤15 min segments, MP3 if supported, fallback WAV)
- Server handles ElevenLabs async transcription + webhooks
- Live progress via SSE; combined transcript rendered in UI

## Quick start

1) Install deps: `npm install`
2) Create `.env`:
```
ELEVENLABS_API_KEY=your_key
WEBHOOK_SECRET=your_shared_secret
PUBLIC_BASE_URL=https://your-ngrok-subdomain.ngrok.app
```
3) Run server: `npm run dev` → open http://localhost:3000
4) Start ngrok: `ngrok http 3000` → update `PUBLIC_BASE_URL` to the HTTPS URL

Notes:
- Client accepts files up to 2GB; processing is entirely in-browser.
- Segments are uploaded to the server (default raw body limit: 200MB per segment).

## What is missing to be fully working

1) ElevenLabs Scribe endpoint and params
- File: `server/services/transcriptionService.js`
- The URL and form fields are placeholders and currently return 404.
- Update `url`, headers, and multipart fields to match ElevenLabs Scribe async API (model, language, diarization, webhook URL, metadata, etc.).
- Ensure `xi-api-key` header is set from `.env`.

2) Webhook signature verification
- File: `server/utils/crypto.js` and route `server/routes/webhooks.js`
- Logic assumes an HMAC signature header; adjust to match ElevenLabs’ exact signing scheme and header names.
- If ElevenLabs does not support signing, remove verification or apply their recommended method.

3) PUBLIC_BASE_URL
- Must point to a public HTTPS URL (e.g., ngrok) so ElevenLabs can reach `/api/webhooks/elevenlabs`.

4) Browser/WebCodecs support
- MP3 encoding depends on WebCodecs availability. On unsupported browsers, WAV is used (larger uploads).
- Prefer latest Chrome/Edge; Safari support varies by version.

5) Body size limits (optional)
- Segment uploads use `express.raw({ limit: '200mb' })`. Increase if your segments can exceed this.
- You can lower client MP3 bitrate in `public/js/mediabunny-client.js` to reduce size.

6) Persistence (optional)
- Jobs and transcripts are stored in-memory. For production, replace `server/utils/storage.js` with a DB (Redis/Postgres) to persist across restarts.

7) Deployment (optional)
- Ensure your reverse proxy supports SSE and long-lived HTTP connections.
- Serve over HTTPS for best WebCodecs compatibility.

## How it works

- Client loads MediaBunny bundle (`public/js/mediabunny.min.mjs`) and processes the file locally.
- Segments are posted to: `POST /api/upload/:jobId/segment/:segmentIndex` (raw body, audio/*).
- Server calls ElevenLabs async API per segment and awaits webhooks at `POST /api/webhooks/elevenlabs`.
- SSE stream: `GET /api/jobs/:id/stream` for live updates; combined transcript shown when all segments complete.

## Troubleshooting

- “Failed to fetch dynamically imported module …/node_modules/mediabunny…” → Fixed by bundling: we copy `mediabunny.min.mjs` to `public/js` and load it as a module.
- 404 from ElevenLabs → Update the endpoint and multipart fields to the official Scribe async API.
- Webhook not firing → Verify `PUBLIC_BASE_URL` is HTTPS and reachable; confirm webhook path and secret.

## Links

- Mediabunny: https://mediabunny.dev/

