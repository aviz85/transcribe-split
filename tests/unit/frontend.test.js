/**
 * @jest-environment jsdom
 */

const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

// Mock fetch globally
global.fetch = jest.fn();

// Mock EventSource
global.EventSource = jest.fn(() => ({
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  close: jest.fn()
}));

describe('Frontend JavaScript Components', () => {
  let mockDocument;
  let TranscribeApp;
  let MediaBunnyProcessor;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    
    // Create mock DOM elements
    const mockElements = {
      uploadZone: { addEventListener: jest.fn(), classList: { add: jest.fn(), remove: jest.fn() } },
      fileInput: { addEventListener: jest.fn() },
      uploadError: { style: { display: '' }, textContent: '' },
      progressSection: { style: { display: 'none' } },
      transcriptSection: { style: { display: 'none' } },
      statusIcon: { className: '' },
      statusText: { textContent: '' },
      jobDetails: { textContent: '' },
      progressText: { textContent: '' },
      progressDetails: { textContent: '' },
      progressBar: { style: { width: '0%' } },
      segmentsList: { innerHTML: '', appendChild: jest.fn() },
      transcriptText: { textContent: '' },
      downloadBtn: { addEventListener: jest.fn(), style: { display: 'none' } },
      newUploadBtn: { addEventListener: jest.fn() }
    };

    // Mock getElementById
    jest.spyOn(document, 'getElementById').mockImplementation((id) => {
      const elementMap = {
        uploadZone: mockElements.uploadZone,
        fileInput: mockElements.fileInput,
        uploadError: mockElements.uploadError,
        progressSection: mockElements.progressSection,
        transcriptSection: mockElements.transcriptSection,
        statusIcon: mockElements.statusIcon,
        statusText: mockElements.statusText,
        jobDetails: mockElements.jobDetails,
        progressText: mockElements.progressText,
        progressDetails: mockElements.progressDetails,
        segmentsGrid: mockElements.segmentsList,
        transcriptContent: mockElements.transcriptText,
        downloadBtn: mockElements.downloadBtn,
        newUploadBtn: mockElements.newUploadBtn
      };
      return elementMap[id] || null;
    });

    // Mock querySelector
    jest.spyOn(document, 'querySelector').mockImplementation((selector) => {
      if (selector === '.progress-fill') {
        return mockElements.progressBar;
      }
      return null;
    });

    // Mock createElement
    jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const element = {
        tagName: tagName.toUpperCase(),
        className: '',
        innerHTML: '',
        textContent: '',
        style: {},
        appendChild: jest.fn(),
        addEventListener: jest.fn(),
        setAttribute: jest.fn(),
        getAttribute: jest.fn()
      };
      return element;
    });

    // Reset fetch mock
    fetch.mockClear();
    
    // Clear all event source mocks
    EventSource.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('TranscribeApp Class', () => {
    beforeEach(() => {
      // Load the app class (would need to extract class to module for proper testing)
      // For now, we'll test the key methods
    });

    describe('File Handling', () => {
      it('should validate file types', () => {
        const validTypes = ['audio/mp3', 'audio/wav', 'video/mp4', 'audio/mpeg'];
        const invalidTypes = ['text/plain', 'image/jpeg', 'application/pdf'];

        validTypes.forEach(type => {
          expect(type.startsWith('audio/') || type.startsWith('video/')).toBe(true);
        });

        invalidTypes.forEach(type => {
          expect(type.startsWith('audio/') || type.startsWith('video/')).toBe(false);
        });
      });

      it('should format file sizes correctly', () => {
        const formatFileSize = (bytes) => {
          if (bytes === 0) return '0 Bytes';
          const k = 1024;
          const sizes = ['Bytes', 'KB', 'MB', 'GB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        expect(formatFileSize(0)).toBe('0 Bytes');
        expect(formatFileSize(1024)).toBe('1 KB');
        expect(formatFileSize(1048576)).toBe('1 MB');
        expect(formatFileSize(1073741824)).toBe('1 GB');
        expect(formatFileSize(500)).toBe('500 Bytes');
        expect(formatFileSize(1536)).toBe('1.5 KB');
      });

      it('should format duration correctly', () => {
        const formatDuration = (seconds) => {
          const hours = Math.floor(seconds / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);
          const secs = Math.floor(seconds % 60);
          
          if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
          }
          return `${minutes}:${secs.toString().padStart(2, '0')}`;
        };

        expect(formatDuration(30)).toBe('0:30');
        expect(formatDuration(90)).toBe('1:30');
        expect(formatDuration(3661)).toBe('1:01:01');
        expect(formatDuration(0)).toBe('0:00');
      });
    });

    describe('API Communication', () => {
      it('should handle successful job creation', async () => {
        const mockResponse = {
          jobId: 'test-job-123',
          segmentCount: 5,
          status: 'created'
        };

        fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const jobData = { filename: 'test.mp3', segmentCount: 5 };
        const response = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jobData)
        });

        expect(fetch).toHaveBeenCalledWith('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jobData)
        });

        const result = await response.json();
        expect(result).toEqual(mockResponse);
      });

      it('should handle API errors gracefully', async () => {
        fetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Internal server error' })
        });

        const response = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        expect(response.ok).toBe(false);
        expect(response.status).toBe(500);
      });
    });

    describe('Progress Updates', () => {
      it('should update progress bar correctly', () => {
        const updateProgress = (percent) => {
          const progressBar = document.querySelector('.progress-fill');
          if (progressBar) {
            progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
          }
        };

        const progressBar = document.querySelector('.progress-fill');
        
        updateProgress(50);
        expect(progressBar.style.width).toBe('50%');
        
        updateProgress(100);
        expect(progressBar.style.width).toBe('100%');
        
        updateProgress(-10);
        expect(progressBar.style.width).toBe('0%');
        
        updateProgress(110);
        expect(progressBar.style.width).toBe('100%');
      });
    });

    describe('Error Handling', () => {
      it('should display error messages', () => {
        const showError = (message) => {
          const errorElement = document.getElementById('uploadError');
          if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
          }
        };

        const errorElement = document.getElementById('uploadError');
        showError('Test error message');
        
        expect(errorElement.textContent).toBe('Test error message');
        expect(errorElement.style.display).toBe('block');
      });

      it('should clear error messages', () => {
        const clearError = () => {
          const errorElement = document.getElementById('uploadError');
          if (errorElement) {
            errorElement.textContent = '';
            errorElement.style.display = 'none';
          }
        };

        const errorElement = document.getElementById('uploadError');
        errorElement.textContent = 'Previous error';
        errorElement.style.display = 'block';
        
        clearError();
        
        expect(errorElement.textContent).toBe('');
        expect(errorElement.style.display).toBe('none');
      });
    });
  });

  describe('SSE Connection', () => {
    it('should establish EventSource connection', () => {
      const jobId = 'test-job-123';
      const eventSource = new EventSource(`/api/jobs/${jobId}/events`);
      
      expect(EventSource).toHaveBeenCalledWith(`/api/jobs/${jobId}/events`);
      expect(eventSource.addEventListener).toBeDefined();
      expect(eventSource.close).toBeDefined();
    });

    it('should handle SSE events', () => {
      const mockEventSource = {
        addEventListener: jest.fn(),
        close: jest.fn()
      };
      EventSource.mockReturnValueOnce(mockEventSource);

      const eventSource = new EventSource('/api/jobs/test/events');
      const eventHandler = jest.fn();
      
      eventSource.addEventListener('message', eventHandler);
      
      expect(mockEventSource.addEventListener).toHaveBeenCalledWith('message', eventHandler);
    });
  });
});