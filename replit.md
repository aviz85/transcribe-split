# Overview

Transcribe Split is a client-side audio transcription application that splits large audio/video files into manageable segments and processes them using ElevenLabs' speech-to-text API. The system performs all file processing in the browser using MediaBunny for audio splitting and conversion, then sends segments to a Node.js backend for transcription via ElevenLabs' async API with webhook-based progress updates.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Single-page application** built with vanilla HTML, CSS, and JavaScript
- **Client-side audio processing** using MediaBunny library for file splitting and format conversion
- **Real-time progress updates** via Server-Sent Events (SSE) for live transcription status
- **Drag-and-drop file upload** interface with support for files up to 2GB
- **WebCodecs integration** for MP3 encoding with WAV fallback for unsupported browsers

## Backend Architecture
- **Express.js server** handling API routes and static file serving
- **RESTful API design** with dedicated routes for uploads, jobs, and webhooks
- **Webhook endpoint** for receiving ElevenLabs transcription completion notifications
- **In-memory storage** for job state and SSE client management (not production-ready)
- **Raw body parsing** for large audio segment uploads (up to 200MB per segment)

## File Processing Pipeline
- **15-minute segment splitting** performed entirely in browser using MediaBunny
- **Automatic format conversion** to MP3 (preferred) or WAV (fallback) based on browser support
- **Sequential segment upload** to backend after client-side processing
- **Async transcription** via ElevenLabs API with webhook callbacks for progress tracking

## Real-time Communication
- **Server-Sent Events (SSE)** for pushing transcription progress to clients
- **Webhook signature verification** using HMAC-SHA256 for secure callback handling
- **Job state synchronization** between webhook updates and SSE streams

## Error Handling and Resilience
- **Graceful degradation** from MP3 to WAV encoding based on browser capabilities
- **Comprehensive error handling** for file processing, network requests, and API failures
- **Health check endpoint** for monitoring service status and configuration

# External Dependencies

## Core Runtime Dependencies
- **Express.js 5.1.0** - Web framework for API server
- **MediaBunny 1.13.2** - Client-side audio/video processing and format conversion
- **Axios 1.11.0** - HTTP client for ElevenLabs API communication
- **FormData 4.0.4** - Multipart form handling for file uploads to ElevenLabs
- **Multer 2.0.2** - Middleware for handling multipart form data
- **CORS 2.8.5** - Cross-origin resource sharing configuration
- **dotenv 17.2.2** - Environment variable management

## External API Services
- **ElevenLabs Speech-to-Text API** - Async transcription service with webhook callbacks
- **Webhook signature verification** - HMAC-based security for callback authenticity

## Browser APIs and Standards
- **WebCodecs API** - For MP3 audio encoding (Chrome/Edge support required)
- **File API** - For client-side file reading and processing
- **MediaRecorder API** - For audio format conversion fallbacks
- **Server-Sent Events** - For real-time progress updates

## Development and Deployment Tools
- **ngrok** - Required for local development to provide public HTTPS endpoint for webhooks
- **Node.js runtime** - Server execution environment

## Configuration Requirements
- **ElevenLabs API key** - Authentication for transcription service
- **Webhook secret** - Shared secret for signature verification
- **Public base URL** - HTTPS endpoint accessible by ElevenLabs for webhook delivery

## Known Limitations and Missing Components
- **ElevenLabs API integration** - Current implementation uses placeholder endpoints
- **Webhook signature scheme** - Generic HMAC implementation needs ElevenLabs-specific adjustments
- **Persistence layer** - In-memory storage requires database replacement for production
- **Browser compatibility** - MP3 encoding limited to WebCodecs-supported browsers