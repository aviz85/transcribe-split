const { describe, it, expect } = require('@jest/globals');

describe('Simple Application Tests', () => {
  describe('Configuration', () => {
    it('should load configuration correctly', () => {
      const config = require('../server/config.js');
      
      expect(config.PORT).toBeDefined();
      expect(config.UPLOAD_DIR).toBe('uploads');
      expect(config.OUTPUT_DIR).toBe('outputs');
      expect(config.SEGMENT_DURATION).toBe(300); // 5 minutes
    });
  });

  describe('Crypto Utils', () => {
    it('should export verifyWebhookSignature function', () => {
      const crypto = require('../server/utils/crypto');
      expect(typeof crypto.verifyWebhookSignature).toBe('function');
    });
  });

  describe('Basic Functions', () => {
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
    });

    it('should validate file types', () => {
      const isValidAudioVideo = (mimeType) => {
        return mimeType && (mimeType.startsWith('audio/') || mimeType.startsWith('video/'));
      };

      expect(isValidAudioVideo('audio/mp3')).toBe(true);
      expect(isValidAudioVideo('video/mp4')).toBe(true);
      expect(isValidAudioVideo('text/plain')).toBe(false);
      expect(isValidAudioVideo('')).toBe(false);
    });
  });
});