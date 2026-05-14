import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { processBatch } from '../../src/utils/batch.js';
import { log } from '../../src/utils/log.js';

describe('Batch Processing Utility', () => {
    it('should process all items in a single batch', async () => {
        const items = [1, 2, 3];
        const processed = [];
        const result = await processBatch(items, async (item) => {
            processed.push(item);
        }, { batchSize: 5 });

        assert.strictEqual(result.processed, 3);
        assert.strictEqual(result.errors, 0);
        assert.deepStrictEqual(processed, [1, 2, 3]);
    });

    it('should process items in multiple batches', async () => {
        const items = [1, 2, 3, 4, 5];
        const processed = [];
        const result = await processBatch(items, async (item) => {
            processed.push(item);
        }, { batchSize: 2, delayBetweenBatches: 10 });

        assert.strictEqual(result.processed, 5);
        assert.deepStrictEqual(processed, [1, 2, 3, 4, 5]);
    });

    it('should retry failed items and succeed', async () => {
        const items = [1];
        let attempts = 0;
        
        // Mock the warning logger to verify it's called
        const warningMock = mock.method(log, 'warning', () => {});

        const result = await processBatch(items, async () => {
            attempts++;
            if (attempts < 2) throw new Error('Temporary failure');
        }, { maxRetries: 3, retryDelay: 10 });

        assert.strictEqual(result.processed, 1);
        assert.strictEqual(result.errors, 0);
        assert.strictEqual(attempts, 2);
        assert.strictEqual(warningMock.mock.callCount(), 1);
        
        warningMock.mock.restore();
    });

    it('should fail after maximum retries', async () => {
        const items = [1];
        let attempts = 0;
        
        const errorMock = mock.method(log, 'error', () => {});
        const warningMock = mock.method(log, 'warning', () => {});

        const result = await processBatch(items, async () => {
            attempts++;
            throw new Error('Permanent failure');
        }, { maxRetries: 2, retryDelay: 10 });

        assert.strictEqual(result.processed, 0);
        assert.strictEqual(result.errors, 1);
        assert.strictEqual(attempts, 2);
        
        // Should have 2 warnings (each failure) and 1 error (final failure)
        assert.strictEqual(warningMock.mock.callCount(), 2);
        assert.strictEqual(errorMock.mock.callCount(), 1);
        
        errorMock.mock.restore();
        warningMock.mock.restore();
    });
    
    it('should work with the warn() alias', async () => {
        const warnMock = mock.method(log, 'warn', () => {});
        log.warn('Test alias');
        assert.strictEqual(warnMock.mock.callCount(), 1);
        warnMock.mock.restore();
    });
});
