import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileExistenceJudge } from '../../judges/builtin/file-existence.js';
import type { JudgeContext, ExecutionResult } from '../../judges/judge-interface.js';
import type { CodeGenEvalCase, BasicEvalCase } from '../../config/schemas.js';

describe('FileExistenceJudge', () => {
  const judge = new FileExistenceJudge();
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `file-existence-test-${Date.now()}`);
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
    expect(judge.id).toBe('file-existence');
    expect(judge.name).toBe('File Existence Judge');
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

  test('returns not applicable when no target files specified', async () => {
    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: [],
      syntaxValidation: true,
      buildVerification: false,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(true);
    expect(result.reasoning).toBe('No target files specified');
  });

  test('passes when all files exist', async () => {
    await fs.writeFile(path.join(testDir, 'file1.ts'), 'content');
    await fs.writeFile(path.join(testDir, 'file2.ts'), 'content');

    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['file1.ts', 'file2.ts'],
      syntaxValidation: true,
      buildVerification: false,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.reasoning).toBe('All 2 expected files exist');
  });

  test('fails when files are missing', async () => {
    await fs.writeFile(path.join(testDir, 'file1.ts'), 'content');

    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['file1.ts', 'file2.ts', 'file3.ts'],
      syntaxValidation: true,
      buildVerification: false,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(false);
    expect(result.score).toBeCloseTo(33.33, 1);
    expect(result.reasoning).toContain('file2.ts');
    expect(result.reasoning).toContain('file3.ts');
  });

  test('passes with 80% threshold', async () => {
    await fs.writeFile(path.join(testDir, 'file1.ts'), 'content');
    await fs.writeFile(path.join(testDir, 'file2.ts'), 'content');
    await fs.writeFile(path.join(testDir, 'file3.ts'), 'content');
    await fs.writeFile(path.join(testDir, 'file4.ts'), 'content');

    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['file1.ts', 'file2.ts', 'file3.ts', 'file4.ts', 'file5.ts'],
      syntaxValidation: true,
      buildVerification: false,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(true);
    expect(result.score).toBe(80);
  });

  test('includes details with file check results', async () => {
    await fs.writeFile(path.join(testDir, 'exists.ts'), 'content');

    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['exists.ts', 'missing.ts'],
      syntaxValidation: true,
      buildVerification: false,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.details?.results).toHaveLength(2);
    expect(result.details?.missingFiles).toEqual(['missing.ts']);
  });
});
