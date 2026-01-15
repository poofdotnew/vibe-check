/**
 * Prompt Learning System
 *
 * A system that iteratively improves the AI coding agent's system prompt
 * by analyzing eval failures and generating new rules.
 *
 * Usage:
 *   npm run learn           - Run full learning iteration
 *   npm run learn:analyze   - Analyze failures without generating rules
 *   npm run learn:review    - Review pending rules
 *   npm run learn:stats     - Show system statistics
 *   npm run learn:auto      - Auto-approve high-confidence rules
 *   npm run learn:pending   - Save rules for later review
 */

// Core types
export * from './types.js';

// Configuration
export { getLearningConfig, getConfigFromEnv } from './config.js';
export type { LearningConfig } from './config.js';

// Data sources
export * from './data-sources/index.js';

// Core components
export { ExplanationGenerator } from './explanation-generator.js';
export { PatternDetector } from './pattern-detector.js';
export { RuleGenerator } from './rule-generator.js';
export { CLIReviewer } from './cli-reviewer.js';
export { RuleWriter } from './rule-writer.js';

// Main runner
export { LearningRunner } from './learning-runner.js';
export type { LearningOptions } from './learning-runner.js';
