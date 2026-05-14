/**
 * @fileoverview Error classification utility for consistent error handling across processors
 * 
 * Classifies errors into categories for appropriate handling:
 * - Authentication errors: Stop processing, require configuration fix
 * - Rate limit errors: Stop processing, temporary issue
 * - Network errors: Re-throw for upstream handling, may be retryable
 * - Other errors: Re-throw for upstream handling
 */

/**
 * Classify an error into categories for handling
 * @param {Error} error - The error to classify
 * @returns {Object} Classification result with flags
 * @property {boolean} isAuthError - Authentication failure (Bad credentials, Not authenticated)
 * @property {boolean} isRateLimitError - Rate limit exceeded
 * @property {boolean} isNetworkError - Network/timeout error (ETIMEDOUT, ECONNRESET, etc.)
 */
export function classifyError(error) {
  const errorMessage = error?.message || '';
  const errorCode = error?.code || '';
  const errorMessageLower = errorMessage.toLowerCase();
  
  // Critical errors that should stop processing
  const isAuthError = errorMessageLower.includes('bad credentials') || 
                      errorMessageLower.includes('not authenticated');
  
  const isRateLimitError = errorMessageLower.includes('rate limit');
  
  // Network/timeout errors - check error code first (more reliable), then message
  const networkErrorCodes = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'];
  const isNetworkError = (errorCode && networkErrorCodes.includes(errorCode)) ||
                         errorMessageLower.includes('timeout');
  
  return { isAuthError, isRateLimitError, isNetworkError };
}

/**
 * Handle classified error with appropriate logging and re-throwing
 * @param {Error} error - The error to handle
 * @param {string} itemIdentifier - Human-readable identifier for the item being processed
 * @param {Object} log - Logger instance
 * @throws {Error} Always re-throws (either original or wrapped)
 */
export function handleClassifiedError(error, itemIdentifier, log) {
  const classification = classifyError(error);
  
  // Log error details
  log.error(`Failed to process ${itemIdentifier}: ${error.message}`);
  
  if (error.stack) {
    log.debug(`Error details: ${error.stack}`);
  }
  
  // Critical errors that should stop processing
  if (classification.isAuthError || classification.isRateLimitError) {
    const apiError = new Error(`GitHub API error: ${error.message}. Please check configuration and retry.`);
    apiError.cause = error;
    throw apiError;
  }
  
  // Network/timeout errors - re-throw for upstream handling
  if (classification.isNetworkError) {
    // Re-throw so the caller can decide whether to retry or continue
    throw error;
  }
  
  // Other errors - re-throw for upstream handling
  throw error;
}

