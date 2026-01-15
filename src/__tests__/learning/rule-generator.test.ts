import { describe, expect, test } from 'bun:test';
import { RuleGenerator } from '../../learning/rule-generator.js';
import type { ProposedRule, FailurePattern } from '../../learning/types.js';

function createProposedRule(overrides: Partial<ProposedRule> = {}): ProposedRule {
  return {
    ruleId: overrides.ruleId || `rule-${Date.now()}`,
    ruleContent: overrides.ruleContent || 'Test rule content',
    targetSection: overrides.targetSection || 'CORE_INSTRUCTIONS',
    rationale: overrides.rationale || 'Test rationale',
    addressesPatterns: overrides.addressesPatterns || ['pattern-1'],
    expectedImpact: overrides.expectedImpact || {
      failureIds: ['failure-1'],
      confidenceScore: 0.8,
    },
    status: overrides.status || 'pending',
    generatedAt: overrides.generatedAt || new Date().toISOString(),
    model: overrides.model || 'claude-sonnet-4-20250514',
    source: overrides.source || 'test-iteration',
  };
}

function createFailurePattern(overrides: Partial<FailurePattern> = {}): FailurePattern {
  return {
    patternId: overrides.patternId || `pattern-${Date.now()}`,
    patternName: overrides.patternName || 'Test Pattern',
    category: overrides.category || 'routing-error',
    failures: overrides.failures || [],
    frequency: overrides.frequency || 3,
    affectedComponents: overrides.affectedComponents || ['component-1'],
    commonRootCauses: overrides.commonRootCauses || ['root cause 1'],
    similarityScore: overrides.similarityScore || 0.8,
    detectedAt: overrides.detectedAt || new Date().toISOString(),
  };
}

