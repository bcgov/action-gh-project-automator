/**
 * @fileoverview Tests for workflow concurrency configuration
 * Ensures the workflow concurrency settings prevent race conditions
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

test('workflow concurrency configuration', async (t) => {
  await t.test('workflow has strict concurrency to prevent race conditions', async () => {
    const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'project-board-sync.yml');
    const workflowContent = fs.readFileSync(workflowPath, 'utf8');
    const workflow = yaml.load(workflowContent);
    
    // Verify concurrency configuration exists
    assert(workflow.concurrency, 'Workflow must have concurrency configuration');
    
    // Verify concurrency group is strict (no github.ref)
    const concurrencyGroup = workflow.concurrency.group;
    assert.equal(concurrencyGroup, '${{ github.workflow }}', 
      'Concurrency group must be strict to prevent race conditions between PRs and scheduled runs');
    
    // Verify cancellation is enabled
    assert.equal(workflow.concurrency['cancel-in-progress'], true,
      'Cancel-in-progress must be enabled to prevent duplicate processing');
    
    console.log('✅ Workflow concurrency configuration is correct');
  });
  
  await t.test('workflow includes concurrency context logging', async () => {
    const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'project-board-sync.yml');
    const workflowContent = fs.readFileSync(workflowPath, 'utf8');
    
    // Verify concurrency context is logged
    assert(workflowContent.includes('Event: ${{ github.event_name }}'), 
      'Workflow must log event name for concurrency debugging');
    assert(workflowContent.includes('Ref: ${{ github.ref }}'), 
      'Workflow must log ref for concurrency debugging');
    assert(workflowContent.includes('Concurrency Group: ${{ github.workflow }}'), 
      'Workflow must log concurrency group for debugging');
    assert(workflowContent.includes('Run ID: ${{ github.run_id }}'), 
      'Workflow must log run ID for concurrency debugging');
    
    console.log('✅ Workflow includes concurrency context logging');
  });
  
  await t.test('application logs concurrency context', async () => {
    const indexPath = path.join(__dirname, '..', 'src', 'index.js');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    
    // Verify concurrency context logging exists in application
    assert(indexContent.includes('Concurrency Context: Event='), 
      'Application must log concurrency context for debugging');
    assert(indexContent.includes('GITHUB_EVENT_NAME'), 
      'Application must log GitHub event name');
    assert(indexContent.includes('GITHUB_REF'), 
      'Application must log GitHub ref');
    assert(indexContent.includes('GITHUB_RUN_ID'), 
      'Application must log GitHub run ID');
    
    console.log('✅ Application includes concurrency context logging');
  });
});
