import { getItemColumn, setItemColumn, setItemColumnsBatch, graphql } from '../github/api.js';
import { log } from '../utils/log.js';
import { StateVerifier } from '../utils/state-verifier.js';

// Cache column options per project ID during a single run
const columnOptionsCache = new Map();

/**
 * Validate column transition before making changes
 * Enforces validTransitions from rules.yml strictly
 * @param {string} fromColumn - Current column name
 * @param {string} toColumn - Target column name
 * @param {Object} item - The item being processed
 * @returns {Object} Validation result with valid flag and details
 * @throws {Error} If validation fails critically (no fallback)
 */
function validateColumnTransition(fromColumn, toColumn, item) {
  try {
    const validator = StateVerifier.getTransitionValidator();
    const context = { item };

    const result = validator.validateColumnTransition(fromColumn, toColumn, context);

    if (!result.valid) {
      log.warn(`🚨 BLOCKED: Column transition from "${fromColumn}" to "${toColumn}" is not allowed`);
      log.warn(`   Reason: ${result.reason}`);
      if (result.recovery) {
        log.warn(`   Recovery: ${result.recovery}`);
      }
      if (result.allowedTransitions) {
        log.warn(`   Allowed transitions: ${result.allowedTransitions.join(', ')}`);
      }
    }

    return result;
  } catch (error) {
    // Log the error but still throw - we want strict validation
    // This ensures transitions are only allowed if explicitly declared in rules.yml
    log.error(`Critical error validating column transition: ${error.message}`);
    log.error(`Transition from "${fromColumn}" to "${toColumn}" blocked due to validation error`);
    throw new Error(`Column transition validation failed: ${error.message}. Transition blocked for safety.`);
  }
}

/**
 * Get status field configuration from project
 * Uses in-memory cache to avoid repeated API calls within a single run
 * @param {string} projectId - The project board ID
 * @returns {Promise<Map<string, string>>} Map of column names to option IDs
 */
async function getColumnOptions(projectId) {
  // Check cache first
  if (columnOptionsCache.has(projectId)) {
    log.debug(`Using cached column options for project ${projectId}`);
    return columnOptionsCache.get(projectId);
  }

  // Cache miss - fetch from API
  log.debug(`Fetching column options for project ${projectId}`);
  const result = await graphql(`
    query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          field(name: "Status") {
            ... on ProjectV2SingleSelectField {
              options {
                id
                name
              }
            }
          }
        }
      }
    }
  `, { projectId });

  // Create mapping of column names to option IDs
  const columnMap = new Map();
  const options = result.node?.field?.options || [];
  for (const opt of options) {
    // Store both exact name and lowercase for case-insensitive lookup
    columnMap.set(opt.name, opt.id);
    columnMap.set(opt.name.toLowerCase(), opt.id);
  }

  // Cache the result
  columnOptionsCache.set(projectId, columnMap);

  return columnMap;
}

/**
 * Get the option ID for a column name
 * @param {string} columnName - The name of the column
 * @param {Map<string, string>} options - Column options mapping
 * @returns {string} The option ID
 * @throws {Error} If column not found
 */
function getColumnOptionId(columnName, options) {
  // Try exact match first, then case-insensitive
  const optionId = options.get(columnName) || options.get(columnName.toLowerCase());
  if (!optionId) {
    // Get original case-sensitive column names, removing duplicates while preserving case
    const uniqueColumns = [...new Set([...options.keys()].filter((k, i, arr) =>
      arr.findIndex(item => item.toLowerCase() === k.toLowerCase()) === i
    ))];
    log.info(`Status option not found: "${columnName}". Available: ${uniqueColumns.join(', ')}`);
    return null;
  }
  return optionId;
}

/**
 * Process column assignment for an item based on requirements
 * @param {Object} item - The issue or PR
 * @param {string} projectItemId - The project item ID
 * @param {string} projectId - The project board ID
 * @returns {Promise<{changed: boolean, newStatus?: string}>}
 */
