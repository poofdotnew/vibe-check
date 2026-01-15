import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { EvalDataSource } from '../../learning/data-sources/eval-source.js';
import type { EvalSuiteResult } from '../../runner/eval-runner.js';

function createEvalSuiteResult(overrides: Partial<EvalSuiteResult> = {}): EvalSuiteResult {
  return {
    total: overrides.total ?? 2,
    passed: overrides.passed ?? 1,
    failed: overrides.failed ?? 1,
    errors: overrides.errors ?? 0,
    passRate: overrides.passRate ?? 0.5,
    duration: overrides.duration ?? 5000,
    results: overrides.results ?? [
      {
        evalCase: {
          id: 'test-pass',
          name: 'Test Pass',
          description: 'A passing test',
          category: 'basic',
          prompt: 'Test prompt',
          judges: [],
          enabled: true,
        },
        success: true,
        output: 'Success output',
        duration: 1000,
        judgeResults: [],
      },
      {
        evalCase: {
          id: 'test-fail',
          name: 'Test Fail',
          description: 'A failing test',
          category: 'tool',
          prompt: 'Test prompt that fails',
          expectedToolCalls: [{ toolName: 'Read' }],
          judges: ['tool-invocation'],
          enabled: true,
        },
        success: false,
        output: 'Failure output',
        duration: 2000,
        judgeResults: [
          {
            judgeId: 'tool-invocation',
            passed: false,
            score: 0,
            confidence: 1,
            reasoning: 'Expected tool call not made',
          },
        ],
        error: new Error('Test failed'),
      },
    ],
  };
}

