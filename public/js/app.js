class TranscribeApp {
    constructor() {
        this.currentJob = null;
        this.eventSource = null;
        this.segments = [];
        this.processor = new MediaBunnyProcessor();
        
        this.initializeElements();
        this.attachEventListeners();
        this.setupMediaBunnyProcessor();
    }

    initializeElements() {
        this.uploadZone = document.getElementById('uploadZone');
        this.fileInput = document.getElementById('fileInput');
        this.uploadError = document.getElementById('uploadError');
        this.progressSection = document.getElementById('progressSection');
        this.transcriptSection = document.getElementById('transcriptSection');
        this.statusIcon = document.getElementById('statusIcon');
        this.statusText = document.getElementById('statusText');
        this.jobDetails = document.getElementById('jobDetails');
        this.progressText = document.getElementById('progressText');
        this.progressDetails = document.getElementById('progressDetails');
        this.progressBar = document.querySelector('.progress-fill');
        this.segmentsList = document.getElementById('segmentsGrid');
        this.transcriptText = document.getElementById('transcriptContent');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.newUploadBtn = document.getElementById('newUploadBtn');
    }

    attachEventListeners() {
        // File input change
        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileSelect(e.target.files[0]);
            }
        });

        // Drag and drop
        this.uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadZone.classList.add('dragover');
        });

        this.uploadZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this.uploadZone.classList.remove('dragover');
        });

        this.uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadZone.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelect(files[0]);
            }
        });

        // Click to upload
        this.uploadZone.addEventListener('click', () => {
            this.fileInput.click();
        });

        // New upload button
        this.newUploadBtn?.addEventListener('click', () => {
            this.resetApp();
        });

        // Download transcript
        this.downloadBtn?.addEventListener('click', () => {
            this.downloadTranscript();
        });
    }

    setupMediaBunnyProcessor() {
        this.processor.onProgress = (progress) => {
            this.updateProgress(progress);
        };

        this.processor.onSegmentComplete = (segment) => {
            this.handleSegmentComplete(segment);
        };

        this.processor.onAllComplete = (segments) => {
            this.handleAllSegmentsComplete(segments);
        };

        this.processor.onError = (error) => {
            this.showError(`Processing failed: ${error.message}`);
        };
    }

    async handleFileSelect(file) {
        // Validate file type
        const allowedTypes = [
            'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
            'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm'
        ];
        
        if (!allowedTypes.includes(file.type)) {
            this.showError('Please select a valid audio or video file.');
            return;
        }

        // Check file size (2GB limit)
        if (file.size > 2 * 1024 * 1024 * 1024) {
            this.showError('File size must be less than 2GB.');
            return;
        }

        this.clearError();
        this.showProgress();
        this.updateJobDetails(file.name, this.formatFileSize(file.size));

        try {
            // Start client-side processing
            this.segments = await this.processor.processFile(file);
            
            // If we have segments, upload them for transcription
            if (this.segments && this.segments.length > 0) {
                await this.handleAllSegmentsComplete(this.segments);
            }
        } catch (error) {
            console.error('File processing failed:', error);
            this.showError(`Processing failed: ${error.message}`);
        }
    }

    updateProgress(progress) {
        const { stage, progress: pct, info } = progress;
        
        this.progressBar.style.width = `${Math.round(pct * 100)}%`;
        this.progressText.textContent = `${Math.round(pct * 100)}%`;
        
        let statusText = '';
        let statusIcon = 'fas fa-cog fa-spin';
        
        switch (stage) {
            case 'initializing':
                statusText = 'Initializing MediaBunny...';
                break;
            case 'analyzing':
                statusText = 'Analyzing media file...';
                break;
            case 'processing':
                statusText = 'Processing audio segments...';
                break;
            case 'complete':
                statusText = 'Processing complete!';
                statusIcon = 'fas fa-check-circle text-success';
                break;
        }
        
        this.statusText.textContent = statusText;
        this.statusIcon.className = statusIcon;
        this.progressDetails.textContent = info || '';
    }

    async handleSegmentComplete(segment) {
        // Add segment to UI
        this.addSegmentToList(segment);
        
        // Upload segment to server for transcription
        await this.uploadSegmentForTranscription(segment);
    }

    async handleAllSegmentsComplete(segments) {
        this.updateProgress({ 
            stage: 'complete', 
            progress: 1.0, 
            info: `Created ${segments.length} segments. Starting transcriptions...`
        });

        // Create job on server
        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: this.segments[0]?.filename?.replace(/segment_\d+\./, '') || 'audio',
                    segmentCount: segments.length
                })
            });

            if (!response.ok) throw new Error('Failed to create job');
            
            const { jobId } = await response.json();
            this.currentJob = jobId;
            
            // Start SSE connection
            this.connectToJobStream(jobId);
            
            // Upload all segments
            for (const segment of segments) {
                await this.uploadSegmentForTranscription(segment);
            }
            
        } catch (error) {
            this.showError(`Failed to create transcription job: ${error.message}`);
        }
    }

    async uploadSegmentForTranscription(segment) {
        if (!this.currentJob) return;
        
        try {
            // Show upload progress UI
            this.showSegmentUploadProgress(segment.index);
            
            // Convert blob to array buffer
            console.log(`🔍 [UPLOAD] Processing segment ${segment.index}, blob size: ${segment.blob?.size || 0}, type: ${segment.blob?.type || 'unknown'}`);
            const arrayBuffer = await segment.blob.arrayBuffer();
            console.log(`🔍 [UPLOAD] ArrayBuffer created, size: ${arrayBuffer.byteLength} bytes`);
            
            // Create XMLHttpRequest to track upload progress
            const uploadPromise = new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                
                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) {
                        const percentComplete = (event.loaded / event.total) * 100;
                        this.updateSegmentUploadProgress(segment.index, percentComplete, event.loaded, event.total);
                    }
                });
                
                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(xhr.response);
                    } else {
                        reject(new Error(`Upload failed with status ${xhr.status}`));
                    }
                });
                
                xhr.addEventListener('error', () => {
                    reject(new Error('Upload failed due to network error'));
                });
                
                xhr.open('POST', `/api/upload/${this.currentJob}/segment/${segment.index}`);
                xhr.setRequestHeader('Content-Type', segment.mimeType);
                xhr.send(arrayBuffer);
            });

            await uploadPromise;
            
            // Hide upload progress and update segment status
            this.hideSegmentUploadProgress(segment.index);
            this.updateSegmentStatus(segment.index, 'uploaded', 'Uploaded for transcription');
            
        } catch (error) {
            console.error(`Failed to upload segment ${segment.index}:`, error);
            this.hideSegmentUploadProgress(segment.index);
            this.updateSegmentStatus(segment.index, 'error', error.message);
        }
    }

    addSegmentToList(segment) {
        if (!this.segmentsList) {
            console.error('Segments list element not found');
            return;
        }
        
        const segmentElement = document.createElement('div');
        segmentElement.className = 'segment-card';
        segmentElement.innerHTML = `
            <div class="segment-title">
                <i class="fas fa-play"></i>
                Segment ${segment.index + 1}
                <span style="float: right; font-size: 0.8em;">${this.formatDuration(segment.duration)}</span>
            </div>
            <div class="segment-info">
                ${this.formatTime(segment.startTime)} - ${this.formatTime(segment.endTime)} 
                (${this.formatFileSize(segment.size)})
            </div>
            <div class="segment-status" data-segment="${segment.index}">
                <i class="fas fa-clock"></i> Processing...
            </div>
            <div class="segment-upload-progress" data-segment="${segment.index}" style="display: none;">
                <div style="font-size: 0.8em; margin-bottom: 0.3rem;">Uploading...</div>
                <div class="upload-progress-bar" style="width: 100%; height: 4px; background: #e0e0e0; border-radius: 2px; overflow: hidden;">
                    <div class="upload-progress-fill" style="width: 0%; height: 100%; background: #007bff; transition: width 0.3s ease;"></div>
                </div>
                <div class="upload-progress-text" style="font-size: 0.75em; color: #666; margin-top: 0.2rem;">0% uploaded</div>
            </div>
            <div class="segment-transcript" data-segment="${segment.index}" style="display: none;">
                <div class="transcript-content" style="margin-top: 0.5rem; padding: 0.5rem; background: #f8f9fa; border-radius: 4px; font-size: 0.85em;"></div>
            </div>
        `;
        
        this.segmentsList.appendChild(segmentElement);
    }

    showSegmentUploadProgress(segmentIndex) {
        const uploadProgress = document.querySelector(`[data-segment="${segmentIndex}"].segment-upload-progress`);
        if (uploadProgress) {
            uploadProgress.style.display = 'block';
        }
    }

    updateSegmentUploadProgress(segmentIndex, percentComplete, loaded = 0, total = 0) {
        const uploadProgress = document.querySelector(`[data-segment="${segmentIndex}"].segment-upload-progress`);
        if (!uploadProgress) return;
        
        const progressFill = uploadProgress.querySelector('.upload-progress-fill');
        const progressText = uploadProgress.querySelector('.upload-progress-text');
        
        if (progressFill) {
            progressFill.style.width = `${percentComplete}%`;
        }
        
        if (progressText) {
            if (loaded && total) {
                progressText.textContent = `${Math.round(percentComplete)}% uploaded (${this.formatFileSize(loaded)} / ${this.formatFileSize(total)})`;
            } else {
                progressText.textContent = `${Math.round(percentComplete)}% uploaded`;
            }
        }
    }

    hideSegmentUploadProgress(segmentIndex) {
        const uploadProgress = document.querySelector(`[data-segment="${segmentIndex}"].segment-upload-progress`);
        if (uploadProgress) {
            uploadProgress.style.display = 'none';
        }
    }

    updateSegmentStatus(segmentIndex, status, message) {
        const statusElement = document.querySelector(`[data-segment="${segmentIndex}"].segment-status`);
        if (!statusElement) return;
        
        let icon = 'fas fa-clock';
        let className = '';
        
        switch (status) {
            case 'uploaded':
                icon = 'fas fa-upload';
                className = 'text-info';
                break;
            case 'transcribing':
                icon = 'fas fa-microphone fa-pulse';
                className = 'text-warning';
                break;
            case 'completed':
                icon = 'fas fa-check-circle';
                className = 'text-success';
                break;
            case 'error':
                icon = 'fas fa-exclamation-triangle';
                className = 'text-danger';
                break;
        }
        
        statusElement.innerHTML = `<i class="${icon} ${className}"></i> ${message}`;
    }

    connectToJobStream(jobId) {
        if (this.eventSource) {
            this.eventSource.close();
        }

        this.eventSource = new EventSource(`/api/jobs/${jobId}/stream`);

        this.eventSource.addEventListener('segment_uploaded', (e) => {
            const { segmentIndex } = JSON.parse(e.data);
            this.updateSegmentStatus(segmentIndex, 'uploaded', 'Uploaded');
        });

        this.eventSource.addEventListener('segment_transcribing', (e) => {
            const { segmentIndex } = JSON.parse(e.data);
            this.updateSegmentStatus(segmentIndex, 'transcribing', 'Transcribing...');
        });

        this.eventSource.addEventListener('segment_completed', (e) => {
            const { segmentIndex, transcription } = JSON.parse(e.data);
            this.updateSegmentStatus(segmentIndex, 'completed', 'Completed');
            this.addTranscription(segmentIndex, transcription);
        });

        // Handle transcription_complete events from ElevenLabs webhook
        this.eventSource.addEventListener('transcription_complete', (e) => {
            const data = JSON.parse(e.data);
            console.log('📨 [CLIENT] Received transcription:', data);
            
            // Check if segment element exists, if not create it (for direct MP3 uploads)
            const existingSegment = document.querySelector(`[data-segment="${data.segmentIndex}"].segment-transcript`);
            if (!existingSegment) {
                console.log('🔧 [CLIENT] Creating missing segment element for direct MP3 upload');
                this.createSegmentElement({
                    index: data.segmentIndex,
                    startTime: 0,
                    endTime: 0,
                    duration: 0,
                    size: 0
                });
            }
            
            this.updateSegmentStatus(data.segmentIndex, 'completed', 'Transcribed');
            this.addTranscription(data.segmentIndex, data.text);
        });

        this.eventSource.addEventListener('segment_error', (e) => {
            const { segmentIndex, error } = JSON.parse(e.data);
            this.updateSegmentStatus(segmentIndex, 'error', error);
        });

        this.eventSource.addEventListener('job_completed', (e) => {
            const { combinedTranscript } = JSON.parse(e.data);
            this.handleJobComplete(combinedTranscript);
        });

        this.eventSource.onerror = (error) => {
            console.error('SSE error:', error);
        };
    }

    addTranscription(segmentIndex, transcription) {
        console.log(`🎯 [CLIENT] Adding transcription for segment ${segmentIndex}:`, transcription?.substring(0, 100) + '...');
        
        const transcriptElement = document.querySelector(`[data-segment="${segmentIndex}"].segment-transcript`);
        if (transcriptElement) {
            transcriptElement.style.display = 'block';
            const contentElement = transcriptElement.querySelector('.transcript-content');
            if (contentElement) {
                contentElement.textContent = transcription;
                console.log(`✅ [CLIENT] Transcription displayed for segment ${segmentIndex}`);
            } else {
                console.error(`❌ [CLIENT] No .transcript-content element found for segment ${segmentIndex}`);
            }
        } else {
            console.error(`❌ [CLIENT] No .segment-transcript element found for segment ${segmentIndex}`);
        }
        
        // Update combined transcript
        this.updateCombinedTranscript();
    }

    updateCombinedTranscript() {
        const transcripts = [];
        document.querySelectorAll('.segment-transcript .transcript-content').forEach((el, index) => {
            if (el.textContent.trim()) {
                transcripts.push(el.textContent.trim());
            }
        });
        
        if (transcripts.length > 0) {
            this.transcriptText.textContent = transcripts.join(' ');
            this.transcriptSection.style.display = 'block';
        }
    }

    handleJobComplete(combinedTranscript) {
        this.transcriptText.textContent = combinedTranscript || this.transcriptText.textContent;
        this.transcriptSection.style.display = 'block';
        
        this.statusText.textContent = 'Transcription complete!';
        this.statusIcon.className = 'fas fa-check-circle text-success';
        
        // Keep SSE connection alive for future uploads
        console.log('✅ [CLIENT] Job completed, keeping SSE connection alive for next upload');
    }

    downloadTranscript() {
        const transcript = this.transcriptText.textContent;
        if (!transcript) return;
        
        const blob = new Blob([transcript], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'transcript.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    showProgress() {
        this.uploadZone.style.display = 'none';
        this.progressSection.style.display = 'block';
    }

    showError(message) {
        this.uploadError.textContent = message;
        this.uploadError.style.display = 'block';
    }

    clearError() {
        this.uploadError.style.display = 'none';
    }

    updateJobDetails(filename, filesize) {
        this.jobDetails.innerHTML = `
            <div><strong>File:</strong> ${filename}</div>
            <div><strong>Size:</strong> ${filesize}</div>
        `;
    }

    resetApp() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        
        this.currentJob = null;
        this.segments = [];
        this.fileInput.value = '';
        
        this.uploadZone.style.display = 'block';
        this.progressSection.style.display = 'none';
        this.transcriptSection.style.display = 'none';
        this.clearError();
        
        if (this.segmentsList) this.segmentsList.innerHTML = '';
        this.transcriptText.textContent = '';
    }

    // Utility methods
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TranscribeApp();
});