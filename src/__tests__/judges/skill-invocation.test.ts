import { describe, expect, test } from 'bun:test';
import { SkillInvocationJudge } from '../../judges/builtin/skill-invocation.js';
import type { JudgeContext, ExecutionResult } from '../../judges/judge-interface.js';
import type { ToolEvalCase, BasicEvalCase } from '../../config/schemas.js';

describe('SkillInvocationJudge', () => {
  const judge = new SkillInvocationJudge();

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
    expect(judge.id).toBe('skill-invocation');
    expect(judge.name).toBe('Skill Invocation Judge');
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

  test('returns not applicable when no expected skills', async () => {
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
    expect(result.reasoning).toBe('No expected skills specified');
  });

  test('passes when skill is called expected number of times', async () => {
    const toolEval: ToolEvalCase = {
      id: 't1',
      name: 'Tool',
      description: 'd',
      category: 'tool',
      prompt: 'p',
      expectedToolCalls: [],
      expectedSkills: [{ skillName: 'commit', minCalls: 1 }],
      judges: [],
      enabled: true,
    };

    const toolCalls = [
      { toolName: 'Skill', input: { skill: 'commit', args: '-m "test"' } },
    ];

    const result = await judge.evaluate(createContext(toolEval, toolCalls));

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  test('fails when skill is not called', async () => {
    const toolEval: ToolEvalCase = {
      id: 't1',
      name: 'Tool',
      description: 'd',
      category: 'tool',
      prompt: 'p',
      expectedToolCalls: [],
      expectedSkills: [{ skillName: 'commit', minCalls: 1 }],
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(toolEval, []));

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reasoning).toContain('commit');
  });

  test('fails when skill is not called enough times', async () => {
    const toolEval: ToolEvalCase = {
      id: 't1',
      name: 'Tool',
      description: 'd',
      category: 'tool',
      prompt: 'p',
      expectedToolCalls: [],
      expectedSkills: [{ skillName: 'commit', minCalls: 3 }],
      judges: [],
      enabled: true,
    };

    const toolCalls = [
      { toolName: 'Skill', input: { skill: 'commit' } },
    ];

    const result = await judge.evaluate(createContext(toolEval, toolCalls));

    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('found 1x');
  });

  test('handles multiple expected skills', async () => {
    const toolEval: ToolEvalCase = {
      id: 't1',
      name: 'Tool',
      description: 'd',
      category: 'tool',
      prompt: 'p',
      expectedToolCalls: [],
      expectedSkills: [
        { skillName: 'commit', minCalls: 1 },
        { skillName: 'review-pr', minCalls: 1 },
      ],
      judges: [],
      enabled: true,
    };

    const toolCalls = [
      { toolName: 'Skill', input: { skill: 'commit' } },
      { toolName: 'Skill', input: { skill: 'review-pr' } },
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
      expectedToolCalls: [],
      expectedSkills: [
        { skillName: 'commit', minCalls: 1 },
        { skillName: 'review-pr', minCalls: 1 },
      ],
      judges: [],
      enabled: true,
    };

    const toolCalls = [
      { toolName: 'Skill', input: { skill: 'commit' } },
    ];

    const result = await judge.evaluate(createContext(toolEval, toolCalls));

    expect(result.passed).toBe(false);
    expect(result.score).toBe(50);
  });

  test('strips leading slash from skill names', async () => {
    const toolEval: ToolEvalCase = {
      id: 't1',
      name: 'Tool',
      description: 'd',
      category: 'tool',
      prompt: 'p',
      expectedToolCalls: [],
      expectedSkills: [{ skillName: 'commit', minCalls: 1 }],
      judges: [],
      enabled: true,
    };

    const toolCalls = [
      { toolName: 'Skill', input: { skill: '/commit' } },
    ];

    const result = await judge.evaluate(createContext(toolEval, toolCalls));

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  test('handles command field in input', async () => {
    const toolEval: ToolEvalCase = {
      id: 't1',
      name: 'Tool',
      description: 'd',
      category: 'tool',
      prompt: 'p',
      expectedToolCalls: [],
      expectedSkills: [{ skillName: 'commit', minCalls: 1 }],
      judges: [],
      enabled: true,
    };

    const toolCalls = [
      { toolName: 'Skill', input: { command: 'commit' } },
    ];

    const result = await judge.evaluate(createContext(toolEval, toolCalls));

    expect(result.passed).toBe(true);
  });

  test('includes details with skill call stats', async () => {
    const toolEval: ToolEvalCase = {
      id: 't1',
      name: 'Tool',
      description: 'd',
      category: 'tool',
      prompt: 'p',
      expectedToolCalls: [],
      expectedSkills: [{ skillName: 'commit', minCalls: 1 }],
      judges: [],
      enabled: true,
    };

    const toolCalls = [
      { toolName: 'Skill', input: { skill: 'commit' } },
      { toolName: 'Skill', input: { skill: 'commit' } },
    ];

    const result = await judge.evaluate(createContext(toolEval, toolCalls));

    expect(result.details?.results).toHaveLength(1);
    expect(result.details?.results[0].callCount).toBe(2);
    expect(result.details?.totalSkillCalls).toBe(2);
  });

  test('defaults minCalls to 1 when not specified', async () => {
    const toolEval: ToolEvalCase = {
      id: 't1',
      name: 'Tool',
      description: 'd',
      category: 'tool',
      prompt: 'p',
      expectedToolCalls: [],
      expectedSkills: [{ skillName: 'commit' }],
      judges: [],
      enabled: true,
    };

    const toolCalls = [
      { toolName: 'Skill', input: { skill: 'commit' } },
    ];

    const result = await judge.evaluate(createContext(toolEval, toolCalls));

    expect(result.passed).toBe(true);
  });
});
