import * as cache from '@actions/cache';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { log } from './log.js';

const CACHE_KEY_PREFIX = 'project-sync-watermark-';
const WATERMARK_FILE = 'last_sync_timestamp.txt';

function safeId(projectId) {
  return projectId.replace(/[^a-zA-Z0-9]/g, '_');
}

/**
 * Fixed folder for the watermark file. The cache only matches when save and restore use the
 * same path, so this must not change between runs (a random temp folder never matches).
 * @param {string} projectId
 * @returns {string}
 */
export function watermarkDir(projectId) {
  return path.join(os.tmpdir(), `project-sync-watermark-${safeId(projectId)}`);
}

async function freshDir(fsModule, dir) {
  await fsModule.rm(dir, { recursive: true, force: true });
  await fsModule.mkdir(dir, { recursive: true });
}

/**
 * Get the last successful sync timestamp from GitHub Actions cache.
 * Uses the project ID to scope the cache.
 *
 * @param {string} projectId - The GitHub Project V2 ID
 * @returns {Promise<string|null>} ISO timestamp or null if not found
 */
export async function getWatermark(projectId, overrides = {}) {
  const { cache: cacheModule = cache, fs: fsModule = fs, log: logger = log } = overrides;

  if (!projectId) {
    logger.warning('No project ID provided for watermark retrieval');
    return null;
  }

  // Keys are `<prefix><project>-<timestamp>`; the prefix restore key picks the newest one
  const keyPrefix = `${CACHE_KEY_PREFIX}${safeId(projectId)}-`;
  const tmpDir = watermarkDir(projectId);
  const filePath = path.join(tmpDir, WATERMARK_FILE);

  try {
    await freshDir(fsModule, tmpDir);
    logger.info(`Attempting to restore watermark for project ${projectId}...`);
    const restoredKey = await cacheModule.restoreCache([tmpDir], `${keyPrefix}${Date.now()}`, [
      keyPrefix,
    ]);

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
    } catch {
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
  if (process.env.DRY_RUN === 'true') {
    log.info(`[DRY RUN] Skipping watermark update to ${timestamp}`);
    return;
  }
  const { cache: cacheModule = cache, fs: fsModule = fs, log: logger = log } = overrides;

  if (!projectId || !timestamp) {
    logger.warning('Project ID and timestamp are required to save watermark');
    return;
  }

  const cacheKey = `${CACHE_KEY_PREFIX}${safeId(projectId)}-${Date.now()}`;
  const tmpDir = watermarkDir(projectId);
  const filePath = path.join(tmpDir, WATERMARK_FILE);

  try {
    await freshDir(fsModule, tmpDir);
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
    } catch {
      // Ignore cleanup errors
    }
  }
}