async function processColumnAssignment(item, projectItemId, projectId, batchQueue = null) {
  try {
    // First get available columns
    const options = await getColumnOptions(projectId);

    // Get current column
    const currentColumn = await getItemColumn(projectId, projectItemId);
    const currentColumnLower = currentColumn ? currentColumn.toLowerCase() : null;

    let targetColumn = null;
    let reason = '';

    log.info(`Processing column rules for ${item.__typename} #${item.number}:`, true);
    log.info(`  • Current column: ${currentColumn || 'None'}`, true);
    log.info(`  • Item type: ${item.__typename}`, true);
    log.info(`  • Item state: ${item.state || 'Unknown'}`, true);

    // Actively handle closed/merged items:
    // - If MERGED or CLOSED and not already in a done-like column, move to Done/Closed
    if (item.state === 'MERGED' || item.state === 'CLOSED') {
      if (currentColumnLower === 'done' || currentColumnLower === 'closed') {
        log.info('  • Rule: Item is closed/merged and already in Done/Closed → Skipping', true);
        return {
          changed: false,
          reason: 'Column already set to Done/Closed',
          currentStatus: currentColumn
        };
      }
      // Try to set to 'Done'; if not found, try 'Closed'; otherwise skip gracefully
      try {
        let targetName = 'Done';
        let optionId = getColumnOptionId('Done', options);
        if (!optionId) {
          targetName = 'Closed';
          optionId = getColumnOptionId('Closed', options);
        }
        if (!optionId) {
          log.info('  • No Done/Closed status option found on project → Skipping column update', true);
          return {
            changed: false,
            reason: 'No Done/Closed status option found',
            currentStatus: currentColumn
          };
        }
        // Validate transition before making changes
        const validation = validateColumnTransition(currentColumn, targetName, item);
        if (!validation.valid) {
          log.info(`  • Transition blocked: ${validation.reason}`, true);
          return {
            changed: false,
            reason: `Transition blocked: ${validation.reason}`,
            currentStatus: currentColumn
          };
        }

        if (Array.isArray(batchQueue)) {
          batchQueue.push({ projectItemId, optionId });
        } else {
          await setItemColumn(projectId, projectItemId, optionId);
        }
        return {
          changed: true,
          newStatus: targetName,
          reason: `Item state=${item.state} → Set column to ${targetName}`
        };
      } catch (e) {
        log.info(`  • Could not set to Done/Closed (${e.message}) → Skipping column update`, true);
        return {
          changed: false,
          reason: 'Failed to resolve Done/Closed option',
          currentStatus: currentColumn
        };
      }
    }

    // Handle PRs and Issues according to requirements
    if (item.__typename === 'PullRequest') {
      // For PRs: Move to Active if either:
      // 1. Column is None
      // 2. Column is New
      if (!currentColumn || currentColumnLower === 'new') {
        targetColumn = 'Active';
        reason = !currentColumn ? 'Initial PR placement in Active' : 'PR moved from New to Active';
        log.info(`  • Rule: ${!currentColumn ? 'Column=None' : 'Column=New'} → Moving PR to Active`, true);
      }
    } else if (item.__typename === 'Issue' && !currentColumn) {
      // For Issues: Only set column if none is set
      targetColumn = 'New';
      reason = 'Initial issue placement in New';
      log.info('  • Rule: Column=None → Setting initial issue column to New', true);
    }

    // Skip if no target column determined
    if (!targetColumn) {
      log.info('  • Result: No target column determined', true);
      return {
        changed: false,
        reason: 'No column change needed',
        currentStatus: currentColumn
      };
    }

    // If already in Done column, do not change (handled by GitHub)
    if (currentColumnLower === 'done') {
      log.info('  • Already in Done column, handled by GitHub', true);
      return {
        changed: false,
        reason: 'Column "Done" is handled by GitHub automation',
        currentStatus: currentColumn
      };
    }

    // If already in correct column, do not change
    if (currentColumnLower === targetColumn.toLowerCase()) {
      log.info(`  • Result: Already in target column (${currentColumn})`, true);
      return {
        changed: false,
        reason: `Column already set to ${currentColumn}`,
        currentStatus: currentColumn
      };
    }

    log.info(`  • Result: Moving to ${targetColumn}`, true);

    // Set the new column
    const optionId = getColumnOptionId(targetColumn, options);
    if (!optionId) {
      log.info(`  • No Status option for "${targetColumn}" → Skipping column update`, true);
      return {
        changed: false,
        reason: `No Status option found for ${targetColumn}`,
        currentStatus: currentColumn
      };
    }
    // Validate transition before making changes
    const validation = validateColumnTransition(currentColumn, targetColumn, item);
    if (!validation.valid) {
      log.info(`  • Transition blocked: ${validation.reason}`, true);
      return {
        changed: false,
        reason: `Transition blocked: ${validation.reason}`,
        currentStatus: currentColumn
      };
    }

    if (Array.isArray(batchQueue)) {
      batchQueue.push({ projectItemId, optionId });
    } else {
      await setItemColumn(projectId, projectItemId, optionId);
    }

    return {
      changed: true,
      newStatus: targetColumn,
      reason: reason || `Set column to ${targetColumn} based on ${item.state ? `state (${item.state})` : 'initial rules'}`
    };
  } catch (error) {
    const itemIdentifier = item ? `${item.__typename} #${item.number || 'unknown'}` : 'unknown item';
    log.error(`Failed to process column for ${itemIdentifier}: ${error.message}`);
    
    if (error.stack) {
      log.debug(`Error details: ${error.stack}`);
    }

    // Classify errors for better handling
    const errorMessage = error.message || '';
    const errorCode = error.code || '';
    
    // Critical errors that should stop processing
    const isAuthError = errorMessage.includes('Bad credentials') || 
                        errorMessage.includes('Not authenticated');
    const isRateLimitError = errorMessage.includes('rate limit') || 
                             errorCode === 'ECONNRESET' && errorMessage.toLowerCase().includes('rate');
    
    if (isAuthError || isRateLimitError) {
      const apiError = new Error(`GitHub API error: ${errorMessage}. Please check configuration and retry.`);
      apiError.cause = error;
      throw apiError;
    }
    
    // Network/timeout errors - log but continue
    const networkErrorCodes = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'];
    const isNetworkError = (errorCode && networkErrorCodes.includes(errorCode)) ||
                           errorMessage.includes('timeout') ||
                           errorMessage.includes('ECONNRESET') ||
                           errorMessage.includes('ENOTFOUND');
    
    if (isNetworkError) {
      log.warning(`Network error processing column for ${itemIdentifier}: ${errorMessage || errorCode}. Re-throwing for upstream handling.`);
      throw error; // Re-throw network errors so they can be handled by caller
    }
    
    // Other errors - re-throw for upstream handling
    throw error;
  }
}

