import * as core from '@actions/core'
import { createRequire } from 'node:module'

/**
 * The main function for the action.
 * Bridges action inputs/env to the legacy Project Board Sync core.
 */
export async function run(): Promise<void> {
  try {
    // Prefer explicit input first, then env-provided secret
    const token =
      core.getInput('token', { required: false }) ||
      process.env.PROJECT_SYNC_TOKEN ||
      process.env.GITHUB_TOKEN ||
      ''
    if (token) {
      process.env.GITHUB_TOKEN = token
    }

    const projectUrl = core.getInput('project_url', { required: false }) || process.env.PROJECT_URL
    if (projectUrl) process.env.PROJECT_URL = projectUrl

    const projectId = core.getInput('project_id', { required: false }) || process.env.PROJECT_ID
    if (projectId) process.env.PROJECT_ID = projectId

    const githubAuthor = core.getInput('github_author', { required: false }) || process.env.GITHUB_AUTHOR
    if (githubAuthor) process.env.GITHUB_AUTHOR = githubAuthor

    const verbose = core.getInput('verbose', { required: false }) || process.env.VERBOSE || 'true'
    if (verbose) process.env.VERBOSE = verbose

    const strictMode = core.getInput('strict_mode', { required: false }) || process.env.STRICT_MODE || 'false'
    if (strictMode) process.env.STRICT_MODE = strictMode

    const require = createRequire(import.meta.url)
    const projectSync = require('../packages/project-board-sync/project-board-sync/src/index.js')
    if (typeof projectSync?.main !== 'function') {
      throw new Error('Project Board Sync core not found or invalid export: expected main()')
    }

    await projectSync.main()
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
    else core.setFailed('Unknown error occurred while running Project Board Sync')
  }
}
