/**
 * Rate limit priority levels.
 * Higher values represent higher priority (more essential tasks).
 */
export const RatePriority = {
  CRITICAL: 1000,   // Reserved for essential lookups
  STANDARD: 500,    // Batch sync and regular updates
  MAINTENANCE: 200  // Background prep and caching
};

/**
 * Human-readable labels for priority levels.
 */
export const PriorityLabels = {
  200: 'MAINTENANCE',
  500: 'STANDARD',
  1000: 'CRITICAL'
};
