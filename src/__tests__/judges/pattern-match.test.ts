import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { PatternMatchJudge } from '../../judges/builtin/pattern-match.js';
import type { JudgeContext, ExecutionResult } from '../../judges/judge-interface.js';
import type { CodeGenEvalCase, BasicEvalCase } from '../../config/schemas.js';

describe('PatternMatchJudge', () => {
  const judge = new PatternMatchJudge();
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `pattern-match-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  const createContext = (evalCase: CodeGenEvalCase | BasicEvalCase): JudgeContext => ({
    evalCase,
    executionResult: {
      success: true,
      output: '',
      toolCalls: [],
      duration: 0,
    } as ExecutionResult,
    workingDirectory: testDir,
  });

  test('has correct metadata', () => {
    expect(judge.id).toBe('pattern-match');
    expect(judge.name).toBe('Pattern Match Judge');
    expect(judge.type).toBe('code');
  });

  test('returns not applicable for non-code-gen evals', async () => {
    const basicEval: BasicEvalCase = {
      id: 'b1',
      name: 'Basic',
      description: 'd',
      category: 'basic',
      prompt: 'p',
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(basicEval));

    expect(result.passed).toBe(true);
    expect(result.reasoning).toBe('Only applicable for code-gen evals');
  });

  test('returns not applicable when no expected patterns', async () => {
    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['test.ts'],
      syntaxValidation: true,
      buildVerification: false,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(true);
    expect(result.reasoning).toBe('No expected patterns specified');
  });

  test('passes when all patterns match', async () => {
    await fs.writeFile(
      path.join(testDir, 'test.ts'),
      'export function hello() { return "world"; }'
    );

    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['test.ts'],
      expectedPatterns: [
        { file: 'test.ts', patterns: ['export function', 'hello', 'return'] },
      ],
      syntaxValidation: true,
      buildVerification: false,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.reasoning).toBe('All 3 expected patterns found');
  });

  test('fails when patterns do not match', async () => {
    await fs.writeFile(path.join(testDir, 'test.ts'), 'const x = 1;');

    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['test.ts'],
      expectedPatterns: [
        { file: 'test.ts', patterns: ['export function', 'class'] },
      ],
      syntaxValidation: true,
      buildVerification: false,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  test('handles file not found', async () => {
    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['missing.ts'],
      expectedPatterns: [
        { file: 'missing.ts', patterns: ['export'] },
      ],
      syntaxValidation: true,
      buildVerification: false,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  test('supports regex patterns', async () => {
    await fs.writeFile(
      path.join(testDir, 'test.ts'),
      'function greet(name: string) { return `Hello ${name}`; }'
    );

    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['test.ts'],
      expectedPatterns: [
        { file: 'test.ts', patterns: ['function\\s+\\w+', ':\\s*string', '`Hello'] },
      ],
      syntaxValidation: true,
      buildVerification: false,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  test('handles multiple files with patterns', async () => {
    await fs.writeFile(path.join(testDir, 'a.ts'), 'export const A = 1;');
    await fs.writeFile(path.join(testDir, 'b.ts'), 'export const B = 2;');

    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['a.ts', 'b.ts'],
      expectedPatterns: [
        { file: 'a.ts', patterns: ['const A'] },
        { file: 'b.ts', patterns: ['const B'] },
      ],
      syntaxValidation: true,
      buildVerification: false,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  test('passes with 80% threshold', async () => {
    await fs.writeFile(path.join(testDir, 'test.ts'), 'export const x = 1;');

    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['test.ts'],
      expectedPatterns: [
        { file: 'test.ts', patterns: ['export', 'const', 'x', '1', 'missing'] },
      ],
      syntaxValidation: true,
      buildVerification: false,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(true);
    expect(result.score).toBe(80);
  });

  test('includes details with pattern results', async () => {
    await fs.writeFile(path.join(testDir, 'test.ts'), 'export function foo() {}');

    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['test.ts'],
      expectedPatterns: [
        { file: 'test.ts', patterns: ['export', 'bar'] },
      ],
      syntaxValidation: true,
      buildVerification: false,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.details?.results).toHaveLength(1);
    expect(result.details?.results[0].file).toBe('test.ts');
    expect(result.details?.results[0].patterns[0]).toEqual({ pattern: 'export', found: true });
    expect(result.details?.results[0].patterns[1]).toEqual({ pattern: 'bar', found: false });
  });
});
