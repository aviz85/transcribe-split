Transcribe Split

- Upload a video/audio file
- Uses Mediabunny to split into <=15 min audio chunks (MP3 if supported, fallback WAV)
- Sends each chunk to ElevenLabs Scribe (async) with webhook callbacks
- Aggregates transcripts and streams progress via SSE

Setup

1. Create .env and set:
- ELEVENLABS_API_KEY=...
- WEBHOOK_SECRET=your_shared_secret
- PUBLIC_BASE_URL=https://your-ngrok-subdomain.ngrok.app

2. Install deps: `npm install`

3. Run: `npm run dev` and open http://localhost:3000

Links

- Mediabunny: https://mediabunny.dev/

