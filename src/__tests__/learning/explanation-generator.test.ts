import { describe, expect, test } from 'bun:test';
import {
  ExplanationGenerator,
  parseExplanationResponse,
} from '../../learning/explanation-generator.js';
import type { FailureExplanation } from '../../learning/types.js';
import type { FailureInput } from '../../learning/data-sources/types.js';

function createFailureExplanation(overrides: Partial<FailureExplanation> = {}): FailureExplanation {
  return {
    id: overrides.id || `explanation-${Date.now()}`,
    failureInput: overrides.failureInput || createFailureInput(),
    explanation: overrides.explanation || {
      whatWentWrong: 'Test failure',
      whyItFailed: 'Test reason',
      rootCause: 'Test root cause',
      suggestedFix: 'Test fix',
      patternCategory: 'routing-error',
    },
    confidence: overrides.confidence ?? 0.8,
    generatedAt: overrides.generatedAt || new Date().toISOString(),
    model: overrides.model || 'claude-sonnet-4-20250514',
  };
}

function createFailureInput(overrides: Partial<FailureInput> = {}): FailureInput {
  return {
    id: overrides.id || `failure-${Date.now()}`,
    source: overrides.source || 'eval',
    sourceId: overrides.sourceId || 'test-eval',
    prompt: overrides.prompt || 'Test prompt',
    output: overrides.output || 'Test output',
    timestamp: overrides.timestamp || new Date().toISOString(),
    ...overrides,
  };
}

describe('parseExplanationResponse', () => {
  describe('JSON extraction', () => {
    test('extracts JSON from markdown code block', () => {
      const response = `Here is my analysis:

\`\`\`json
{
  "whatWentWrong": "Agent failed to call the tool",
  "whyItFailed": "Missing instructions",
  "rootCause": "No guidance provided",
  "suggestedFix": "Add explicit tool usage instruction",
  "patternCategory": "missing-tool-call",
  "affectedComponent": "routing",
  "confidence": 0.85
}
\`\`\`

That's my assessment.`;

      const result = parseExplanationResponse(response);

      expect(result.whatWentWrong).toBe('Agent failed to call the tool');
      expect(result.whyItFailed).toBe('Missing instructions');
      expect(result.rootCause).toBe('No guidance provided');
      expect(result.suggestedFix).toBe('Add explicit tool usage instruction');
      expect(result.patternCategory).toBe('missing-tool-call');
      expect(result.affectedComponent).toBe('routing');
      expect(result.confidence).toBe(0.85);
    });

    test('parses raw JSON without code block', () => {
      const response = `{"whatWentWrong": "Error", "whyItFailed": "Bug", "rootCause": "Code issue", "suggestedFix": "Fix it", "patternCategory": "other", "confidence": 0.7}`;

      const result = parseExplanationResponse(response);

      expect(result.whatWentWrong).toBe('Error');
      expect(result.confidence).toBe(0.7);
    });

    test('extracts JSON with extra whitespace in code block', () => {
      const response = `\`\`\`json

  { "whatWentWrong": "Test", "whyItFailed": "Test", "rootCause": "Test", "suggestedFix": "Test", "patternCategory": "other", "confidence": 0.9 }

\`\`\``;

      const result = parseExplanationResponse(response);

      expect(result.whatWentWrong).toBe('Test');
      expect(result.confidence).toBe(0.9);
    });
  });

  describe('confidence clamping', () => {
    test('clamps confidence above 1 to 1', () => {
      const response = `{"whatWentWrong": "Test", "whyItFailed": "Test", "rootCause": "Test", "suggestedFix": "Test", "patternCategory": "other", "confidence": 1.5}`;

      const result = parseExplanationResponse(response);

      expect(result.confidence).toBe(1);
    });

    test('clamps negative confidence to 0', () => {
      const response = `{"whatWentWrong": "Test", "whyItFailed": "Test", "rootCause": "Test", "suggestedFix": "Test", "patternCategory": "other", "confidence": -0.5}`;

      const result = parseExplanationResponse(response);

      expect(result.confidence).toBe(0);
    });
  });

  describe('missing fields handling', () => {
    test('uses default values when fields are missing', () => {
      const response = `{}`;

      const result = parseExplanationResponse(response);

      expect(result.whatWentWrong).toBe('Unknown');
      expect(result.whyItFailed).toBe('Unknown');
      expect(result.rootCause).toBe('Unknown');
      expect(result.suggestedFix).toBe('No suggestion');
      expect(result.patternCategory).toBe('other');
      expect(result.confidence).toBe(0.5);
    });

    test('uses default confidence of 0.5 when missing', () => {
      const response = `{"whatWentWrong": "Test", "whyItFailed": "Test", "rootCause": "Test", "suggestedFix": "Test", "patternCategory": "test"}`;

      const result = parseExplanationResponse(response);

      expect(result.confidence).toBe(0.5);
    });

    test('affectedComponent is undefined when not provided', () => {
      const response = `{"whatWentWrong": "Test", "whyItFailed": "Test", "rootCause": "Test", "suggestedFix": "Test", "patternCategory": "test", "confidence": 0.8}`;

      const result = parseExplanationResponse(response);

      expect(result.affectedComponent).toBeUndefined();
    });
  });

  describe('malformed JSON handling', () => {
    test('returns failure result for completely invalid JSON', () => {
      const response = `This is not JSON at all.`;

      const result = parseExplanationResponse(response);

      expect(result.whatWentWrong).toBe('Failed to parse response');
      expect(result.rootCause).toBe('Parse error');
      expect(result.suggestedFix).toBe('Manual review required');
      expect(result.confidence).toBe(0);
    });

    test('returns failure result for partial JSON', () => {
      const response = `{"whatWentWrong": "Test",`;

      const result = parseExplanationResponse(response);

      expect(result.whatWentWrong).toBe('Failed to parse response');
      expect(result.confidence).toBe(0);
    });

    test('stores original text in whyItFailed for debugging', () => {
      const response = `Some invalid text that is not JSON`;

      const result = parseExplanationResponse(response);

      expect(result.whyItFailed).toContain('Some invalid text');
    });

    test('truncates long invalid response', () => {
      const longResponse = 'x'.repeat(600);

      const result = parseExplanationResponse(longResponse);

      expect(result.whyItFailed.length).toBeLessThanOrEqual(500);
    });
  });
});

