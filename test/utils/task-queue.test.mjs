import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RatePriority } from '../../src/utils/rate-limit.js';

test('TaskQueue - Priority-based Execution', async (t) => {
  // We need to mock some things or use a fresh instance if possible.
  // Since taskQueue is a singleton, we might need to be careful.
  // For this test, I'll import the TaskQueue class if I can, OR just use the singleton.
  // Actually, I'll just mock the graphql dependency and log since they are used by the singleton.
  
  // I'll re-import the module to get a fresh state if possible (requires ESM tricks)
  // Or I can just trust the logic.
  
  // Actually, let's just use the taskQueue directly but mock its getRateLimit
  const { taskQueue } = await import('../../src/utils/rate-limit.js');
  
  await t.test('should execute higher priority tasks first regardless of enqueue order', async () => {
    let callOrder = [];
    
    // Mock getRateLimit to always allow
    const originalGetRL = taskQueue.getRateLimit.bind(taskQueue);
    taskQueue.getRateLimit = async () => ({ remaining: 5000, limit: 5000 });
    
    const task1 = () => { callOrder.push('STANDARD-1'); return 's1'; };
    const task2 = () => { callOrder.push('CRITICAL'); return 'c'; };
    const task3 = () => { callOrder.push('MAINTENANCE'); return 'm'; };
    const task4 = () => { callOrder.push('STANDARD-2'); return 's2'; };

    // Enqueue them. Due to microtask/async, we can enqueue them all before they start draining.
    // Wait, the singleton starts processing immediately on first enqueue.
    // To test sorting, I'll pause processing or enqueue very quickly.
    
    const p1 = taskQueue.enqueue(task1, RatePriority.STANDARD);
    const p2 = taskQueue.enqueue(task2, RatePriority.CRITICAL);
    const p3 = taskQueue.enqueue(task3, RatePriority.MAINTENANCE);
    const p4 = taskQueue.enqueue(task4, RatePriority.STANDARD);
    
    await Promise.all([p1, p2, p3, p4]);
    
    // Expected order: CRITICAL (200), then STANDARD-1, STANDARD-2 (500), then MAINTENANCE (1000)
    // Actually, depending on when process() loop runs, STANDARD-1 might run first.
    // But since taskQueue.process() is async, and enqueue does `if (!this.processing) this.process()`,
    // and process() has an `await rl` which is a microtask boundary...
    // All 4 enqueues might happen before the first loop iteration finishes.
    
    assert.strictEqual(callOrder[0], 'CRITICAL', 'CRITICAL task should have jumped to front (or run first)');
    // We don't necessarily care about order within same priority, but CRITICAL must be before MAINTENANCE.
    const criticalIdx = callOrder.indexOf('CRITICAL');
    const maintenanceIdx = callOrder.indexOf('MAINTENANCE');
    assert.ok(criticalIdx < maintenanceIdx, 'CRITICAL should run before MAINTENANCE');
    
    taskQueue.getRateLimit = originalGetRL;
  });

  await t.test('should skip maintenance but run critical when budget is low', async () => {
    const originalGetRL = taskQueue.getRateLimit.bind(taskQueue);
    // Budget is 300: allows CRITICAL (200) but not STANDARD (500)
    taskQueue.getRateLimit = async () => ({ remaining: 300, limit: 5000 });
    
    const criticalTask = async () => 'ok';
    const standardTask = async () => 'skipped';
    
    const p1 = taskQueue.enqueue(criticalTask, RatePriority.CRITICAL);
    const p2 = taskQueue.enqueue(standardTask, RatePriority.STANDARD);
    
    const res1 = await p1;
    assert.strictEqual(res1, 'ok');
    
    await assert.rejects(p2, { message: /Throttled/ });
    
    taskQueue.getRateLimit = originalGetRL;
  });
});
