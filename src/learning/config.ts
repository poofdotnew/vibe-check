/**
 * Configuration for the Prompt Learning System
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface LearningConfig {
  // Analysis settings
  /** Minimum number of failures to form a pattern */
  minFailuresForPattern: number;

  /** Similarity threshold for grouping failures (0-1) */
  similarityThreshold: number;

  /** Maximum failures to process per iteration */
  maxFailuresPerIteration: number;

  // Rule generation settings
  /** Model to use for explanation generation */
  explanationModel: string;

  /** Model to use for rule generation */
  ruleGenerationModel: string;

  /** Maximum rules to suggest per iteration */
  maxRulesPerIteration: number;

  /** Minimum confidence to include a rule */
  minRuleConfidence: number;

  // Validation settings
  /** Number of evals to run for validation */
  validationRunSize: number;

  /** Maximum acceptable regression percentage */
  regressionThreshold: number;

  // Directories
  /** Directory for the learning system */
  learningDir: string;

  /** Directory for prompts */
  promptsDir: string;

  /** Directory for rules */
  rulesDir: string;

  /** Directory for pending rules */
  pendingDir: string;

  /** Directory for approved rules */
  approvedDir: string;

  /** Directory for rejected rules */
  rejectedDir: string;

  /** Path to learned rules JSON */
  learnedRulesPath: string;

  /** Path to learning history */
  historyPath: string;

  /** Directory for eval results (to read from) */
  evalResultsDir: string;
}

const LEARNING_DIR = path.join(__dirname);
const RULES_DIR = path.join(LEARNING_DIR, 'rules');
const EVAL_RESULTS_DIR = path.join(__dirname, '..', 'results');

export const DEFAULT_LEARNING_CONFIG: LearningConfig = {
  // Analysis settings
  minFailuresForPattern: 2,
  similarityThreshold: 0.7,
  maxFailuresPerIteration: 100,

  // Rule generation settings
  explanationModel: 'claude-sonnet-4-20250514',
  ruleGenerationModel: 'claude-sonnet-4-20250514',
  maxRulesPerIteration: 5,
  minRuleConfidence: 0.6,

  // Validation settings
  validationRunSize: 10,
  regressionThreshold: 5, // 5% max regression

  // Directories
  learningDir: LEARNING_DIR,
  promptsDir: path.join(LEARNING_DIR, 'prompts'),
  rulesDir: RULES_DIR,
  pendingDir: path.join(RULES_DIR, 'pending'),
  approvedDir: path.join(RULES_DIR, 'approved'),
  rejectedDir: path.join(RULES_DIR, 'rejected'),
  learnedRulesPath: path.join(RULES_DIR, 'learned-rules.json'),
  historyPath: path.join(RULES_DIR, 'history.json'),
  evalResultsDir: EVAL_RESULTS_DIR,
};

/**
 * Get the learning configuration, optionally with overrides
 */
export function getLearningConfig(
  overrides?: Partial<LearningConfig>
): LearningConfig {
  return {
    ...DEFAULT_LEARNING_CONFIG,
    ...overrides,
  };
}

/**
 * Environment variable overrides
 */
export function getConfigFromEnv(): Partial<LearningConfig> {
  const overrides: Partial<LearningConfig> = {};

  if (process.env.LEARNING_EXPLANATION_MODEL) {
    overrides.explanationModel = process.env.LEARNING_EXPLANATION_MODEL;
  }

  if (process.env.LEARNING_RULE_MODEL) {
    overrides.ruleGenerationModel = process.env.LEARNING_RULE_MODEL;
  }

  if (process.env.LEARNING_MIN_PATTERN_SIZE) {
    overrides.minFailuresForPattern = parseInt(
      process.env.LEARNING_MIN_PATTERN_SIZE,
      10
    );
  }

  if (process.env.LEARNING_SIMILARITY_THRESHOLD) {
    overrides.similarityThreshold = parseFloat(
      process.env.LEARNING_SIMILARITY_THRESHOLD
    );
  }

  if (process.env.LEARNING_MAX_RULES) {
    overrides.maxRulesPerIteration = parseInt(
      process.env.LEARNING_MAX_RULES,
      10
    );
  }

  return overrides;
}

export default getLearningConfig;