describe('EvalDataSource', () => {
  let testDir: string;
  let source: EvalDataSource;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `eval-source-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    source = new EvalDataSource(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('isAvailable', () => {
    test('returns true when directory exists', async () => {
      const available = await source.isAvailable();
      expect(available).toBe(true);
    });

    test('returns false when directory does not exist', async () => {
      const nonExistentSource = new EvalDataSource('/non/existent/path');
      const available = await nonExistentSource.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('collect', () => {
    test('returns empty array when no results exist', async () => {
      const failures = await source.collect();
      expect(failures).toEqual([]);
    });

    test('collects failures from latest.json', async () => {
      const results = createEvalSuiteResult();
      await fs.writeFile(
        path.join(testDir, 'latest.json'),
        JSON.stringify(results)
      );

      const failures = await source.collect();

      expect(failures.length).toBe(1);
      expect(failures[0].id).toBe('test-fail');
      expect(failures[0].source).toBe('eval');
    });

    test('collects failures from eval-results-*.json when no latest.json', async () => {
      const results = createEvalSuiteResult();
      await fs.writeFile(
        path.join(testDir, 'eval-results-2024-01-01.json'),
        JSON.stringify(results)
      );

      const failures = await source.collect();

      expect(failures.length).toBe(1);
    });

    test('uses most recent results file', async () => {
      const oldResults = createEvalSuiteResult({
        results: [{
          evalCase: {
            id: 'old-fail',
            name: 'Old Fail',
            description: 'd',
            category: 'basic',
            prompt: 'old',
            judges: [],
            enabled: true,
          },
          success: false,
          output: '',
          duration: 1000,
          judgeResults: [],
        }],
      });

      const newResults = createEvalSuiteResult({
        results: [{
          evalCase: {
            id: 'new-fail',
            name: 'New Fail',
            description: 'd',
            category: 'basic',
            prompt: 'new',
            judges: [],
            enabled: true,
          },
          success: false,
          output: '',
          duration: 1000,
          judgeResults: [],
        }],
      });

      await fs.writeFile(
        path.join(testDir, 'eval-results-2024-01-01.json'),
        JSON.stringify(oldResults)
      );
      await fs.writeFile(
        path.join(testDir, 'eval-results-2024-01-02.json'),
        JSON.stringify(newResults)
      );

      const failures = await source.collect();

      expect(failures.length).toBe(1);
      expect(failures[0].id).toBe('new-fail');
    });

    test('filters by category', async () => {
      const results = createEvalSuiteResult({
        results: [
          {
            evalCase: {
              id: 'tool-fail',
              name: 'Tool Fail',
              description: 'd',
              category: 'tool',
              prompt: 'p',
              expectedToolCalls: [],
              judges: [],
              enabled: true,
            },
            success: false,
            output: '',
            duration: 1000,
            judgeResults: [],
          },
          {
            evalCase: {
              id: 'basic-fail',
              name: 'Basic Fail',
              description: 'd',
              category: 'basic',
              prompt: 'p',
              judges: [],
              enabled: true,
            },
            success: false,
            output: '',
            duration: 1000,
            judgeResults: [],
          },
        ],
      });

      await fs.writeFile(
        path.join(testDir, 'latest.json'),
        JSON.stringify(results)
      );

      const failures = await source.collect({ categories: ['tool'] });

      expect(failures.length).toBe(1);
      expect(failures[0].id).toBe('tool-fail');
    });

    test('filters by IDs', async () => {
      const results = createEvalSuiteResult({
        results: [
          {
            evalCase: {
              id: 'fail-1',
              name: 'Fail 1',
              description: 'd',
              category: 'basic',
              prompt: 'p',
              judges: [],
              enabled: true,
            },
            success: false,
            output: '',
            duration: 1000,
            judgeResults: [],
          },
          {
            evalCase: {
              id: 'fail-2',
              name: 'Fail 2',
              description: 'd',
              category: 'basic',
              prompt: 'p',
              judges: [],
              enabled: true,
            },
            success: false,
            output: '',
            duration: 1000,
            judgeResults: [],
          },
        ],
      });

      await fs.writeFile(
        path.join(testDir, 'latest.json'),
        JSON.stringify(results)
      );

      const failures = await source.collect({ ids: ['fail-2'] });

      expect(failures.length).toBe(1);
      expect(failures[0].id).toBe('fail-2');
    });

    test('applies limit', async () => {
      const results = createEvalSuiteResult({
        results: [
          {
            evalCase: { id: 'fail-1', name: 'F1', description: 'd', category: 'basic', prompt: 'p', judges: [], enabled: true },
            success: false, output: '', duration: 1000, judgeResults: [],
          },
          {
            evalCase: { id: 'fail-2', name: 'F2', description: 'd', category: 'basic', prompt: 'p', judges: [], enabled: true },
            success: false, output: '', duration: 1000, judgeResults: [],
          },
          {
            evalCase: { id: 'fail-3', name: 'F3', description: 'd', category: 'basic', prompt: 'p', judges: [], enabled: true },
            success: false, output: '', duration: 1000, judgeResults: [],
          },
        ],
      });

      await fs.writeFile(
        path.join(testDir, 'latest.json'),
        JSON.stringify(results)
      );

      const failures = await source.collect({ limit: 2 });

      expect(failures.length).toBe(2);
    });

    test('extracts prompt from eval case', async () => {
      const results = createEvalSuiteResult({
        results: [{
          evalCase: {
            id: 'test-fail',
            name: 'Test Fail',
            description: 'd',
            category: 'basic',
            prompt: 'This is the test prompt',
            judges: [],
            enabled: true,
          },
          success: false,
          output: 'output',
          duration: 1000,
          judgeResults: [],
        }],
      });

      await fs.writeFile(
        path.join(testDir, 'latest.json'),
        JSON.stringify(results)
      );

      const failures = await source.collect();

      expect(failures[0].prompt).toBe('This is the test prompt');
    });

    test('extracts expected behavior from tool eval', async () => {
      const results = createEvalSuiteResult({
        results: [{
          evalCase: {
            id: 'tool-fail',
            name: 'Tool Fail',
            description: 'd',
            category: 'tool',
            prompt: 'p',
            expectedToolCalls: [{ toolName: 'Read' }, { toolName: 'Write' }],
            judges: [],
            enabled: true,
          },
          success: false,
          output: '',
          duration: 1000,
          judgeResults: [],
        }],
      });

      await fs.writeFile(
        path.join(testDir, 'latest.json'),
        JSON.stringify(results)
      );

      const failures = await source.collect();

      expect(failures[0].expectedBehavior).toContain('Read');
      expect(failures[0].expectedBehavior).toContain('Write');
    });

    test('extracts tool calls from result', async () => {
      const results = createEvalSuiteResult({
        results: [{
          evalCase: {
            id: 'fail',
            name: 'Fail',
            description: 'd',
            category: 'basic',
            prompt: 'p',
            judges: [],
            enabled: true,
          },
          success: false,
          output: '',
          duration: 1000,
          judgeResults: [],
          toolCalls: [
            { toolName: 'Read', input: { path: '/file.ts' }, output: 'content' },
          ],
        }],
      });

      await fs.writeFile(
        path.join(testDir, 'latest.json'),
        JSON.stringify(results)
      );

      const failures = await source.collect();

      expect(failures[0].toolCalls?.length).toBe(1);
      expect(failures[0].toolCalls?.[0].name).toBe('Read');
    });

    test('includes judge results', async () => {
      const results = createEvalSuiteResult({
        results: [{
          evalCase: {
            id: 'fail',
            name: 'Fail',
            description: 'd',
            category: 'basic',
            prompt: 'p',
            judges: [],
            enabled: true,
          },
          success: false,
          output: '',
          duration: 1000,
          judgeResults: [
            { judgeId: 'test-judge', passed: false, score: 50, confidence: 0.9, reasoning: 'Failed check' },
          ],
        }],
      });

      await fs.writeFile(
        path.join(testDir, 'latest.json'),
        JSON.stringify(results)
      );

      const failures = await source.collect();

      expect(failures[0].judgeResults?.length).toBe(1);
      expect(failures[0].judgeResults?.[0].judgeId).toBe('test-judge');
    });

    test('includes metadata', async () => {
      const results = createEvalSuiteResult({
        results: [{
          evalCase: {
            id: 'fail',
            name: 'Test Name',
            description: 'Test Description',
            category: 'basic',
            prompt: 'p',
            tags: ['tag1', 'tag2'],
            judges: [],
            enabled: true,
          },
          success: false,
          output: '',
          duration: 5000,
          judgeResults: [],
          retryCount: 2,
        }],
      });

      await fs.writeFile(
        path.join(testDir, 'latest.json'),
        JSON.stringify(results)
      );

      const failures = await source.collect();

      expect(failures[0].metadata?.evalName).toBe('Test Name');
      expect(failures[0].metadata?.evalDescription).toBe('Test Description');
      expect(failures[0].metadata?.evalTags).toEqual(['tag1', 'tag2']);
      expect(failures[0].metadata?.duration).toBe(5000);
      expect(failures[0].metadata?.retryCount).toBe(2);
    });
  });

  describe('getStats', () => {
    test('returns zero stats when no results', async () => {
      const stats = await source.getStats();

      expect(stats.totalRuns).toBe(0);
      expect(stats.latestRun).toBeNull();
      expect(stats.failuresInLatest).toBe(0);
    });

    test('returns stats for available results', async () => {
      const results = createEvalSuiteResult();

      await fs.writeFile(
        path.join(testDir, 'eval-results-2024-01-01.json'),
        JSON.stringify(results)
      );
      await fs.writeFile(
        path.join(testDir, 'eval-results-2024-01-02.json'),
        JSON.stringify(results)
      );

      const stats = await source.getStats();

      expect(stats.totalRuns).toBe(2);
      expect(stats.latestRun).not.toBeNull();
      expect(stats.failuresInLatest).toBe(1);
    });
  });
});
