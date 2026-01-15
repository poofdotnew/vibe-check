import { describe, expect, test, beforeAll, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import Anthropic from '@anthropic-ai/sdk';
import { EvalRunner } from '../../runner/eval-runner.js';
import { defaultConfig, type VibeCheckConfig, type ResolvedConfig } from '../../config/types.js';
import { resetJudgeRegistry } from '../../judges/judge-registry.js';
import type { AgentResult, ToolCall } from '../../config/types.js';

const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

function createResolvedConfig(config: VibeCheckConfig): ResolvedConfig {
  return {
    ...defaultConfig,
    ...config,
    learning: { ...defaultConfig.learning, ...config.learning },
  } as ResolvedConfig;
}

function createAnthropicAgent(client: Anthropic) {
  return async (prompt: string): Promise<AgentResult> => {
    const startTime = Date.now();

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const textContent = response.content.find(c => c.type === 'text');
      const output = textContent?.type === 'text' ? textContent.text : '';

      return {
        output,
        success: true,
        duration: Date.now() - startTime,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      return {
        output: '',
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - startTime,
      };
    }
  };
}

describe.skipIf(!hasApiKey)('Integration: Real Anthropic API', () => {
  let testDir: string;
  let evalsDir: string;
  let client: Anthropic;

  beforeAll(() => {
    client = new Anthropic();
  });

  beforeEach(async () => {
    resetJudgeRegistry();
    testDir = path.join(os.tmpdir(), `integ-real-api-${Date.now()}`);
    evalsDir = path.join(testDir, '__evals__');
    await fs.mkdir(evalsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('basic prompts', () => {
    test('runs simple prompt eval', async () => {
      await fs.writeFile(
        path.join(evalsDir, 'greeting.eval.json'),
        JSON.stringify({
          id: 'greeting-test',
          name: 'Greeting Test',
          description: 'Test simple greeting response',
          category: 'basic',
          prompt: 'Say "Hello" and nothing else',
          judges: [],
        })
      );

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: createAnthropicAgent(client),
        maxRetries: 0,
        parallel: false,
        timeout: 30000,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(1);
      expect(result.passed).toBe(1);
      expect(result.results[0].output.toLowerCase()).toContain('hello');
    }, 30000);

    test('runs multiple evals in sequence', async () => {
      const prompts = [
        { id: 'math', prompt: 'What is 2+2? Answer with just the number.', expected: '4' },
        { id: 'color', prompt: 'What color is the sky on a clear day? One word answer.', expected: 'blue' },
      ];

      for (const p of prompts) {
        await fs.writeFile(
          path.join(evalsDir, `${p.id}.eval.json`),
          JSON.stringify({
            id: `${p.id}-test`,
            name: `${p.id} Test`,
            description: 'd',
            category: 'basic',
            prompt: p.prompt,
            judges: [],
          })
        );
      }

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: createAnthropicAgent(client),
        maxRetries: 0,
        parallel: false,
        timeout: 60000,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(2);
      expect(result.passed).toBe(2);

      const outputs = result.results.map(r => r.output.toLowerCase());
      const hasFour = outputs.some(o => o.includes('4'));
      const hasBlue = outputs.some(o => o.includes('blue'));
      expect(hasFour).toBe(true);
      expect(hasBlue).toBe(true);
    }, 60000);
  });

  describe('pattern matching', () => {
    test('validates response matches expected pattern', async () => {
      await fs.writeFile(
        path.join(evalsDir, 'json-response.eval.json'),
        JSON.stringify({
          id: 'json-test',
          name: 'JSON Response Test',
          description: 'Test JSON response generation',
          category: 'basic',
          prompt: 'Return a valid JSON object with keys "name" and "age". Only return the JSON, nothing else.',
          expectedPatterns: [
            { output: ['"name"', '"age"', '{', '}'] },
          ],
          judges: ['pattern-match'],
        })
      );

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: createAnthropicAgent(client),
        maxRetries: 1,
        parallel: false,
        timeout: 30000,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(1);
      expect(result.results[0].judgeResults.length).toBeGreaterThan(0);
    }, 60000);
  });

  describe('parallel execution', () => {
    test('runs evals in parallel', async () => {
      for (let i = 1; i <= 3; i++) {
        await fs.writeFile(
          path.join(evalsDir, `parallel-${i}.eval.json`),
          JSON.stringify({
            id: `parallel-${i}`,
            name: `Parallel Test ${i}`,
            description: 'd',
            category: 'basic',
            prompt: `Count from 1 to ${i}`,
            judges: [],
          })
        );
      }

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: createAnthropicAgent(client),
        maxRetries: 0,
        parallel: true,
        maxConcurrency: 3,
        timeout: 60000,
      });

      const runner = new EvalRunner(config);
      const startTime = Date.now();
      const result = await runner.run();
      const duration = Date.now() - startTime;

      expect(result.total).toBe(3);
      expect(result.passed).toBe(3);
      expect(duration).toBeLessThan(90000);
    }, 90000);
  });

  describe('usage tracking', () => {
    test('tracks token usage', async () => {
      await fs.writeFile(
        path.join(evalsDir, 'usage.eval.json'),
        JSON.stringify({
          id: 'usage-test',
          name: 'Usage Test',
          description: 'Test token usage tracking',
          category: 'basic',
          prompt: 'Say "test"',
          judges: [],
        })
      );

      let capturedUsage: { inputTokens: number; outputTokens: number } | undefined;

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: async (prompt): Promise<AgentResult> => {
          const response = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 100,
            messages: [{ role: 'user', content: prompt }],
          });

          const textContent = response.content.find(c => c.type === 'text');
          const output = textContent?.type === 'text' ? textContent.text : '';

          capturedUsage = {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          };

          return {
            output,
            success: true,
            usage: capturedUsage,
          };
        },
        maxRetries: 0,
        parallel: false,
        timeout: 30000,
      });

      const runner = new EvalRunner(config);
      await runner.run();

      expect(capturedUsage).toBeDefined();
      expect(capturedUsage!.inputTokens).toBeGreaterThan(0);
      expect(capturedUsage!.outputTokens).toBeGreaterThan(0);
    }, 30000);
  });

  describe('error handling', () => {
    test('handles API errors gracefully', async () => {
      await fs.writeFile(
        path.join(evalsDir, 'error.eval.json'),
        JSON.stringify({
          id: 'error-test',
          name: 'Error Test',
          description: 'Test error handling',
          category: 'basic',
          prompt: 'Test',
          judges: [],
        })
      );

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: async (): Promise<AgentResult> => {
          throw new Error('Simulated API error');
        },
        maxRetries: 0,
        parallel: false,
        timeout: 5000,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(1);
      expect(result.passed).toBe(0);
      expect(result.errors).toBe(1);
    });
  });
});

