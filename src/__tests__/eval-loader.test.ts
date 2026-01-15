import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { loadEvalCases, loadEvalCase, groupByCategory } from '../utils/eval-loader.js';
import type { EvalCase } from '../config/schemas.js';

describe('loadEvalCases', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `eval-loader-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test('returns empty array for empty directory', async () => {
    const cases = await loadEvalCases({
      testDir,
      testMatch: ['**/*.eval.json'],
    });

    expect(cases).toEqual([]);
  });

  test('loads eval cases from json files', async () => {
    await fs.writeFile(
      path.join(testDir, 'test.eval.json'),
      JSON.stringify({
        id: 'test-1',
        name: 'Test 1',
        description: 'Description',
        category: 'basic',
        prompt: 'Test prompt',
        judges: [],
      })
    );

    const cases = await loadEvalCases({
      testDir,
      testMatch: ['**/*.eval.json'],
    });

    expect(cases.length).toBe(1);
    expect(cases[0].id).toBe('test-1');
  });

  test('loads multiple eval cases', async () => {
    await fs.writeFile(
      path.join(testDir, 'test1.eval.json'),
      JSON.stringify({
        id: 'test-1',
        name: 'Test 1',
        description: 'd',
        category: 'basic',
        prompt: 'p',
        judges: [],
      })
    );

    await fs.writeFile(
      path.join(testDir, 'test2.eval.json'),
      JSON.stringify({
        id: 'test-2',
        name: 'Test 2',
        description: 'd',
        category: 'basic',
        prompt: 'p',
        judges: [],
      })
    );

    const cases = await loadEvalCases({
      testDir,
      testMatch: ['**/*.eval.json'],
    });

    expect(cases.length).toBe(2);
  });

  test('loads from nested directories', async () => {
    await fs.mkdir(path.join(testDir, 'nested', 'deep'), { recursive: true });

    await fs.writeFile(
      path.join(testDir, 'nested', 'deep', 'test.eval.json'),
      JSON.stringify({
        id: 'nested-test',
        name: 'Nested Test',
        description: 'd',
        category: 'basic',
        prompt: 'p',
        judges: [],
      })
    );

    const cases = await loadEvalCases({
      testDir,
      testMatch: ['**/*.eval.json'],
    });

    expect(cases.length).toBe(1);
    expect(cases[0].id).toBe('nested-test');
  });

  test('filters by category', async () => {
    await fs.writeFile(
      path.join(testDir, 'basic.eval.json'),
      JSON.stringify({
        id: 'basic-1',
        name: 'Basic',
        description: 'd',
        category: 'basic',
        prompt: 'p',
        judges: [],
      })
    );

    await fs.writeFile(
      path.join(testDir, 'tool.eval.json'),
      JSON.stringify({
        id: 'tool-1',
        name: 'Tool',
        description: 'd',
        category: 'tool',
        prompt: 'p',
        expectedToolCalls: [],
        judges: [],
      })
    );

    const cases = await loadEvalCases({
      testDir,
      testMatch: ['**/*.eval.json'],
      categories: ['tool'],
    });

    expect(cases.length).toBe(1);
    expect(cases[0].id).toBe('tool-1');
  });

  test('filters by tags', async () => {
    await fs.writeFile(
      path.join(testDir, 'tagged.eval.json'),
      JSON.stringify({
        id: 'tagged-1',
        name: 'Tagged',
        description: 'd',
        category: 'basic',
        prompt: 'p',
        tags: ['important', 'regression'],
        judges: [],
      })
    );

    await fs.writeFile(
      path.join(testDir, 'untagged.eval.json'),
      JSON.stringify({
        id: 'untagged-1',
        name: 'Untagged',
        description: 'd',
        category: 'basic',
        prompt: 'p',
        judges: [],
      })
    );

    const cases = await loadEvalCases({
      testDir,
      testMatch: ['**/*.eval.json'],
      tags: ['important'],
    });

    expect(cases.length).toBe(1);
    expect(cases[0].id).toBe('tagged-1');
  });

  test('filters by ids', async () => {
    await fs.writeFile(
      path.join(testDir, 'a.eval.json'),
      JSON.stringify({
        id: 'case-a',
        name: 'A',
        description: 'd',
        category: 'basic',
        prompt: 'p',
        judges: [],
      })
    );

    await fs.writeFile(
      path.join(testDir, 'b.eval.json'),
      JSON.stringify({
        id: 'case-b',
        name: 'B',
        description: 'd',
        category: 'basic',
        prompt: 'p',
        judges: [],
      })
    );

    await fs.writeFile(
      path.join(testDir, 'c.eval.json'),
      JSON.stringify({
        id: 'case-c',
        name: 'C',
        description: 'd',
        category: 'basic',
        prompt: 'p',
        judges: [],
      })
    );

    const cases = await loadEvalCases({
      testDir,
      testMatch: ['**/*.eval.json'],
      ids: ['case-a', 'case-c'],
    });

    expect(cases.length).toBe(2);
    const ids = cases.map(c => c.id).sort();
    expect(ids).toEqual(['case-a', 'case-c']);
  });

  test('filters out disabled cases by default', async () => {
    await fs.writeFile(
      path.join(testDir, 'enabled.eval.json'),
      JSON.stringify({
        id: 'enabled-1',
        name: 'Enabled',
        description: 'd',
        category: 'basic',
        prompt: 'p',
        enabled: true,
        judges: [],
      })
    );

    await fs.writeFile(
      path.join(testDir, 'disabled.eval.json'),
      JSON.stringify({
        id: 'disabled-1',
        name: 'Disabled',
        description: 'd',
        category: 'basic',
        prompt: 'p',
        enabled: false,
        judges: [],
      })
    );

    const cases = await loadEvalCases({
      testDir,
      testMatch: ['**/*.eval.json'],
    });

    expect(cases.length).toBe(1);
    expect(cases[0].id).toBe('enabled-1');
  });

  test('includes disabled cases when enabledOnly is false', async () => {
    await fs.writeFile(
      path.join(testDir, 'disabled.eval.json'),
      JSON.stringify({
        id: 'disabled-1',
        name: 'Disabled',
        description: 'd',
        category: 'basic',
        prompt: 'p',
        enabled: false,
        judges: [],
      })
    );

    const cases = await loadEvalCases({
      testDir,
      testMatch: ['**/*.eval.json'],
      enabledOnly: false,
    });

    expect(cases.length).toBe(1);
    expect(cases[0].id).toBe('disabled-1');
  });

  test('skips invalid json files', async () => {
    await fs.writeFile(
      path.join(testDir, 'valid.eval.json'),
      JSON.stringify({
        id: 'valid-1',
        name: 'Valid',
        description: 'd',
        category: 'basic',
        prompt: 'p',
        judges: [],
      })
    );

    await fs.writeFile(
      path.join(testDir, 'invalid.eval.json'),
      'not valid json'
    );

    const cases = await loadEvalCases({
      testDir,
      testMatch: ['**/*.eval.json'],
    });

    expect(cases.length).toBe(1);
    expect(cases[0].id).toBe('valid-1');
  });

  test('skips files that do not match schema', async () => {
    await fs.writeFile(
      path.join(testDir, 'valid.eval.json'),
      JSON.stringify({
        id: 'valid-1',
        name: 'Valid',
        description: 'd',
        category: 'basic',
        prompt: 'p',
        judges: [],
      })
    );

    await fs.writeFile(
      path.join(testDir, 'invalid-schema.eval.json'),
      JSON.stringify({
        id: 'invalid',
        name: 'Invalid',
      })
    );

    const cases = await loadEvalCases({
      testDir,
      testMatch: ['**/*.eval.json'],
    });

    expect(cases.length).toBe(1);
    expect(cases[0].id).toBe('valid-1');
  });

  test('supports multiple testMatch patterns', async () => {
    await fs.writeFile(
      path.join(testDir, 'test.eval.json'),
      JSON.stringify({
        id: 'eval-1',
        name: 'Eval',
        description: 'd',
        category: 'basic',
        prompt: 'p',
        judges: [],
      })
    );

    await fs.writeFile(
      path.join(testDir, 'test.test.json'),
      JSON.stringify({
        id: 'test-1',
        name: 'Test',
        description: 'd',
        category: 'basic',
        prompt: 'p',
        judges: [],
      })
    );

    const cases = await loadEvalCases({
      testDir,
      testMatch: ['**/*.eval.json', '**/*.test.json'],
    });

    expect(cases.length).toBe(2);
  });
});

describe('loadEvalCase', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `eval-loader-single-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    await fs.writeFile(
      path.join(testDir, 'target.eval.json'),
      JSON.stringify({
        id: 'target-case',
        name: 'Target',
        description: 'd',
        category: 'basic',
        prompt: 'p',
        judges: [],
      })
    );

    await fs.writeFile(
      path.join(testDir, 'other.eval.json'),
      JSON.stringify({
        id: 'other-case',
        name: 'Other',
        description: 'd',
        category: 'basic',
        prompt: 'p',
        judges: [],
      })
    );
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test('loads single case by id', async () => {
    const evalCase = await loadEvalCase('target-case', {
      testDir,
      testMatch: ['**/*.eval.json'],
    });

    expect(evalCase).not.toBeNull();
    expect(evalCase?.id).toBe('target-case');
  });

  test('returns null for non-existent id', async () => {
    const evalCase = await loadEvalCase('non-existent', {
      testDir,
      testMatch: ['**/*.eval.json'],
    });

    expect(evalCase).toBeNull();
  });
});

