/**
 * @fileoverview Tests for workflow concurrency configuration
 * Ensures the workflow concurrency settings prevent race conditions
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('workflow concurrency configuration', async (t) => {
  await t.test('workflow has strict concurrency to prevent race conditions', async () => {
    // Check pr-sync.yml
    const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'pr-sync.yml');
    const workflowContent = fs.readFileSync(workflowPath, 'utf8');
    const workflow = yaml.load(workflowContent);
    
    // Verify concurrency configuration exists
    assert(workflow.concurrency, 'Workflow must have concurrency configuration');
    
    // Verify concurrency group is strict
    // Note: We accept both ${{ github.workflow }} and pr-sync-${{ github.event.pull_request.number }}
    const concurrencyGroup = workflow.concurrency.group;
    assert(concurrencyGroup.includes('github.workflow') || concurrencyGroup.includes('pull_request.number'),
      'Concurrency group must be strict to prevent race conditions');
    
    // Verify cancellation is enabled
    assert.equal(workflow.concurrency['cancel-in-progress'], true,
      'Cancel-in-progress must be enabled to prevent duplicate processing');
    
    console.log('✅ Workflow concurrency configuration is correct');
  });
  
  await t.test('application logs concurrency context', async () => {
    const indexPath = path.join(__dirname, '..', 'src', 'index.js');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    
    // Verify concurrency context logging exists in application
    assert(indexContent.includes('Concurrency Context: Event='), 
      'Application must log concurrency context for debugging');
    assert(indexContent.includes('GITHUB_EVENT_NAME'), 
      'Application must log GitHub event name');
    
    console.log('✅ Application includes concurrency context logging');
  });
});
