import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import {
  getLearningConfig,
  getConfigFromEnv,
  DEFAULT_LEARNING_CONFIG,
  type LearningConfig,
} from '../../learning/config.js';

describe('getLearningConfig', () => {
  test('returns default config when no overrides provided', () => {
    const config = getLearningConfig();

    expect(config.minFailuresForPattern).toBe(2);
    expect(config.similarityThreshold).toBe(0.7);
    expect(config.maxFailuresPerIteration).toBe(100);
    expect(config.maxRulesPerIteration).toBe(5);
    expect(config.minRuleConfidence).toBe(0.6);
    expect(config.validationRunSize).toBe(10);
    expect(config.regressionThreshold).toBe(5);
  });

  test('merges overrides with defaults', () => {
    const config = getLearningConfig({
      minFailuresForPattern: 5,
      similarityThreshold: 0.8,
    });

    expect(config.minFailuresForPattern).toBe(5);
    expect(config.similarityThreshold).toBe(0.8);
    expect(config.maxFailuresPerIteration).toBe(100);
  });

  test('allows overriding model settings', () => {
    const config = getLearningConfig({
      explanationModel: 'claude-opus-4-20250514',
      ruleGenerationModel: 'claude-opus-4-20250514',
    });

    expect(config.explanationModel).toBe('claude-opus-4-20250514');
    expect(config.ruleGenerationModel).toBe('claude-opus-4-20250514');
  });

  test('preserves directory paths', () => {
    const config = getLearningConfig();

    expect(config.learningDir).toBeDefined();
    expect(config.promptsDir).toBeDefined();
    expect(config.rulesDir).toBeDefined();
    expect(config.pendingDir).toBeDefined();
    expect(config.approvedDir).toBeDefined();
    expect(config.rejectedDir).toBeDefined();
  });
});

describe('getConfigFromEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('returns empty object when no env vars set', () => {
    delete process.env.LEARNING_EXPLANATION_MODEL;
    delete process.env.LEARNING_RULE_MODEL;
    delete process.env.LEARNING_MIN_PATTERN_SIZE;
    delete process.env.LEARNING_SIMILARITY_THRESHOLD;
    delete process.env.LEARNING_MAX_RULES;

    const overrides = getConfigFromEnv();

    expect(Object.keys(overrides).length).toBe(0);
  });

  test('reads LEARNING_EXPLANATION_MODEL', () => {
    process.env.LEARNING_EXPLANATION_MODEL = 'claude-opus-4-20250514';

    const overrides = getConfigFromEnv();

    expect(overrides.explanationModel).toBe('claude-opus-4-20250514');
  });

  test('reads LEARNING_RULE_MODEL', () => {
    process.env.LEARNING_RULE_MODEL = 'claude-opus-4-20250514';

    const overrides = getConfigFromEnv();

    expect(overrides.ruleGenerationModel).toBe('claude-opus-4-20250514');
  });

  test('reads LEARNING_MIN_PATTERN_SIZE', () => {
    process.env.LEARNING_MIN_PATTERN_SIZE = '5';

    const overrides = getConfigFromEnv();

    expect(overrides.minFailuresForPattern).toBe(5);
  });

  test('reads LEARNING_SIMILARITY_THRESHOLD', () => {
    process.env.LEARNING_SIMILARITY_THRESHOLD = '0.85';

    const overrides = getConfigFromEnv();

    expect(overrides.similarityThreshold).toBe(0.85);
  });

  test('reads LEARNING_MAX_RULES', () => {
    process.env.LEARNING_MAX_RULES = '10';

    const overrides = getConfigFromEnv();

    expect(overrides.maxRulesPerIteration).toBe(10);
  });

  test('reads multiple env vars', () => {
    process.env.LEARNING_EXPLANATION_MODEL = 'model-a';
    process.env.LEARNING_RULE_MODEL = 'model-b';
    process.env.LEARNING_MIN_PATTERN_SIZE = '3';

    const overrides = getConfigFromEnv();

    expect(overrides.explanationModel).toBe('model-a');
    expect(overrides.ruleGenerationModel).toBe('model-b');
    expect(overrides.minFailuresForPattern).toBe(3);
  });
});

describe('DEFAULT_LEARNING_CONFIG', () => {
  test('has all required fields', () => {
    const required: (keyof LearningConfig)[] = [
      'minFailuresForPattern',
      'similarityThreshold',
      'maxFailuresPerIteration',
      'explanationModel',
      'ruleGenerationModel',
      'maxRulesPerIteration',
      'minRuleConfidence',
      'validationRunSize',
      'regressionThreshold',
      'learningDir',
      'promptsDir',
      'rulesDir',
      'pendingDir',
      'approvedDir',
      'rejectedDir',
      'learnedRulesPath',
      'historyPath',
      'evalResultsDir',
    ];

    for (const field of required) {
      expect(DEFAULT_LEARNING_CONFIG[field]).toBeDefined();
    }
  });

  test('has sensible default values', () => {
    expect(DEFAULT_LEARNING_CONFIG.minFailuresForPattern).toBeGreaterThan(0);
    expect(DEFAULT_LEARNING_CONFIG.similarityThreshold).toBeGreaterThan(0);
    expect(DEFAULT_LEARNING_CONFIG.similarityThreshold).toBeLessThanOrEqual(1);
    expect(DEFAULT_LEARNING_CONFIG.minRuleConfidence).toBeGreaterThan(0);
    expect(DEFAULT_LEARNING_CONFIG.minRuleConfidence).toBeLessThanOrEqual(1);
  });
});
