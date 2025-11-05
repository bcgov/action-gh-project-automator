/**
 * @fileoverview Shared validator for rule processing
 * Provides validation methods used by multiple rule processors
 */

import { RuleValidation } from './validation.js';

// Create a singleton validator instance
const validator = new RuleValidation();

export { validator };
