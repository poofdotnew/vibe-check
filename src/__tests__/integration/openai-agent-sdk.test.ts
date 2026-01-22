import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { VibeCheckTracingProcessor } from '../../openai/tracing-processor.js';
import { TestHarness } from '../../harness/test-harness.js';
import { AgentRoutingJudge } from '../../judges/builtin/agent-routing.js';
import type { ResolvedConfig, ToolCall } from '../../config/types.js';
import type { EvalCase } from '../../config/schemas.js';
import type { Trace, Span, SpanData } from '@openai/agents';

describe('OpenAI Agent SDK Integration', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibe-check-openai-test-'));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('VibeCheckTracingProcessor', () => {
    test('writes trace entries to JSONL file', async () => {
      const workspacePath = path.join(tempDir, 'processor-test');
      await fs.mkdir(workspacePath, { recursive: true });

      const processor = new VibeCheckTracingProcessor(workspacePath);

      const mockTrace = {
        traceId: 'test-trace-123',
        name: 'test-trace',
        groupId: null,
        type: 'trace' as const,
        start: async () => {},
        end: async () => {},
        clone: () => mockTrace,
        toJSON: () => ({}),
      } as unknown as Trace;

      await processor.onTraceStart(mockTrace);
      await processor.onTraceEnd(mockTrace);
      await processor.forceFlush();

      const tracesPath = path.join(workspacePath, '.openai-agents', 'traces.jsonl');
      const content = await fs.readFile(tracesPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim());

      expect(lines.length).toBe(2);

      const startEntry = JSON.parse(lines[0]);
      expect(startEntry.type).toBe('trace_start');
      expect(startEntry.trace_id).toBe('test-trace-123');

      const endEntry = JSON.parse(lines[1]);
      expect(endEntry.type).toBe('trace_end');
      expect(endEntry.trace_id).toBe('test-trace-123');
    });

    test('writes function span entries', async () => {
      const workspacePath = path.join(tempDir, 'function-span-test');
      await fs.mkdir(workspacePath, { recursive: true });

      const processor = new VibeCheckTracingProcessor(workspacePath);

      const mockSpan = {
        spanId: 'span-123',
        traceId: 'trace-456',
        parentId: null,
        type: 'trace.span' as const,
        spanData: {
          type: 'function' as const,
          name: 'read_file',
          input: JSON.stringify({ path: '/test/file.txt' }),
          output: 'file contents',
        },
        previousSpan: undefined,
        error: null,
        startedAt: null,
        endedAt: null,
        tracingApiKey: undefined,
        start: () => {},
        end: () => {},
        setError: () => {},
        clone: () => mockSpan,
        toJSON: () => ({}),
      } as unknown as Span<SpanData>;

      await processor.onSpanEnd(mockSpan);
      await processor.forceFlush();

      const tracesPath = path.join(workspacePath, '.openai-agents', 'traces.jsonl');
      const content = await fs.readFile(tracesPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim());

      expect(lines.length).toBe(1);

      const entry = JSON.parse(lines[0]);
      expect(entry.type).toBe('span');
      expect(entry.span_type).toBe('function');
      expect(entry.tool_name).toBe('read_file');
      expect(entry.tool_input).toBe(JSON.stringify({ path: '/test/file.txt' }));
      expect(entry.tool_output).toBe('file contents');
    });

    test('writes handoff span entries', async () => {
      const workspacePath = path.join(tempDir, 'handoff-span-test');
      await fs.mkdir(workspacePath, { recursive: true });

      const processor = new VibeCheckTracingProcessor(workspacePath);

      const mockHandoffSpan = {
        spanId: 'span-789',
        traceId: 'trace-101',
        parentId: null,
        type: 'trace.span' as const,
        spanData: {
          type: 'handoff' as const,
          from_agent: 'triage',
          to_agent: 'coding',
        },
        previousSpan: undefined,
        error: null,
        startedAt: null,
        endedAt: null,
        tracingApiKey: undefined,
        start: () => {},
        end: () => {},
        setError: () => {},
        clone: () => mockHandoffSpan,
        toJSON: () => ({}),
      } as unknown as Span<SpanData>;

      await processor.onSpanEnd(mockHandoffSpan);
      await processor.forceFlush();

      const tracesPath = path.join(workspacePath, '.openai-agents', 'traces.jsonl');
      const content = await fs.readFile(tracesPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim());

      expect(lines.length).toBe(1);

      const entry = JSON.parse(lines[0]);
      expect(entry.type).toBe('span');
      expect(entry.span_type).toBe('handoff');
      expect(entry.from_agent).toBe('triage');
      expect(entry.to_agent).toBe('coding');
    });
  });

  describe('TestHarness trace extraction', () => {
    test('extracts tool calls from OpenAI traces', async () => {
      const workspacePath = path.join(tempDir, 'harness-test');
      await fs.mkdir(path.join(workspacePath, '.openai-agents'), { recursive: true });

      const traces = [
        {
          type: 'span',
          span_type: 'function',
          span_id: 's1',
          trace_id: 't1',
          timestamp: Date.now(),
          tool_name: 'read_file',
          tool_input: '{"path": "test.txt"}',
          tool_output: 'hello world',
        },
        {
          type: 'span',
          span_type: 'handoff',
          span_id: 's2',
          trace_id: 't1',
          timestamp: Date.now(),
          from_agent: 'triage',
          to_agent: 'coding',
        },
      ];

      const tracesPath = path.join(workspacePath, '.openai-agents', 'traces.jsonl');
      await fs.writeFile(tracesPath, traces.map((t) => JSON.stringify(t)).join('\n'));

      const mockConfig: ResolvedConfig = {
        agent: async () => ({ output: 'test', success: true }),
        agentType: 'openai-agents',
        testMatch: ['**/*.eval.json'],
        testDir: './__evals__',
        parallel: false,
        maxConcurrency: 1,
        timeout: 30000,
        maxRetries: 0,
        retryDelayMs: 1000,
        retryBackoffMultiplier: 2,
        trials: 1,
        trialPassThreshold: 0.5,
        judges: [],
        llmJudgeModel: 'claude-sonnet-4-20250514',
        rubricsDir: './__evals__/rubrics',
        outputDir: './__evals__/results',
        verbose: false,
        preserveWorkspaces: true,
        learning: {
          enabled: false,
          ruleOutputDir: './prompts',
          minFailuresForPattern: 2,
          similarityThreshold: 0.7,
          maxRulesPerIteration: 5,
          minRuleConfidence: 0.6,
          autoApprove: false,
          autoApproveThreshold: 0.8,
        },
        createWorkspace: async () => ({ id: 'test', path: workspacePath }),
      };

      const harness = new TestHarness({ config: mockConfig });

      const evalCase = {
        id: 'test-eval',
        name: 'Test Eval',
        description: 'Test',
        category: 'basic',
        prompt: 'Hello',
        enabled: true,
        judges: [],
      } as EvalCase;

      const result = await harness.execute(evalCase);

      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls.length).toBe(2);

      const readFileCall = result.toolCalls.find((c) => c.toolName === 'read_file');
      expect(readFileCall).toBeDefined();
      expect(readFileCall?.input).toEqual({ path: 'test.txt' });

      const handoffCall = result.toolCalls.find((c) => c.toolName === 'Handoff');
      expect(handoffCall).toBeDefined();
      expect((handoffCall?.input as Record<string, unknown>)?.agent).toBe('coding');
    });
  });

  describe('AgentRoutingJudge with Handoff', () => {
    test('recognizes Handoff tool calls', async () => {
      const workspacePath = path.join(tempDir, 'routing-judge-test');
      await fs.mkdir(workspacePath, { recursive: true });

      const judge = new AgentRoutingJudge();

      const toolCalls: ToolCall[] = [
        {
          toolName: 'Handoff',
          input: { agent: 'coding', fromAgent: 'triage' },
        },
      ];

      const evalCase = {
        id: 'routing-test',
        name: 'Routing Test',
        description: 'Test routing',
        category: 'routing',
        prompt: 'Write code',
        expectedAgent: 'coding',
      };

      const result = await judge.evaluate({
        executionResult: {
          output: 'Handing off to coding agent',
          success: true,
          duration: 1000,
          toolCalls,
        },
        evalCase: evalCase as EvalCase,
        workingDirectory: workspacePath,
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
    });

    test('extracts agents from OpenAI traces', async () => {
      const workspacePath = path.join(tempDir, 'routing-traces-test');
      await fs.mkdir(path.join(workspacePath, '.openai-agents'), { recursive: true });

      const traces = [
        {
          type: 'span',
          span_type: 'handoff',
          span_id: 's1',
          trace_id: 't1',
          timestamp: Date.now(),
          from_agent: 'triage',
          to_agent: 'coding',
        },
      ];

      const tracesPath = path.join(workspacePath, '.openai-agents', 'traces.jsonl');
      await fs.writeFile(tracesPath, traces.map((t) => JSON.stringify(t)).join('\n'));

      const judge = new AgentRoutingJudge();

      const evalCase = {
        id: 'routing-test-2',
        name: 'Routing Test 2',
        description: 'Test routing from traces',
        category: 'routing',
        prompt: 'Write code',
        expectedAgent: 'coding',
      };

      const result = await judge.evaluate({
        executionResult: {
          output: 'Done',
          success: true,
          duration: 1000,
          toolCalls: [],
        },
        evalCase: evalCase as EvalCase,
        workingDirectory: workspacePath,
      });

      expect(result.passed).toBe(true);
      expect((result.details as Record<string, unknown>)?.agentsInvoked).toContain('coding');
    });
  });
});
