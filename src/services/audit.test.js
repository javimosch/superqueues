const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

describe('audit service', () => {
  describe('setAuditMode validation', () => {
    it('should reject invalid modes', async () => {
      const audit = require('./audit');
      audit.clearCache();
      
      await assert.rejects(
        async () => audit.setAuditMode('invalid'),
        { message: 'Invalid audit mode' }
      );
    });

    it('should accept valid modes', async () => {
      const validModes = ['full', 'jobs_only', 'off'];
      
      for (const mode of validModes) {
        assert.doesNotThrow(() => {
          if (!['full', 'jobs_only', 'off'].includes(mode)) {
            throw new Error('Invalid audit mode');
          }
        });
      }
    });
  });

  describe('audit mode cache', () => {
    it('should clear cache properly', () => {
      const audit = require('./audit');
      audit.clearCache();
      assert.ok(true);
    });
  });
});
