import { describe, expect, test } from 'bun:test';
import { PatternDetector } from '../../learning/pattern-detector.js';
import type { FailureExplanation } from '../../learning/types.js';

function createFailureExplanation(overrides: Partial<{
  id: string;
  patternCategory: string;
  rootCause: string;
  whatWentWrong: string;
  whyItFailed: string;
  suggestedFix: string;
  affectedComponent: string;
}>): FailureExplanation {
  return {
    id: overrides.id || `failure-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    failureInput: {
      id: 'input-1',
      source: 'eval',
      sourceId: 'eval-1',
      prompt: 'test prompt',
      output: 'test output',
      timestamp: new Date().toISOString(),
    },
    explanation: {
      whatWentWrong: overrides.whatWentWrong || 'Something went wrong',
      whyItFailed: overrides.whyItFailed || 'Because of an error',
      rootCause: overrides.rootCause || 'Missing instruction in prompt',
      suggestedFix: overrides.suggestedFix || 'Add instruction to handle this case',
      patternCategory: overrides.patternCategory || 'routing-error',
      affectedComponent: overrides.affectedComponent,
    },
    confidence: 0.8,
    generatedAt: new Date().toISOString(),
    model: 'claude-sonnet-4-20250514',
  };
}

describe('PatternDetector', () => {
  describe('detectPatterns', () => {
    test('returns empty array for empty input', () => {
      const detector = new PatternDetector();
      const patterns = detector.detectPatterns([]);

      expect(patterns).toEqual([]);
    });

    test('returns empty array when failures below threshold', () => {
      const detector = new PatternDetector({ minFailuresForPattern: 3 });
      const explanations = [
        createFailureExplanation({ patternCategory: 'routing-error' }),
        createFailureExplanation({ patternCategory: 'routing-error' }),
      ];

      const patterns = detector.detectPatterns(explanations);

      expect(patterns).toEqual([]);
    });

    test('detects pattern when failures meet threshold', () => {
      const detector = new PatternDetector({ minFailuresForPattern: 2, similarityThreshold: 0.3 });
      const explanations = [
        createFailureExplanation({
          id: 'f1',
          patternCategory: 'routing-error',
          rootCause: 'Agent failed to route the request to the correct handler because of missing delegation logic',
          suggestedFix: 'Add delegation instruction to route requests properly',
        }),
        createFailureExplanation({
          id: 'f2',
          patternCategory: 'routing-error',
          rootCause: 'Agent failed to route the request to the correct handler due to missing delegation rules',
          suggestedFix: 'Add delegation instruction to handle routing correctly',
        }),
      ];

      const patterns = detector.detectPatterns(explanations);

      expect(patterns.length).toBe(1);
      expect(patterns[0].category).toBe('routing-error');
      expect(patterns[0].frequency).toBe(2);
    });

    test('groups failures by category', () => {
      const detector = new PatternDetector({ minFailuresForPattern: 2, similarityThreshold: 0.3 });
      const explanations = [
        createFailureExplanation({
          id: 'f1',
          patternCategory: 'routing-error',
          rootCause: 'Agent failed to route request to proper destination handler',
          suggestedFix: 'Add routing instruction for handling requests',
        }),
        createFailureExplanation({
          id: 'f2',
          patternCategory: 'routing-error',
          rootCause: 'Agent failed to route request to proper destination target',
          suggestedFix: 'Add routing instruction for handling targets',
        }),
        createFailureExplanation({
          id: 'f3',
          patternCategory: 'validation-failure',
          rootCause: 'Input validation failed because schema was missing required fields',
          suggestedFix: 'Add validation schema for required input fields',
        }),
        createFailureExplanation({
          id: 'f4',
          patternCategory: 'validation-failure',
          rootCause: 'Input validation failed because schema was missing required attributes',
          suggestedFix: 'Add validation schema for required input attributes',
        }),
      ];

      const patterns = detector.detectPatterns(explanations);

      expect(patterns.length).toBe(2);
      const categories = patterns.map(p => p.category).sort();
      expect(categories).toEqual(['routing-error', 'validation-failure']);
    });

    test('clusters similar failures within category', () => {
      const detector = new PatternDetector({
        minFailuresForPattern: 2,
        similarityThreshold: 0.3,
      });

      const explanations = [
        createFailureExplanation({
          id: 'f1',
          patternCategory: 'routing-error',
          rootCause: 'Agent did not properly delegate task to the coding agent handler',
          suggestedFix: 'Add delegation instruction to route coding tasks properly',
        }),
        createFailureExplanation({
          id: 'f2',
          patternCategory: 'routing-error',
          rootCause: 'Agent failed to properly delegate task to the coding agent handler',
          suggestedFix: 'Add delegation instruction to route coding tasks correctly',
        }),
      ];

      const patterns = detector.detectPatterns(explanations);

      expect(patterns.length).toBeGreaterThanOrEqual(1);
      expect(patterns[0].failures.length).toBe(2);
    });

    test('sorts patterns by frequency', () => {
      const detector = new PatternDetector({ minFailuresForPattern: 2, similarityThreshold: 0.3 });

      const explanations = [
        createFailureExplanation({
          id: 'f1',
          patternCategory: 'routing-error',
          rootCause: 'Agent routing failed because destination handler was not found',
          suggestedFix: 'Add handler registration for routing',
        }),
        createFailureExplanation({
          id: 'f2',
          patternCategory: 'routing-error',
          rootCause: 'Agent routing failed because destination target was not found',
          suggestedFix: 'Add target registration for routing',
        }),
        createFailureExplanation({
          id: 'f3',
          patternCategory: 'validation-failure',
          rootCause: 'Schema validation failed because required field was missing from input data',
          suggestedFix: 'Add required field validation to schema',
        }),
        createFailureExplanation({
          id: 'f4',
          patternCategory: 'validation-failure',
          rootCause: 'Schema validation failed because required attribute was missing from input data',
          suggestedFix: 'Add required attribute validation to schema',
        }),
        createFailureExplanation({
          id: 'f5',
          patternCategory: 'validation-failure',
          rootCause: 'Schema validation failed because required property was missing from input data',
          suggestedFix: 'Add required property validation to schema',
        }),
      ];

      const patterns = detector.detectPatterns(explanations);

      expect(patterns[0].category).toBe('validation-failure');
      expect(patterns[0].frequency).toBe(3);
    });

    test('extracts affected components', () => {
      const detector = new PatternDetector({ minFailuresForPattern: 2, similarityThreshold: 0.3 });

      const explanations = [
        createFailureExplanation({
          id: 'f1',
          patternCategory: 'routing-error',
          rootCause: 'Agent routing issue because request handler could not find destination',
          suggestedFix: 'Add destination registration for request handling',
          affectedComponent: 'chat-agent',
        }),
        createFailureExplanation({
          id: 'f2',
          patternCategory: 'routing-error',
          rootCause: 'Agent routing issue because request handler could not find target',
          suggestedFix: 'Add target registration for request handling',
          affectedComponent: 'coding-agent',
        }),
      ];

      const patterns = detector.detectPatterns(explanations);

      expect(patterns[0].affectedComponents).toContain('chat-agent');
      expect(patterns[0].affectedComponents).toContain('coding-agent');
    });

    test('extracts common root causes', () => {
      const detector = new PatternDetector({ minFailuresForPattern: 2, similarityThreshold: 0.3 });

      const explanations = [
        createFailureExplanation({
          id: 'f1',
          patternCategory: 'routing-error',
          rootCause: 'Missing delegation instruction caused the agent to fail routing request',
          suggestedFix: 'Add delegation instruction for routing',
        }),
        createFailureExplanation({
          id: 'f2',
          patternCategory: 'routing-error',
          rootCause: 'Missing delegation instruction caused the agent to fail handling request',
          suggestedFix: 'Add delegation instruction for handling',
        }),
      ];

      const patterns = detector.detectPatterns(explanations);

      expect(patterns[0].commonRootCauses.length).toBeGreaterThan(0);
    });

    test('generates pattern ID and name', () => {
      const detector = new PatternDetector({ minFailuresForPattern: 2, similarityThreshold: 0.3 });

      const explanations = [
        createFailureExplanation({
          id: 'f1',
          patternCategory: 'routing-error',
          rootCause: 'Delegation issue caused agent to fail routing to proper handler',
          suggestedFix: 'Add delegation configuration for proper routing',
        }),
        createFailureExplanation({
          id: 'f2',
          patternCategory: 'routing-error',
          rootCause: 'Delegation issue caused agent to fail routing to proper target',
          suggestedFix: 'Add delegation configuration for proper target',
        }),
      ];

      const patterns = detector.detectPatterns(explanations);

      expect(patterns[0].patternId).toMatch(/^routing-error/);
      expect(patterns[0].patternName).toBeDefined();
      expect(patterns[0].detectedAt).toBeDefined();
    });
  });

  describe('mergeWithExisting', () => {
    test('adds new patterns to empty existing', () => {
      const detector = new PatternDetector();

      const newPatterns = [{
        patternId: 'pattern-1',
        patternName: 'Test Pattern',
        category: 'routing-error',
        failures: [],
        frequency: 2,
        affectedComponents: ['agent'],
        commonRootCauses: ['cause'],
        similarityScore: 0.8,
        detectedAt: new Date().toISOString(),
      }];

      const merged = detector.mergeWithExisting(newPatterns, []);

      expect(merged.length).toBe(1);
      expect(merged[0].patternId).toBe('pattern-1');
    });

    test('merges similar patterns', () => {
      const detector = new PatternDetector();

      const existing = [{
        patternId: 'pattern-1',
        patternName: 'Routing Pattern',
        category: 'routing-error',
        failures: [createFailureExplanation({
          id: 'f1',
          patternCategory: 'routing-error',
          rootCause: 'Agent routing delegation failure caused request to not reach proper handler destination',
        })],
        frequency: 1,
        affectedComponents: ['agent-a'],
        commonRootCauses: ['Agent routing delegation failure caused request to not reach proper handler destination'],
        similarityScore: 0.8,
        detectedAt: new Date().toISOString(),
      }];

      const newPatterns = [{
        patternId: 'pattern-2',
        patternName: 'Another Routing',
        category: 'routing-error',
        failures: [createFailureExplanation({
          id: 'f2',
          patternCategory: 'routing-error',
          rootCause: 'Agent routing delegation failure caused request to not reach proper handler target',
        })],
        frequency: 1,
        affectedComponents: ['agent-b'],
        commonRootCauses: ['Agent routing delegation failure caused request to not reach proper handler target'],
        similarityScore: 0.7,
        detectedAt: new Date().toISOString(),
      }];

      const merged = detector.mergeWithExisting(newPatterns, existing);

      expect(merged.length).toBe(1);
      expect(merged[0].frequency).toBe(2);
      expect(merged[0].affectedComponents).toContain('agent-a');
      expect(merged[0].affectedComponents).toContain('agent-b');
    });

    test('keeps dissimilar patterns separate', () => {
      const detector = new PatternDetector();

      const existing = [{
        patternId: 'pattern-1',
        patternName: 'Routing Pattern',
        category: 'routing-error',
        failures: [],
        frequency: 1,
        affectedComponents: [],
        commonRootCauses: ['completely different cause about authentication'],
        similarityScore: 0.8,
        detectedAt: new Date().toISOString(),
      }];

      const newPatterns = [{
        patternId: 'pattern-2',
        patternName: 'Validation Pattern',
        category: 'validation-failure',
        failures: [],
        frequency: 1,
        affectedComponents: [],
        commonRootCauses: ['validation schema mismatch'],
        similarityScore: 0.7,
        detectedAt: new Date().toISOString(),
      }];

      const merged = detector.mergeWithExisting(newPatterns, existing);

      expect(merged.length).toBe(2);
    });
  });

  describe('getStats', () => {
    test('returns zero stats for empty patterns', () => {
      const detector = new PatternDetector();
      const stats = detector.getStats([]);

      expect(stats.totalPatterns).toBe(0);
      expect(stats.totalFailures).toBe(0);
      expect(stats.avgPatterSize).toBe(0);
      expect(Object.keys(stats.byCategory).length).toBe(0);
    });

    test('calculates stats correctly', () => {
      const detector = new PatternDetector();

      const patterns = [
        {
          patternId: 'p1',
          patternName: 'Pattern 1',
          category: 'routing-error',
          failures: [],
          frequency: 3,
          affectedComponents: [],
          commonRootCauses: [],
          similarityScore: 0.8,
          detectedAt: new Date().toISOString(),
        },
        {
          patternId: 'p2',
          patternName: 'Pattern 2',
          category: 'routing-error',
          failures: [],
          frequency: 2,
          affectedComponents: [],
          commonRootCauses: [],
          similarityScore: 0.7,
          detectedAt: new Date().toISOString(),
        },
        {
          patternId: 'p3',
          patternName: 'Pattern 3',
          category: 'validation-failure',
          failures: [],
          frequency: 4,
          affectedComponents: [],
          commonRootCauses: [],
          similarityScore: 0.9,
          detectedAt: new Date().toISOString(),
        },
      ];

      const stats = detector.getStats(patterns);

      expect(stats.totalPatterns).toBe(3);
      expect(stats.totalFailures).toBe(9);
      expect(stats.avgPatterSize).toBe(3);
      expect(stats.byCategory['routing-error']).toBe(5);
      expect(stats.byCategory['validation-failure']).toBe(4);
    });
  });
});
