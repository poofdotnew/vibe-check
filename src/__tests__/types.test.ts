import { describe, expect, test } from 'bun:test';
import { defineConfig, defaultConfig, type VibeCheckConfig } from '../config/types.js';

describe('defineConfig', () => {
  test('returns the same config object', () => {
    const agent = async () => ({ output: '', success: true });
    const config: VibeCheckConfig = {
      agent,
      testDir: './evals',
    };

    const result = defineConfig(config);
    expect(result).toBe(config);
    expect(result.agent).toBe(agent);
    expect(result.testDir).toBe('./evals');
  });

  test('preserves all config properties', () => {
    const config: VibeCheckConfig = {
      agent: async () => ({ output: '', success: true }),
      testDir: './my-evals',
      testMatch: ['**/*.test.json'],
      parallel: false,
      maxConcurrency: 5,
      timeout: 60000,
      maxRetries: 3,
      verbose: true,
    };

    const result = defineConfig(config);
    expect(result.testDir).toBe('./my-evals');
    expect(result.testMatch).toEqual(['**/*.test.json']);
    expect(result.parallel).toBe(false);
    expect(result.maxConcurrency).toBe(5);
    expect(result.timeout).toBe(60000);
    expect(result.maxRetries).toBe(3);
    expect(result.verbose).toBe(true);
  });
});

describe('defaultConfig', () => {
  test('has expected default values', () => {
    expect(defaultConfig.testMatch).toEqual(['**/*.eval.json']);
    expect(defaultConfig.testDir).toBe('./__evals__');
    expect(defaultConfig.parallel).toBe(true);
    expect(defaultConfig.maxConcurrency).toBe(3);
    expect(defaultConfig.timeout).toBe(300000);
    expect(defaultConfig.maxRetries).toBe(2);
    expect(defaultConfig.verbose).toBe(false);
  });

  test('has expected retry configuration', () => {
    expect(defaultConfig.retryDelayMs).toBe(1000);
    expect(defaultConfig.retryBackoffMultiplier).toBe(2);
  });

  test('has expected trial configuration', () => {
    expect(defaultConfig.trials).toBe(1);
    expect(defaultConfig.trialPassThreshold).toBe(0.5);
  });

  test('has expected learning configuration', () => {
    expect(defaultConfig.learning.enabled).toBe(false);
    expect(defaultConfig.learning.ruleOutputDir).toBe('./prompts');
    expect(defaultConfig.learning.minFailuresForPattern).toBe(2);
    expect(defaultConfig.learning.similarityThreshold).toBe(0.7);
    expect(defaultConfig.learning.maxRulesPerIteration).toBe(5);
    expect(defaultConfig.learning.minRuleConfidence).toBe(0.6);
    expect(defaultConfig.learning.autoApprove).toBe(false);
    expect(defaultConfig.learning.autoApproveThreshold).toBe(0.8);
  });

  test('has empty judges array', () => {
    expect(defaultConfig.judges).toEqual([]);
  });

  test('has output directories configured', () => {
    expect(defaultConfig.rubricsDir).toBe('./__evals__/rubrics');
    expect(defaultConfig.outputDir).toBe('./__evals__/results');
  });
});