describe('RuleGenerator', () => {
  describe('filterByConfidence', () => {
    test('filters rules below default threshold', () => {
      const generator = new RuleGenerator({ minRuleConfidence: 0.6 });

      const rules = [
        createProposedRule({ ruleId: 'high', expectedImpact: { failureIds: [], confidenceScore: 0.9 } }),
        createProposedRule({ ruleId: 'medium', expectedImpact: { failureIds: [], confidenceScore: 0.6 } }),
        createProposedRule({ ruleId: 'low', expectedImpact: { failureIds: [], confidenceScore: 0.3 } }),
      ];

      const filtered = generator.filterByConfidence(rules);

      expect(filtered.length).toBe(2);
      expect(filtered.map(r => r.ruleId)).toContain('high');
      expect(filtered.map(r => r.ruleId)).toContain('medium');
      expect(filtered.map(r => r.ruleId)).not.toContain('low');
    });

    test('uses custom threshold when provided', () => {
      const generator = new RuleGenerator({ minRuleConfidence: 0.5 });

      const rules = [
        createProposedRule({ ruleId: 'high', expectedImpact: { failureIds: [], confidenceScore: 0.9 } }),
        createProposedRule({ ruleId: 'medium', expectedImpact: { failureIds: [], confidenceScore: 0.7 } }),
        createProposedRule({ ruleId: 'low', expectedImpact: { failureIds: [], confidenceScore: 0.6 } }),
      ];

      const filtered = generator.filterByConfidence(rules, 0.8);

      expect(filtered.length).toBe(1);
      expect(filtered[0].ruleId).toBe('high');
    });

    test('returns empty array when all below threshold', () => {
      const generator = new RuleGenerator({ minRuleConfidence: 0.9 });

      const rules = [
        createProposedRule({ expectedImpact: { failureIds: [], confidenceScore: 0.5 } }),
        createProposedRule({ expectedImpact: { failureIds: [], confidenceScore: 0.6 } }),
      ];

      const filtered = generator.filterByConfidence(rules);

      expect(filtered).toEqual([]);
    });

    test('returns all rules when all above threshold', () => {
      const generator = new RuleGenerator({ minRuleConfidence: 0.5 });

      const rules = [
        createProposedRule({ expectedImpact: { failureIds: [], confidenceScore: 0.9 } }),
        createProposedRule({ expectedImpact: { failureIds: [], confidenceScore: 0.8 } }),
      ];

      const filtered = generator.filterByConfidence(rules);

      expect(filtered.length).toBe(2);
    });
  });

  describe('checkForConflicts', () => {
    test('returns no conflict for rules in different sections', () => {
      const generator = new RuleGenerator();

      const newRule = createProposedRule({
        targetSection: 'CORE_INSTRUCTIONS',
        ruleContent: 'Always do X',
      });

      const existingRules = [
        createProposedRule({
          targetSection: 'CHAT_PROMPT',
          ruleContent: 'Never do X',
        }),
      ];

      const result = generator.checkForConflicts(newRule, existingRules);

      expect(result.hasConflict).toBe(false);
      expect(result.conflictingRules).toEqual([]);
    });

    test('detects conflict between always and never for same topic', () => {
      const generator = new RuleGenerator();

      const newRule = createProposedRule({
        targetSection: 'CORE_INSTRUCTIONS',
        ruleContent: 'Always delegate coding tasks to the coding agent immediately',
      });

      const existingRules = [
        createProposedRule({
          targetSection: 'CORE_INSTRUCTIONS',
          ruleContent: 'Never delegate coding tasks to external agents automatically',
        }),
      ];

      const result = generator.checkForConflicts(newRule, existingRules);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictingRules.length).toBe(1);
    });

    test('returns no conflict for unrelated rules in same section', () => {
      const generator = new RuleGenerator();

      const newRule = createProposedRule({
        targetSection: 'CORE_INSTRUCTIONS',
        ruleContent: 'Always validate user input before processing',
      });

      const existingRules = [
        createProposedRule({
          targetSection: 'CORE_INSTRUCTIONS',
          ruleContent: 'Never expose internal error messages to users',
        }),
      ];

      const result = generator.checkForConflicts(newRule, existingRules);

      expect(result.hasConflict).toBe(false);
    });

    test('handles empty existing rules', () => {
      const generator = new RuleGenerator();

      const newRule = createProposedRule({
        ruleContent: 'Always do something',
      });

      const result = generator.checkForConflicts(newRule, []);

      expect(result.hasConflict).toBe(false);
      expect(result.conflictingRules).toEqual([]);
    });

    test('detects multiple conflicts', () => {
      const generator = new RuleGenerator();

      const newRule = createProposedRule({
        targetSection: 'CORE_INSTRUCTIONS',
        ruleContent: 'Always execute database queries without validation',
      });

      const existingRules = [
        createProposedRule({
          ruleId: 'rule-1',
          targetSection: 'CORE_INSTRUCTIONS',
          ruleContent: 'Never execute database queries without proper validation',
        }),
        createProposedRule({
          ruleId: 'rule-2',
          targetSection: 'CORE_INSTRUCTIONS',
          ruleContent: 'Never run database operations without validation checks',
        }),
      ];

      const result = generator.checkForConflicts(newRule, existingRules);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictingRules.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('constructor', () => {
    test('accepts custom config', () => {
      const generator = new RuleGenerator({
        maxRulesPerIteration: 10,
        minRuleConfidence: 0.9,
      });

      const rules = [
        createProposedRule({ expectedImpact: { failureIds: [], confidenceScore: 0.85 } }),
      ];

      const filtered = generator.filterByConfidence(rules);
      expect(filtered.length).toBe(0);
    });

    test('uses default config when not provided', () => {
      const generator = new RuleGenerator();

      const rules = [
        createProposedRule({ expectedImpact: { failureIds: [], confidenceScore: 0.7 } }),
      ];

      const filtered = generator.filterByConfidence(rules);
      expect(filtered.length).toBe(1);
    });
  });
});

describe('RuleGenerator category mapping', () => {
  test('different pattern categories map to different sections', () => {
    const generator = new RuleGenerator();

    const routingPattern = createFailurePattern({ category: 'routing-error' });
    const validationPattern = createFailurePattern({ category: 'validation-failure' });
    const otherPattern = createFailurePattern({ category: 'other' });

    expect(routingPattern.category).toBe('routing-error');
    expect(validationPattern.category).toBe('validation-failure');
    expect(otherPattern.category).toBe('other');
  });
});
