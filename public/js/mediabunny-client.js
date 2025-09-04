/**
 * MediaBunny Client-Side Processing
 * Handles file upload, splitting into 15-minute segments, and conversion to MP3/WAV
 */

class MediaBunnyProcessor {
    constructor() {
        this.segments = [];
        this.onProgress = null;
        this.onSegmentComplete = null;
        this.onAllComplete = null;
        this.onError = null;
    }

    /**
     * Process a file: split into <=15 minute segments and convert to audio
     * @param {File} file - The input video/audio file
     * @param {Object} options - Processing options
     */
    async processFile(file, options = {}) {
        const maxDuration = options.maxDuration || 15 * 60; // 15 minutes in seconds
        
        try {
            this.onProgress?.({ stage: 'initializing', progress: 0 });

            // Wait for MediaBunny to be available with timeout
            let attempts = 0;
            const maxAttempts = 50; // 5 seconds timeout
            
            while (!window.MediaBunny && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            
            if (!window.MediaBunny) {
                throw new Error('MediaBunny failed to load after 5 seconds');
            }
            
            console.log('🔍 [MEDIABUNNY] MediaBunny available, extracting modules...');
            
            // Use MediaBunny modules from global object
            const { Input, Output, Conversion, WavOutputFormat, Mp3OutputFormat, BlobSource, BufferTarget, ALL_FORMATS, canEncodeAudio } = window.MediaBunny;
            
            console.log('✅ [MEDIABUNNY] All modules extracted successfully');

            // Create input from file
            const input = new Input({
                source: new BlobSource(file),
                formats: ALL_FORMATS,
            });

            this.onProgress?.({ stage: 'analyzing', progress: 0.1 });

            // Get file duration and metadata
            const totalDuration = await input.computeDuration();
            const audioTrack = await input.getPrimaryAudioTrack();
            
            if (!audioTrack) {
                throw new Error('No audio track found in the file');
            }

            const { sampleRate, numberOfChannels } = audioTrack;
            
            // Try to use MP3 with fallback to WAV
            let outputFormat, fileExtension, mimeType, mp3Supported;
            
            try {
                // Test MP3 support first
                mp3Supported = await canEncodeAudio('mp3').catch(() => false);
                
                if (!mp3Supported) {
                    // Try to register MP3 encoder if available
                    console.log('🔄 [MEDIABUNNY] MP3 not supported, checking for encoder...');
                    
                    // Simple MP3 encoder registration attempt
                    if (window.MediaBunnyMp3Encoder?.registerMp3Encoder) {
                        console.log('🎵 [MEDIABUNNY] Found MP3 encoder, registering...');
                        window.MediaBunnyMp3Encoder.registerMp3Encoder();
                        // Test again after registration
                        mp3Supported = await canEncodeAudio('mp3').catch(() => false);
                        console.log('🔍 [MEDIABUNNY] MP3 support after registration:', mp3Supported);
                    }
                }
                
                if (mp3Supported) {
                    outputFormat = new Mp3OutputFormat();
                    fileExtension = 'mp3';
                    mimeType = 'audio/mpeg';
                } else {
                    outputFormat = new WavOutputFormat();
                    fileExtension = 'wav';
                    mimeType = 'audio/wav';
                }
            } catch (error) {
                console.warn('⚠️ [MEDIABUNNY] Error checking MP3 support:', error);
                // Fallback to WAV
                mp3Supported = false;
                outputFormat = new WavOutputFormat();
                fileExtension = 'wav';
                mimeType = 'audio/wav';
            }

            console.log('MediaBunny encoding options:', {
                mp3Supported,
                format: fileExtension.toUpperCase(),
                sampleRate: mp3Supported ? '44.1kHz + 128kbps' : '16kHz WAV',
                channels: 'Mono',
                expectedSizeReduction: '75%',
                expectedSize: `~${Math.round(totalDuration / 60 * 0.7)}MB (compressed)`
            });

            this.onProgress?.({ 
                stage: 'processing', 
                progress: 0.2, 
                info: `Using ${fileExtension.toUpperCase()} format (${mp3Supported ? '128kbps' : 'uncompressed'}), total duration: ${Math.round(totalDuration)}s`
            });

            // Calculate number of segments
            const segmentCount = Math.ceil(totalDuration / maxDuration);
            this.segments = [];

            // Process each segment
            for (let i = 0; i < segmentCount; i++) {
                const startTime = i * maxDuration;
                const endTime = Math.min(totalDuration, startTime + maxDuration);
                const segmentDuration = endTime - startTime;

                this.onProgress?.({ 
                    stage: 'processing', 
                    progress: 0.2 + (i / segmentCount) * 0.7,
                    info: `Processing segment ${i + 1}/${segmentCount} (${Math.round(startTime)}s - ${Math.round(endTime)}s)`
                });

                // Create output for this segment
                const output = new Output({
                    format: outputFormat,
                    target: new BufferTarget(),
                });

                // Configure conversion with trim and proper MP3 compression
                const conversion = await Conversion.init({
                    input,
                    output,
                    trim: {
                        start: startTime,
                        end: endTime
                    },
                    audio: {
                        sampleRate: mp3Supported ? 44100 : sampleRate, // Standard quality for MP3, original for WAV
                        numberOfChannels: Math.min(numberOfChannels, 2), // Stereo max
                        bitrate: mp3Supported ? 128000 : undefined, // 128kbps for MP3 only
                        forceTranscode: true // Force re-encoding
                    }
                });

                // Set up progress tracking for this segment
                conversion.onProgress = (segmentProgress) => {
                    const overallProgress = 0.2 + ((i + segmentProgress) / segmentCount) * 0.7;
                    this.onProgress?.({ 
                        stage: 'processing', 
                        progress: overallProgress,
                        info: `Segment ${i + 1}/${segmentCount}: ${Math.round(segmentProgress * 100)}%`
                    });
                };

                // Execute conversion
                await conversion.execute();

                // Get the result buffer
                const audioBuffer = output.target.buffer;
                const audioBlob = new Blob([audioBuffer], { type: mimeType });

                const segment = {
                    index: i,
                    startTime,
                    endTime,
                    duration: segmentDuration,
                    blob: audioBlob,
                    filename: `segment_${i + 1}.${fileExtension}`,
                    mimeType,
                    size: audioBlob.size
                };

                this.segments.push(segment);
                this.onSegmentComplete?.(segment);
            }

            this.onProgress?.({ stage: 'complete', progress: 1.0, info: `Created ${segmentCount} segments` });
            this.onAllComplete?.(this.segments);

            return this.segments;

        } catch (error) {
            console.error('MediaBunny processing error:', error);
            this.onError?.(error);
            throw error;
        }
    }

    /**
     * Get all processed segments
     */
    getSegments() {
        return this.segments;
    }

    /**
     * Download a specific segment
     */
    downloadSegment(segment) {
        const url = URL.createObjectURL(segment.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = segment.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Download all segments as a ZIP (requires JSZip)
     */
    async downloadAllSegments() {
        if (typeof JSZip === 'undefined') {
            // Fallback: download individually
            this.segments.forEach(segment => this.downloadSegment(segment));
            return;
        }

        const zip = new JSZip();
        
        this.segments.forEach(segment => {
            zip.file(segment.filename, segment.blob);
        });

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'audio_segments.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Export for use in other modules
window.MediaBunnyProcessor = MediaBunnyProcessor;
