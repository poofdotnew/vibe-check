import { describe, expect, test } from 'bun:test';
import {
  parseEvalCase,
  isToolEval,
  isCodeGenEval,
  isRoutingEval,
  isMultiTurnEval,
  isBasicEval,
  type EvalCase,
} from '../config/schemas.js';

describe('parseEvalCase', () => {
  test('parses basic eval case', () => {
    const data = {
      id: 'test-basic',
      name: 'Test Basic',
      description: 'A basic test',
      category: 'basic',
      prompt: 'Say hello',
      judges: [],
    };

    const result = parseEvalCase(data);
    expect(result.id).toBe('test-basic');
    expect(result.category).toBe('basic');
  });

  test('parses tool eval case', () => {
    const data = {
      id: 'test-tool',
      name: 'Test Tool',
      description: 'A tool test',
      category: 'tool',
      prompt: 'Use the read tool',
      expectedToolCalls: [{ toolName: 'Read', minCalls: 1 }],
      judges: ['tool-invocation'],
    };

    const result = parseEvalCase(data);
    expect(result.category).toBe('tool');
    expect(isToolEval(result)).toBe(true);
  });

  test('parses code-gen eval case', () => {
    const data = {
      id: 'test-codegen',
      name: 'Test CodeGen',
      description: 'A code generation test',
      category: 'code-gen',
      prompt: 'Create a hello.ts file',
      targetFiles: ['hello.ts'],
      judges: ['file-existence'],
    };

    const result = parseEvalCase(data);
    expect(result.category).toBe('code-gen');
    expect(isCodeGenEval(result)).toBe(true);
  });

  test('parses routing eval case', () => {
    const data = {
      id: 'test-routing',
      name: 'Test Routing',
      description: 'A routing test',
      category: 'routing',
      prompt: 'Route to coding agent',
      expectedAgent: 'coding',
      judges: [],
    };

    const result = parseEvalCase(data);
    expect(result.category).toBe('routing');
    expect(isRoutingEval(result)).toBe(true);
  });

  test('parses multi-turn eval case', () => {
    const data = {
      id: 'test-multi-turn',
      name: 'Test Multi Turn',
      description: 'A multi-turn test',
      category: 'multi-turn',
      turns: [
        { prompt: 'Turn 1' },
        { prompt: 'Turn 2' },
      ],
    };

    const result = parseEvalCase(data);
    expect(result.category).toBe('multi-turn');
    expect(isMultiTurnEval(result)).toBe(true);
  });

  test('throws on invalid category', () => {
    const data = {
      id: 'test-invalid',
      name: 'Test Invalid',
      description: 'Invalid test',
      category: 'invalid',
      prompt: 'test',
      judges: [],
    };

    expect(() => parseEvalCase(data)).toThrow();
  });

  test('defaults enabled to true', () => {
    const data = {
      id: 'test-enabled',
      name: 'Test Enabled',
      description: 'Test enabled default',
      category: 'basic',
      prompt: 'test',
      judges: [],
    };

    const result = parseEvalCase(data);
    expect(result.enabled).toBe(true);
  });
});

describe('type guards', () => {
  const toolEval: EvalCase = {
    id: 't1',
    name: 'Tool',
    description: 'd',
    category: 'tool',
    prompt: 'p',
    expectedToolCalls: [],
    judges: [],
    enabled: true,
  };

  const codeGenEval: EvalCase = {
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

  const routingEval: EvalCase = {
    id: 'r1',
    name: 'Routing',
    description: 'd',
    category: 'routing',
    prompt: 'p',
    expectedAgent: 'agent',
    judges: [],
    enabled: true,
  };

  const multiTurnEval: EvalCase = {
    id: 'm1',
    name: 'MultiTurn',
    description: 'd',
    category: 'multi-turn',
    turns: [],
    sessionPersistence: true,
    enabled: true,
  };

  const basicEval: EvalCase = {
    id: 'b1',
    name: 'Basic',
    description: 'd',
    category: 'basic',
    prompt: 'p',
    judges: [],
    enabled: true,
  };

  test('isToolEval correctly identifies tool evals', () => {
    expect(isToolEval(toolEval)).toBe(true);
    expect(isToolEval(codeGenEval)).toBe(false);
    expect(isToolEval(basicEval)).toBe(false);
  });

  test('isCodeGenEval correctly identifies code-gen evals', () => {
    expect(isCodeGenEval(codeGenEval)).toBe(true);
    expect(isCodeGenEval(toolEval)).toBe(false);
    expect(isCodeGenEval(basicEval)).toBe(false);
  });

  test('isRoutingEval correctly identifies routing evals', () => {
    expect(isRoutingEval(routingEval)).toBe(true);
    expect(isRoutingEval(toolEval)).toBe(false);
    expect(isRoutingEval(basicEval)).toBe(false);
  });

  test('isMultiTurnEval correctly identifies multi-turn evals', () => {
    expect(isMultiTurnEval(multiTurnEval)).toBe(true);
    expect(isMultiTurnEval(toolEval)).toBe(false);
    expect(isMultiTurnEval(basicEval)).toBe(false);
  });

  test('isBasicEval correctly identifies basic evals', () => {
    expect(isBasicEval(basicEval)).toBe(true);
    expect(isBasicEval(toolEval)).toBe(false);
    expect(isBasicEval(codeGenEval)).toBe(false);
  });
});
