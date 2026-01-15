import { describe, expect, test } from 'bun:test';
import { ToolInvocationJudge } from '../../judges/builtin/tool-invocation.js';
import type { JudgeContext, ExecutionResult } from '../../judges/judge-interface.js';
import type { ToolEvalCase, BasicEvalCase } from '../../config/schemas.js';

describe('ToolInvocationJudge', () => {
  const judge = new ToolInvocationJudge();

  const createContext = (
    evalCase: ToolEvalCase | BasicEvalCase,
    toolCalls: ExecutionResult['toolCalls'] = []
  ): JudgeContext => ({
    evalCase,
    executionResult: {
      success: true,
      output: '',
      toolCalls,
      duration: 0,
    },
    workingDirectory: '/test',
  });

  test('has correct metadata', () => {
    expect(judge.id).toBe('tool-invocation');
    expect(judge.name).toBe('Tool Invocation Judge');
    expect(judge.type).toBe('code');
  });

  test('returns not applicable for non-tool evals', async () => {
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
    expect(result.reasoning).toBe('Only applicable for tool evals');
  });

  test('returns not applicable when no expected tool calls', async () => {
    const toolEval: ToolEvalCase = {
      id: 't1',
      name: 'Tool',
      description: 'd',
      category: 'tool',
      prompt: 'p',
      expectedToolCalls: [],
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(toolEval));

    expect(result.passed).toBe(true);
    expect(result.reasoning).toBe('No expected tool calls specified');
  });

  test('passes when tool is called expected number of times', async () => {
    const toolEval: ToolEvalCase = {
      id: 't1',
      name: 'Tool',
      description: 'd',
      category: 'tool',
      prompt: 'p',
      expectedToolCalls: [{ toolName: 'Read', minCalls: 1 }],
      judges: [],
      enabled: true,
    };

    const toolCalls = [
      { toolName: 'Read', input: { path: '/file.ts' } },
    ];

    const result = await judge.evaluate(createContext(toolEval, toolCalls));

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  test('fails when tool is not called enough times', async () => {
    const toolEval: ToolEvalCase = {
      id: 't1',
      name: 'Tool',
      description: 'd',
      category: 'tool',
      prompt: 'p',
      expectedToolCalls: [{ toolName: 'Read', minCalls: 3 }],
      judges: [],
      enabled: true,
    };

    const toolCalls = [
      { toolName: 'Read', input: { path: '/file.ts' } },
    ];

    const result = await judge.evaluate(createContext(toolEval, toolCalls));

    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('Expected at least 3 call(s), got 1');
  });

  test('fails when tool is called too many times', async () => {
    const toolEval: ToolEvalCase = {
      id: 't1',
      name: 'Tool',
      description: 'd',
      category: 'tool',
      prompt: 'p',
      expectedToolCalls: [{ toolName: 'Write', maxCalls: 1 }],
      judges: [],
      enabled: true,
    };

    const toolCalls = [
      { toolName: 'Write', input: { path: '/a.ts' } },
      { toolName: 'Write', input: { path: '/b.ts' } },
      { toolName: 'Write', input: { path: '/c.ts' } },
    ];

    const result = await judge.evaluate(createContext(toolEval, toolCalls));

    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('Expected at most 1 call(s), got 3');
  });

  test('handles multiple expected tools', async () => {
    const toolEval: ToolEvalCase = {
      id: 't1',
      name: 'Tool',
      description: 'd',
      category: 'tool',
      prompt: 'p',
      expectedToolCalls: [
        { toolName: 'Read', minCalls: 1 },
        { toolName: 'Write', minCalls: 1 },
      ],
      judges: [],
      enabled: true,
    };

    const toolCalls = [
      { toolName: 'Read', input: {} },
      { toolName: 'Write', input: {} },
    ];

    const result = await judge.evaluate(createContext(toolEval, toolCalls));

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  test('partial pass gives proportional score', async () => {
    const toolEval: ToolEvalCase = {
      id: 't1',
      name: 'Tool',
      description: 'd',
      category: 'tool',
      prompt: 'p',
      expectedToolCalls: [
        { toolName: 'Read', minCalls: 1 },
        { toolName: 'Write', minCalls: 1 },
      ],
      judges: [],
      enabled: true,
    };

    const toolCalls = [
      { toolName: 'Read', input: {} },
    ];

    const result = await judge.evaluate(createContext(toolEval, toolCalls));

    expect(result.passed).toBe(false);
    expect(result.score).toBe(50);
  });

  test('includes details with tool call stats', async () => {
    const toolEval: ToolEvalCase = {
      id: 't1',
      name: 'Tool',
      description: 'd',
      category: 'tool',
      prompt: 'p',
      expectedToolCalls: [{ toolName: 'Read', minCalls: 1 }],
      judges: [],
      enabled: true,
    };

    const toolCalls = [
      { toolName: 'Read', input: {} },
      { toolName: 'Read', input: {} },
      { toolName: 'Write', input: {} },
    ];

    const result = await judge.evaluate(createContext(toolEval, toolCalls));

    expect(result.details?.stats).toHaveLength(1);
    expect(result.details?.toolCallCounts).toEqual({ Read: 2, Write: 1 });
    expect(result.details?.actualToolCalls).toEqual(['Read', 'Read', 'Write']);
  });

  test('defaults minCalls to 1 when not specified', async () => {
    const toolEval: ToolEvalCase = {
      id: 't1',
      name: 'Tool',
      description: 'd',
      category: 'tool',
      prompt: 'p',
      expectedToolCalls: [{ toolName: 'Read' }],
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(toolEval, []));

    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('Expected at least 1 call(s), got 0');
  });
});