describe('groupByCategory', () => {
  test('groups empty array', () => {
    const grouped = groupByCategory([]);

    expect(grouped.tool).toEqual([]);
    expect(grouped['code-gen']).toEqual([]);
    expect(grouped['multi-turn']).toEqual([]);
    expect(grouped.routing).toEqual([]);
    expect(grouped.basic).toEqual([]);
  });

  test('groups cases by category', () => {
    const cases: EvalCase[] = [
      { id: 'b1', name: 'B1', description: 'd', category: 'basic', prompt: 'p', judges: [], enabled: true },
      { id: 't1', name: 'T1', description: 'd', category: 'tool', prompt: 'p', expectedToolCalls: [], judges: [], enabled: true },
      { id: 'b2', name: 'B2', description: 'd', category: 'basic', prompt: 'p', judges: [], enabled: true },
      { id: 'c1', name: 'C1', description: 'd', category: 'code-gen', prompt: 'p', targetFiles: [], syntaxValidation: true, buildVerification: false, judges: [], enabled: true },
    ];

    const grouped = groupByCategory(cases);

    expect(grouped.basic.length).toBe(2);
    expect(grouped.tool.length).toBe(1);
    expect(grouped['code-gen'].length).toBe(1);
    expect(grouped['multi-turn'].length).toBe(0);
    expect(grouped.routing.length).toBe(0);
  });

  test('preserves eval case objects', () => {
    const basicCase: EvalCase = {
      id: 'preserve-test',
      name: 'Preserve',
      description: 'd',
      category: 'basic',
      prompt: 'p',
      judges: [],
      enabled: true,
    };

    const grouped = groupByCategory([basicCase]);

    expect(grouped.basic[0]).toBe(basicCase);
  });

  test('handles all category types', () => {
    const cases: EvalCase[] = [
      { id: 'b1', name: 'B', description: 'd', category: 'basic', prompt: 'p', judges: [], enabled: true },
      { id: 't1', name: 'T', description: 'd', category: 'tool', prompt: 'p', expectedToolCalls: [], judges: [], enabled: true },
      { id: 'c1', name: 'C', description: 'd', category: 'code-gen', prompt: 'p', targetFiles: [], syntaxValidation: true, buildVerification: false, judges: [], enabled: true },
      { id: 'r1', name: 'R', description: 'd', category: 'routing', prompt: 'p', expectedAgent: 'agent', judges: [], enabled: true },
      { id: 'm1', name: 'M', description: 'd', category: 'multi-turn', turns: [], sessionPersistence: true, enabled: true },
    ];

    const grouped = groupByCategory(cases);

    expect(grouped.basic.length).toBe(1);
    expect(grouped.tool.length).toBe(1);
    expect(grouped['code-gen'].length).toBe(1);
    expect(grouped.routing.length).toBe(1);
    expect(grouped['multi-turn'].length).toBe(1);
  });
});
