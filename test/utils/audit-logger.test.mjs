import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { auditLog } from '../../src/utils/audit-logger.js';

describe('AuditLogger', () => {
  let tempSummaryFile;

  beforeEach(async () => {
    // Reset events
    auditLog.events = [];
    auditLog.startTime = new Date();
    
    // Create a temporary file for GITHUB_STEP_SUMMARY simulation
    tempSummaryFile = path.join(os.tmpdir(), `summary-${Date.now()}.md`);
    process.env.GITHUB_STEP_SUMMARY = tempSummaryFile;
  });

  afterEach(async () => {
    delete process.env.GITHUB_STEP_SUMMARY;
    try {
      await fs.unlink(tempSummaryFile);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it('generates an empty summary when no events are logged', () => {
    const summary = auditLog.generateSummary();
    assert.match(summary, /Run Complete: No changes needed/);
    assert.match(summary, /Duration: \d+s/);
  });

  it('generates a populated summary with correct item links', () => {
    auditLog.logEvent({
      type: 'Issue',
      number: 123,
      repo: 'org/repo',
      action: 'Move Column',
      from: 'New',
      to: 'Active',
      rule: 'Test Rule',
      reason: 'Testing reason'
    });

    auditLog.logEvent({
      type: 'PullRequest',
      number: 456,
      repo: 'org/repo',
      action: 'Set Sprint',
      from: 'None',
      to: 'Sprint 1',
      rule: 'Sprint Rule'
    });

    const summary = auditLog.generateSummary();
    
    // Check for table headers
    assert.match(summary, /\| Item \| Action \| Transition \| Rule \| Reason \|/);
    
    // Check for Issue link
    assert.match(summary, /\[Issue #123\]\(https:\/\/github\.com\/org\/repo\/issues\/123\)/);
    
    // Check for PR link
    assert.match(summary, /\[PullRequest #456\]\(https:\/\/github\.com\/org\/repo\/pull\/456\)/);
    
    // Check for actions and rules
    assert.match(summary, /Move Column/);
    assert.match(summary, /Set Sprint/);
    assert.match(summary, /Test Rule/);
    assert.match(summary, /Testing reason/);
  });

  it('pushes the summary to the file specified in GITHUB_STEP_SUMMARY', async () => {
    auditLog.logEvent({
      type: 'Issue',
      number: 1,
      repo: 'a/b',
      action: 'Add',
      from: 'None',
      to: 'Board',
      rule: 'Add Rule'
    });

    await auditLog.pushToGhaSummary();
    
    const content = await fs.readFile(tempSummaryFile, 'utf-8');
    assert.match(content, /### 🤖 Automator Run Summary/);
    assert.match(content, /\[Issue #1\]/);
  });

  it('gracefully handles missing GITHUB_STEP_SUMMARY', async () => {
    delete process.env.GITHUB_STEP_SUMMARY;
    auditLog.logEvent({ type: 'Issue', number: 1, repo: 'a/b', action: 'Add' });
    
    // Should not throw
    await auditLog.pushToGhaSummary();
  });
});
