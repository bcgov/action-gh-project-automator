/**
 * Rate limit priority levels.
 * Higher values represent higher priority (more essential tasks).
 */
export const RatePriority = {
  CRITICAL: 1000,   // Reserved for essential lookups
  DISCOVERY: 1000,  // Alias for CRITICAL searching
  STANDARD: 500,    // Batch sync and regular updates
  SYNC: 500,        // Alias for STANDARD processing
  MAINTENANCE: 200  // Background prep and caching
};

/**
 * Human-readable labels for priority levels.
 */
export const PriorityLabels = {
  1000: 'CRITICAL',
  500: 'STANDARD',
  200: 'MAINTENANCE'
};
