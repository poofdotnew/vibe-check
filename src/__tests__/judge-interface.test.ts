import { describe, expect, test } from 'bun:test';
import {
  BaseJudge,
  agentResultToExecutionResult,
  type JudgeContext,
  type JudgeResult,
  type JudgeType,
} from '../judges/judge-interface.js';
import type { AgentResult } from '../config/types.js';

class TestJudge extends BaseJudge {
  id = 'test-judge';
  name = 'Test Judge';
  type: JudgeType = 'code';

  async evaluate(_context: JudgeContext): Promise<JudgeResult> {
    return this.createResult({
      passed: true,
      score: 100,
      reasoning: 'Test passed',
    });
  }

  testCreateResult(params: Parameters<typeof this.createResult>[0]) {
    return this.createResult(params);
  }

  testNotApplicable(reason?: string) {
    return this.notApplicable(reason);
  }
}

describe('BaseJudge', () => {
  const judge = new TestJudge();

  test('createResult returns properly formatted result', () => {
    const result = judge.testCreateResult({
      passed: true,
      score: 85,
      reasoning: 'Most checks passed',
      confidence: 0.9,
      details: { foo: 'bar' },
    });

    expect(result.judgeId).toBe('test-judge');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(85);
    expect(result.reasoning).toBe('Most checks passed');
    expect(result.confidence).toBe(0.9);
    expect(result.details).toEqual({ foo: 'bar' });
  });

  test('createResult defaults confidence to 1', () => {
    const result = judge.testCreateResult({
      passed: true,
      score: 100,
      reasoning: 'All good',
    });

    expect(result.confidence).toBe(1);
  });

  test('notApplicable returns passing result', () => {
    const result = judge.testNotApplicable('Not relevant');

    expect(result.judgeId).toBe('test-judge');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.reasoning).toBe('Not relevant');
  });

  test('notApplicable uses default reason', () => {
    const result = judge.testNotApplicable();

    expect(result.reasoning).toBe('Not applicable');
  });
});

describe('agentResultToExecutionResult', () => {
  test('converts basic agent result', () => {
    const agentResult: AgentResult = {
      output: 'Hello world',
      success: true,
    };

    const result = agentResultToExecutionResult(agentResult);

    expect(result.output).toBe('Hello world');
    expect(result.success).toBe(true);
    expect(result.toolCalls).toEqual([]);
    expect(result.duration).toBe(0);
  });

  test('converts agent result with tool calls', () => {
    const agentResult: AgentResult = {
      output: 'Done',
      success: true,
      toolCalls: [
        { toolName: 'Read', input: { path: '/file.ts' }, output: 'content' },
        { toolName: 'Write', input: { path: '/new.ts' }, isError: false },
      ],
    };

    const result = agentResultToExecutionResult(agentResult);

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0].toolName).toBe('Read');
    expect(result.toolCalls[0].input).toEqual({ path: '/file.ts' });
    expect(result.toolCalls[0].output).toBe('content');
    expect(result.toolCalls[1].toolName).toBe('Write');
    expect(result.toolCalls[1].isError).toBe(false);
  });

  test('converts agent result with error', () => {
    const error = new Error('Something went wrong');
    const agentResult: AgentResult = {
      output: '',
      success: false,
      error,
    };

    const result = agentResultToExecutionResult(agentResult);

    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
  });

  test('converts agent result with full metadata', () => {
    const agentResult: AgentResult = {
      output: 'Result',
      success: true,
      duration: 5000,
      numTurns: 3,
      sessionId: 'sess-123',
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalCostUsd: 0.01,
      },
    };

    const result = agentResultToExecutionResult(agentResult);

    expect(result.duration).toBe(5000);
    expect(result.numTurns).toBe(3);
    expect(result.sessionId).toBe('sess-123');
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalCostUsd: 0.01,
    });
  });
});
