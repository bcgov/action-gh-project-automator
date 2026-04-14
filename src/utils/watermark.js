import * as cache from '@actions/cache';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { log } from './log.js';

const CACHE_KEY_PREFIX = 'project-sync-watermark-';
const WATERMARK_FILE = 'last_sync_timestamp.txt';

/**
 * Get the last successful sync timestamp from GitHub Actions cache.
 * Uses the project ID to scope the cache.
 * 
 * @param {string} projectId - The GitHub Project V2 ID
 * @returns {Promise<string|null>} ISO timestamp or null if not found
 */
export async function getWatermark(projectId, overrides = {}) {
  const {
    cache: cacheModule = cache,
    fs: fsModule = fs,
    log: logger = log
  } = overrides;

  if (!projectId) {
    logger.warning('No project ID provided for watermark retrieval');
    return null;
  }

  // Use a sanitised project ID for the cache key
  const safeProjectId = projectId.replace(/[^a-zA-Z0-9]/g, '_');
  const primaryKey = `${CACHE_KEY_PREFIX}${safeProjectId}-`; // We use restore keys to find latest
  
  const tmpDir = await fsModule.mkdtemp(path.join(os.tmpdir(), 'watermark-'));
  const filePath = path.join(tmpDir, WATERMARK_FILE);
  
  try {
    logger.info(`Attempting to restore watermark for project ${projectId}...`);
    // restoreCache will find the most recent cache entry starting with this prefix
    const restoredKey = await cacheModule.restoreCache([tmpDir], `${primaryKey}${Date.now()}`, [primaryKey]);
    
    if (restoredKey) {
      const content = await fsModule.readFile(filePath, 'utf8');
      const timestamp = content.trim();
      logger.info(`Restored watermark: ${timestamp} (from key: ${restoredKey})`);
      
      // Basic validation: ensure it's a valid date
      if (!isNaN(Date.parse(timestamp))) {
        return timestamp;
      }
      logger.warning(`Restored watermark "${timestamp}" is not a valid ISO date`);
    } else {
      logger.info('No existing watermark found in cache');
    }
  } catch (error) {
    logger.error(`Failed to restore watermark from cache: ${error.message}`);
    if (process.env.DEBUG) logger.debug(error.stack);
  } finally {
    try {
      await fsModule.rm(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  }
  return null;
}

/**
 * Save the current sync timestamp to GitHub Actions cache.
 * 
 * @param {string} projectId - The GitHub Project V2 ID
 * @param {string} timestamp - ISO timestamp to save
 * @returns {Promise<void>}
 */
export async function saveWatermark(projectId, timestamp, overrides = {}) {
  const {
    cache: cacheModule = cache,
    fs: fsModule = fs,
    log: logger = log
  } = overrides;

  if (!projectId || !timestamp) {
    logger.warning('Project ID and timestamp are required to save watermark');
    return;
  }

  const safeProjectId = projectId.replace(/[^a-zA-Z0-9]/g, '_');
  const cacheKey = `${CACHE_KEY_PREFIX}${safeProjectId}-${Date.now()}`;
  
  const tmpDir = await fsModule.mkdtemp(path.join(os.tmpdir(), 'watermark-'));
  const filePath = path.join(tmpDir, WATERMARK_FILE);
  
  try {
    await fsModule.writeFile(filePath, timestamp);
    logger.info(`Saving watermark ${timestamp} to cache with key ${cacheKey}...`);
    
    // We don't want to fail the whole run if cache saving fails
    await cacheModule.saveCache([tmpDir], cacheKey);
    logger.info('Watermark saved successfully');
  } catch (error) {
    // Special handling for "Cache already exists" which shouldn't happen with our timestamping but just in case
    if (error.name === 'ValidationError' && error.message.includes('already exists')) {
      logger.info('Watermark cache already exists for this key, skipping.');
    } else {
      logger.error(`Failed to save watermark to cache: ${error.message}`);
    }
  } finally {
    try {
      await fsModule.rm(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}
