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

            // Wait for MediaBunny to be available  
            while (!window.Mediabunny) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Use MediaBunny modules from global object
            const { Input, Output, Conversion, WavOutputFormat, Mp3OutputFormat, BlobSource, BufferTarget, ALL_FORMATS, canEncodeAudio } = window.Mediabunny;

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
            
            // Always use WAV with lower quality settings to reduce file size
            // Since ElevenLabs accepts both MP3 and WAV, we can use compressed WAV
            const outputFormat = new WavOutputFormat();
            const fileExtension = 'wav';
            const mimeType = 'audio/wav';
            const mp3Supported = false; // Force WAV for now

            console.log('MediaBunny encoding options:', {
                mp3Supported,
                format: fileExtension.toUpperCase(),
                bitrate: mp3Supported ? '128kbps' : 'N/A',
                expectedSize: mp3Supported ? `~${Math.round(totalDuration / 60)}MB` : 'Variable'
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
                        sampleRate: 22050, // Lower sample rate for smaller files (half of 44.1kHz)
                        numberOfChannels: 1, // Force mono to reduce file size by half
                        bitDepth: 16, // Standard 16-bit depth
                        forceTranscode: true // Force re-encoding to apply compression
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