describe.skipIf(!hasApiKey)('Integration: Tool Use with API', () => {
  let testDir: string;
  let evalsDir: string;
  let client: Anthropic;

  beforeAll(() => {
    client = new Anthropic();
  });

  beforeEach(async () => {
    resetJudgeRegistry();
    testDir = path.join(os.tmpdir(), `integ-tools-api-${Date.now()}`);
    evalsDir = path.join(testDir, '__evals__');
    await fs.mkdir(evalsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test('validates tool invocation with real API', async () => {
    await fs.writeFile(
      path.join(evalsDir, 'tool-use.eval.json'),
      JSON.stringify({
        id: 'tool-use-test',
        name: 'Tool Use Test',
        description: 'Test tool invocation tracking',
        category: 'tool',
        prompt: 'Use the calculator tool to compute 15 * 7',
        expectedToolCalls: [{ toolName: 'calculator', minCalls: 1 }],
        judges: ['tool-invocation'],
      })
    );

    const tools: Anthropic.Tool[] = [
      {
        name: 'calculator',
        description: 'Performs mathematical calculations',
        input_schema: {
          type: 'object',
          properties: {
            expression: { type: 'string', description: 'The math expression to evaluate' },
          },
          required: ['expression'],
        },
      },
    ];

    const config = createResolvedConfig({
      testDir: evalsDir,
      agent: async (prompt): Promise<AgentResult> => {
        const startTime = Date.now();
        const toolCalls: ToolCall[] = [];

        try {
          const response = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            tools,
            messages: [{ role: 'user', content: prompt }],
          });

          let output = '';
          for (const block of response.content) {
            if (block.type === 'text') {
              output += block.text;
            } else if (block.type === 'tool_use') {
              toolCalls.push({
                toolName: block.name,
                input: block.input,
              });
            }
          }

          return {
            output,
            success: true,
            toolCalls,
            duration: Date.now() - startTime,
          };
        } catch (error) {
          return {
            output: '',
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            duration: Date.now() - startTime,
          };
        }
      },
      maxRetries: 1,
      parallel: false,
      timeout: 30000,
    });

    const runner = new EvalRunner(config);
    const result = await runner.run();

    expect(result.total).toBe(1);
    expect(result.results[0].toolCalls).toBeDefined();
    expect(result.results[0].toolCalls!.length).toBeGreaterThan(0);
    expect(result.results[0].toolCalls!.some(tc => tc.toolName === 'calculator')).toBe(true);
  }, 30000);
});
