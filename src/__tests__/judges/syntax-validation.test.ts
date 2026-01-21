import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SyntaxValidationJudge } from '../../judges/builtin/syntax-validation.js';
import type { JudgeContext } from '../../judges/judge-interface.js';
import type { CodeGenEvalCase, BasicEvalCase } from '../../config/schemas.js';

describe('SyntaxValidationJudge', () => {
  const judge = new SyntaxValidationJudge();
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'syntax-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  const createContext = (
    evalCase: CodeGenEvalCase | BasicEvalCase,
    workingDirectory?: string
  ): JudgeContext => ({
    evalCase,
    executionResult: {
      success: true,
      output: '',
      toolCalls: [],
      duration: 0,
      workingDirectory: workingDirectory || tempDir,
    },
    workingDirectory: workingDirectory || tempDir,
  });

  test('has correct metadata', () => {
    expect(judge.id).toBe('syntax-validation');
    expect(judge.name).toBe('Syntax Validation Judge');
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

  test('returns not applicable when syntaxValidation is false', async () => {
    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['test.ts'],
      syntaxValidation: false,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(true);
    expect(result.reasoning).toBe('Syntax validation disabled for this eval');
  });

  test('returns not applicable when no code files', async () => {
    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['readme.md', 'config.json'],
      syntaxValidation: true,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(true);
    expect(result.reasoning).toBe('No code files to validate');
  });

  test('passes for valid TypeScript file', async () => {
    const validTs = `
      interface User {
        id: string;
        name: string;
      }

      function greet(user: User): string {
        return \`Hello, \${user.name}!\`;
      }
    `;
    await fs.writeFile(path.join(tempDir, 'valid.ts'), validTs);

    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['valid.ts'],
      syntaxValidation: true,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  test('passes for valid TSX file', async () => {
    const validTsx = `
      import React from 'react';

      interface Props {
        name: string;
      }

      export const Greeting: React.FC<Props> = ({ name }) => {
        return <div>Hello, {name}!</div>;
      };
    `;
    await fs.writeFile(path.join(tempDir, 'valid.tsx'), validTsx);

    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['valid.tsx'],
      syntaxValidation: true,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  test('passes for valid JavaScript file', async () => {
    const validJs = `
      function add(a, b) {
        return a + b;
      }

      const result = add(1, 2);
      console.log(result);
    `;
    await fs.writeFile(path.join(tempDir, 'valid.js'), validJs);

    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['valid.js'],
      syntaxValidation: true,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  test('fails for invalid TypeScript file', async () => {
    const invalidTs = `
      interface User {
        id: string
        name string  // Missing colon
      }
    `;
    await fs.writeFile(path.join(tempDir, 'invalid.ts'), invalidTs);

    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['invalid.ts'],
      syntaxValidation: true,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reasoning).toContain('invalid.ts');
  });

  test('handles missing file', async () => {
    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['nonexistent.ts'],
      syntaxValidation: true,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reasoning).toContain('nonexistent.ts');
  });

  test('handles multiple files with mixed results', async () => {
    const validTs = `export const x = 1;`;
    const invalidTs = `const y = {`;
    await fs.writeFile(path.join(tempDir, 'valid.ts'), validTs);
    await fs.writeFile(path.join(tempDir, 'invalid.ts'), invalidTs);

    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['valid.ts', 'invalid.ts'],
      syntaxValidation: true,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(false);
    expect(result.score).toBe(50);
    expect(result.reasoning).toContain('1/2');
  });

  test('passes at 90% threshold', async () => {
    const validTs = `export const x = 1;`;
    await fs.writeFile(path.join(tempDir, 'a.ts'), validTs);
    await fs.writeFile(path.join(tempDir, 'b.ts'), validTs);
    await fs.writeFile(path.join(tempDir, 'c.ts'), validTs);
    await fs.writeFile(path.join(tempDir, 'd.ts'), validTs);
    await fs.writeFile(path.join(tempDir, 'e.ts'), validTs);
    await fs.writeFile(path.join(tempDir, 'f.ts'), validTs);
    await fs.writeFile(path.join(tempDir, 'g.ts'), validTs);
    await fs.writeFile(path.join(tempDir, 'h.ts'), validTs);
    await fs.writeFile(path.join(tempDir, 'i.ts'), validTs);
    await fs.writeFile(path.join(tempDir, 'j.ts'), `const y = {`);

    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts', 'h.ts', 'i.ts', 'j.ts'],
      syntaxValidation: true,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.passed).toBe(true);
    expect(result.score).toBe(90);
  });

  test('includes details with file results', async () => {
    const validTs = `export const x = 1;`;
    await fs.writeFile(path.join(tempDir, 'test.ts'), validTs);

    const codeGenEval: CodeGenEvalCase = {
      id: 'c1',
      name: 'CodeGen',
      description: 'd',
      category: 'code-gen',
      prompt: 'p',
      targetFiles: ['test.ts'],
      syntaxValidation: true,
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(codeGenEval));

    expect(result.details?.results).toHaveLength(1);
    expect(result.details?.results[0].file).toBe('test.ts');
    expect(result.details?.results[0].valid).toBe(true);
  });
});