describe('ExplanationGenerator', () => {
  describe('filterByConfidence', () => {
    test('filters explanations below default threshold', () => {
      const generator = new ExplanationGenerator();

      const explanations = [
        createFailureExplanation({ id: 'high', confidence: 0.9 }),
        createFailureExplanation({ id: 'medium', confidence: 0.5 }),
        createFailureExplanation({ id: 'low', confidence: 0.3 }),
      ];

      const filtered = generator.filterByConfidence(explanations);

      expect(filtered.length).toBe(2);
      expect(filtered.map((e) => e.id)).toContain('high');
      expect(filtered.map((e) => e.id)).toContain('medium');
      expect(filtered.map((e) => e.id)).not.toContain('low');
    });

    test('uses custom threshold when provided', () => {
      const generator = new ExplanationGenerator();

      const explanations = [
        createFailureExplanation({ id: 'high', confidence: 0.9 }),
        createFailureExplanation({ id: 'medium', confidence: 0.7 }),
        createFailureExplanation({ id: 'low', confidence: 0.6 }),
      ];

      const filtered = generator.filterByConfidence(explanations, 0.8);

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('high');
    });

    test('returns empty array when all below threshold', () => {
      const generator = new ExplanationGenerator();

      const explanations = [
        createFailureExplanation({ confidence: 0.3 }),
        createFailureExplanation({ confidence: 0.4 }),
      ];

      const filtered = generator.filterByConfidence(explanations, 0.5);

      expect(filtered).toEqual([]);
    });

    test('returns all explanations when all above threshold', () => {
      const generator = new ExplanationGenerator();

      const explanations = [
        createFailureExplanation({ confidence: 0.8 }),
        createFailureExplanation({ confidence: 0.9 }),
      ];

      const filtered = generator.filterByConfidence(explanations, 0.5);

      expect(filtered.length).toBe(2);
    });

    test('includes explanations at exactly the threshold', () => {
      const generator = new ExplanationGenerator();

      const explanations = [
        createFailureExplanation({ id: 'exact', confidence: 0.5 }),
        createFailureExplanation({ id: 'below', confidence: 0.49 }),
      ];

      const filtered = generator.filterByConfidence(explanations, 0.5);

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('exact');
    });
  });

  describe('groupByCategory', () => {
    test('groups explanations by pattern category', () => {
      const generator = new ExplanationGenerator();

      const explanations = [
        createFailureExplanation({
          id: 'routing-1',
          explanation: {
            ...createFailureExplanation().explanation,
            patternCategory: 'routing-error',
          },
        }),
        createFailureExplanation({
          id: 'routing-2',
          explanation: {
            ...createFailureExplanation().explanation,
            patternCategory: 'routing-error',
          },
        }),
        createFailureExplanation({
          id: 'validation-1',
          explanation: {
            ...createFailureExplanation().explanation,
            patternCategory: 'validation-failure',
          },
        }),
      ];

      const grouped = generator.groupByCategory(explanations);

      expect(Object.keys(grouped)).toContain('routing-error');
      expect(Object.keys(grouped)).toContain('validation-failure');
      expect(grouped['routing-error'].length).toBe(2);
      expect(grouped['validation-failure'].length).toBe(1);
    });

    test('returns empty object for empty input', () => {
      const generator = new ExplanationGenerator();

      const grouped = generator.groupByCategory([]);

      expect(grouped).toEqual({});
    });

    test('handles single category', () => {
      const generator = new ExplanationGenerator();

      const explanations = [
        createFailureExplanation({
          explanation: { ...createFailureExplanation().explanation, patternCategory: 'other' },
        }),
        createFailureExplanation({
          explanation: { ...createFailureExplanation().explanation, patternCategory: 'other' },
        }),
      ];

      const grouped = generator.groupByCategory(explanations);

      expect(Object.keys(grouped)).toEqual(['other']);
      expect(grouped['other'].length).toBe(2);
    });

    test('preserves explanation objects in grouped result', () => {
      const generator = new ExplanationGenerator();

      const original = createFailureExplanation({
        id: 'test-id',
        confidence: 0.95,
        explanation: {
          ...createFailureExplanation().explanation,
          patternCategory: 'test-category',
        },
      });

      const grouped = generator.groupByCategory([original]);

      expect(grouped['test-category'][0]).toBe(original);
      expect(grouped['test-category'][0].id).toBe('test-id');
      expect(grouped['test-category'][0].confidence).toBe(0.95);
    });
  });

  describe('constructor', () => {
    test('accepts custom config', () => {
      const generator = new ExplanationGenerator({
        explanationModel: 'claude-3-haiku-20240307',
      });

      expect(generator).toBeInstanceOf(ExplanationGenerator);
    });

    test('uses default config when not provided', () => {
      const generator = new ExplanationGenerator();

      expect(generator).toBeInstanceOf(ExplanationGenerator);
    });
  });
});