/**
 * Implementation of Rule Set 2: Which Columns Items Go To?
 *
 * Rules from rules.yml:
 * | Item Type | Trigger Condition | Action        | Skip Condition         |
 * |-----------|-------------------|---------------|------------------------|
 * | PR        | Column=None       | Column=Active | Column=Any already set |
 * | PR        | Column=New        | Column=Active | Column=Any except New  |
 * | Issue     | Column=None       | Column=New    | Column=Any already set |
 */
async function processColumns({ projectId, items }) {
  const processedItems = [];
  const skippedItems = [];
  const batchQueue = [];

  for (const item of items) {
    try {
      log.debug(`Processing column assignment for ${item.type || item.__typename} #${item.number}`);
      // Process column assignment - make sure we pass the full item with type info
      const result = await processColumnAssignment({
        ...item,
        __typename: item.type || item.__typename,
        number: item.number,
        state: item.state || 'OPEN'  // Default to OPEN if state is not provided
      }, item.projectItemId, projectId, batchQueue);

      if (result.changed) {
        processedItems.push({
          type: item.__typename,
          number: item.number,
          repo: item.repository.nameWithOwner,
          column: result.newStatus,
          reason: result.reason
        });
      } else {
        skippedItems.push({
          type: item.__typename,
          number: item.number,
          repo: item.repository.nameWithOwner,
          column: result.currentStatus,
          reason: result.reason
        });
      }
    } catch (error) {
      const itemIdentifier = item ? `${item.__typename} #${item.number || 'unknown'}` : 'unknown item';
      const errorMessage = error.message || '';
      const errorCode = error.code || '';
      
      // Log error with context
      log.error(`Failed to process column for ${itemIdentifier}: ${errorMessage || errorCode}`);
      
      if (error.stack) {
        log.debug(`Error details: ${error.stack}`);
      }
      
      // Network/timeout errors - log but continue with next item
      const networkErrorCodes = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'];
      const isNetworkError = (errorCode && networkErrorCodes.includes(errorCode)) ||
                             errorMessage.includes('timeout') ||
                             errorMessage.includes('ECONNRESET') ||
                             errorMessage.includes('ENOTFOUND');
      
      if (isNetworkError) {
        log.warning(`Network error processing column for ${itemIdentifier}: ${errorMessage || errorCode}. Continuing with next item.`);
        continue; // Continue processing other items
      }
      
      // Other errors - log but continue (don't fail entire batch)
      log.warning(`Error processing column for ${itemIdentifier}: ${errorMessage || errorCode}. Continuing with next item.`);
    }
  }

  // Apply batched column updates if any
  if (batchQueue.length > 0) {
    const ok = await setItemColumnsBatch(projectId, batchQueue);
    const applied = Array.isArray(ok) ? ok.length : 0;
    log.info(`Applied ${applied}/${batchQueue.length} column updates in batch`);
  }

  // Log results
  processedItems.forEach(item => {
    log.info(`${item.type} #${item.number} [${item.repo}] - ${item.reason}`);
  });

  skippedItems.forEach(item => {
    log.info(`Skipped ${item.type} #${item.number} [${item.repo}] - ${item.reason} (${item.column})`);
  });

  return { processedItems, skippedItems };
}

export { processColumns, processColumnAssignment, getColumnOptions };
