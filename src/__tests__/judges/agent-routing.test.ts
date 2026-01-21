import { describe, expect, test } from 'bun:test';
import { AgentRoutingJudge } from '../../judges/builtin/agent-routing.js';
import type { JudgeContext, ExecutionResult } from '../../judges/judge-interface.js';
import type { RoutingEvalCase, BasicEvalCase } from '../../config/schemas.js';

describe('AgentRoutingJudge', () => {
  const judge = new AgentRoutingJudge();

  const createContext = (
    evalCase: RoutingEvalCase | BasicEvalCase,
    toolCalls: ExecutionResult['toolCalls'] = [],
    output: string = ''
  ): JudgeContext => ({
    evalCase,
    executionResult: {
      success: true,
      output,
      toolCalls,
      duration: 0,
    },
    workingDirectory: '/test',
  });

  test('has correct metadata', () => {
    expect(judge.id).toBe('agent-routing');
    expect(judge.name).toBe('Agent Routing Judge');
    expect(judge.type).toBe('code');
  });

  test('returns not applicable for non-routing evals', async () => {
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
    expect(result.reasoning).toBe('Only applicable for routing evals');
  });

  test('passes when correct agent is invoked', async () => {
    const routingEval: RoutingEvalCase = {
      id: 'r1',
      name: 'Routing',
      description: 'd',
      category: 'routing',
      prompt: 'p',
      expectedAgent: 'ui-generator',
      judges: [],
      enabled: true,
    };

    const toolCalls = [
      { toolName: 'Task', input: { subagent_type: 'ui-generator', prompt: 'test' } },
    ];

    const result = await judge.evaluate(createContext(routingEval, toolCalls));

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.reasoning).toContain('Correctly routed to ui-generator');
  });

  test('fails when wrong agent is invoked', async () => {
    const routingEval: RoutingEvalCase = {
      id: 'r1',
      name: 'Routing',
      description: 'd',
      category: 'routing',
      prompt: 'p',
      expectedAgent: 'ui-generator',
      judges: [],
      enabled: true,
    };

    const toolCalls = [
      { toolName: 'Task', input: { subagent_type: 'backend-generator', prompt: 'test' } },
    ];

    const result = await judge.evaluate(createContext(routingEval, toolCalls));

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reasoning).toContain('Expected ui-generator but got: backend-generator');
  });

  test('fails with partial score when correct and forbidden agents are invoked', async () => {
    const routingEval: RoutingEvalCase = {
      id: 'r1',
      name: 'Routing',
      description: 'd',
      category: 'routing',
      prompt: 'p',
      expectedAgent: 'ui-generator',
      shouldNotRoute: ['debugger'],
      judges: [],
      enabled: true,
    };

    const toolCalls = [
      { toolName: 'Task', input: { subagent_type: 'ui-generator', prompt: 'test' } },
      { toolName: 'Task', input: { subagent_type: 'debugger', prompt: 'test' } },
    ];

    const result = await judge.evaluate(createContext(routingEval, toolCalls));

    expect(result.passed).toBe(false);
    expect(result.score).toBe(50);
    expect(result.reasoning).toContain('also incorrectly routed to');
  });

  test('passes with delegation intent when no Task tool called', async () => {
    const routingEval: RoutingEvalCase = {
      id: 'r1',
      name: 'Routing',
      description: 'd',
      category: 'routing',
      prompt: 'p',
      expectedAgent: 'ui-generator',
      judges: [],
      enabled: true,
    };

    const output = 'I will delegate this task to the ui-generator agent';

    const result = await judge.evaluate(createContext(routingEval, [], output));

    expect(result.passed).toBe(true);
    expect(result.score).toBe(80);
    expect(result.reasoning).toContain('delegation intent');
  });

  test('fails when no agent invoked and no delegation intent', async () => {
    const routingEval: RoutingEvalCase = {
      id: 'r1',
      name: 'Routing',
      description: 'd',
      category: 'routing',
      prompt: 'p',
      expectedAgent: 'ui-generator',
      judges: [],
      enabled: true,
    };

    const result = await judge.evaluate(createContext(routingEval, [], ''));

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  test('includes details with agents invoked', async () => {
    const routingEval: RoutingEvalCase = {
      id: 'r1',
      name: 'Routing',
      description: 'd',
      category: 'routing',
      prompt: 'p',
      expectedAgent: 'ui-generator',
      judges: [],
      enabled: true,
    };

    const toolCalls = [
      { toolName: 'Task', input: { subagent_type: 'ui-generator', prompt: 'test' } },
    ];

    const result = await judge.evaluate(createContext(routingEval, toolCalls));

    expect(result.details?.agentsInvoked).toContain('ui-generator');
    expect(result.details?.expectedAgent).toBe('ui-generator');
  });

  test('accepts custom workTypeKeywords', async () => {
    const customJudge = new AgentRoutingJudge({
      workTypeKeywords: {
        'ui-generator': ['react', 'component', 'jsx'],
      },
    });

    const routingEval: RoutingEvalCase = {
      id: 'r1',
      name: 'Routing',
      description: 'd',
      category: 'routing',
      prompt: 'p',
      expectedAgent: 'ui-generator',
      judges: [],
      enabled: true,
    };

    const output = 'I created a react component with jsx styling';

    const result = await customJudge.evaluate(createContext(routingEval, [], output));

    expect(result.passed).toBe(true);
    expect(result.score).toBe(70);
    expect(result.reasoning).toContain('performed');
  });

  test('handles agent field in input', async () => {
    const routingEval: RoutingEvalCase = {
      id: 'r1',
      name: 'Routing',
      description: 'd',
      category: 'routing',
      prompt: 'p',
      expectedAgent: 'backend-generator',
      judges: [],
      enabled: true,
    };

    const toolCalls = [
      { toolName: 'Task', input: { agent: 'backend-generator', prompt: 'test' } },
    ];

    const result = await judge.evaluate(createContext(routingEval, toolCalls));

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });
});
