import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { EvalRunner } from '../../runner/eval-runner.js';
import { defaultConfig, type VibeCheckConfig, type ResolvedConfig } from '../../config/types.js';
import {
  getJudgeRegistry,
  resetJudgeRegistry,
} from '../../judges/judge-registry.js';
import {
  BaseJudge,
  type JudgeContext,
  type JudgeResult,
  type JudgeType,
} from '../../judges/judge-interface.js';
import type { AgentResult, ToolCall } from '../../config/types.js';

function createResolvedConfig(config: VibeCheckConfig): ResolvedConfig {
  return {
    ...defaultConfig,
    ...config,
    learning: { ...defaultConfig.learning, ...config.learning },
  } as ResolvedConfig;
}

describe('Integration: Mock Agent Evals', () => {
  let testDir: string;
  let evalsDir: string;

  beforeEach(async () => {
    resetJudgeRegistry();
    testDir = path.join(os.tmpdir(), `integ-mock-${Date.now()}`);
    evalsDir = path.join(testDir, '__evals__');
    await fs.mkdir(evalsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('basic eval execution', () => {
    test('runs basic eval with mock agent', async () => {
      await fs.writeFile(
        path.join(evalsDir, 'basic.eval.json'),
        JSON.stringify({
          id: 'basic-test',
          name: 'Basic Test',
          description: 'Test basic eval execution',
          category: 'basic',
          prompt: 'Say hello',
          judges: [],
        })
      );

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: async (prompt) => ({
          output: `Response to: ${prompt}`,
          success: true,
        }),
        maxRetries: 0,
        parallel: false,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(1);
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.passRate).toBe(1);
    });

    test('runs multiple basic evals', async () => {
      for (let i = 1; i <= 3; i++) {
        await fs.writeFile(
          path.join(evalsDir, `test-${i}.eval.json`),
          JSON.stringify({
            id: `test-${i}`,
            name: `Test ${i}`,
            description: 'd',
            category: 'basic',
            prompt: `Prompt ${i}`,
            judges: [],
          })
        );
      }

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: async () => ({ output: 'Done', success: true }),
        maxRetries: 0,
        parallel: false,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(3);
      expect(result.passed).toBe(3);
    });

    test('handles agent failure gracefully', async () => {
      await fs.writeFile(
        path.join(evalsDir, 'fail.eval.json'),
        JSON.stringify({
          id: 'fail-test',
          name: 'Fail Test',
          description: 'd',
          category: 'basic',
          prompt: 'This will fail',
          judges: [],
        })
      );

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: async () => ({
          output: '',
          success: false,
          error: new Error('Agent failed'),
        }),
        maxRetries: 0,
        parallel: false,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(1);
      expect(result.passed).toBe(0);
      expect(result.failed + result.errors).toBe(1);
    });
  });

  describe('tool eval execution', () => {
    test('passes when expected tools are called', async () => {
      await fs.writeFile(
        path.join(evalsDir, 'tool.eval.json'),
        JSON.stringify({
          id: 'tool-test',
          name: 'Tool Test',
          description: 'Test tool invocation',
          category: 'tool',
          prompt: 'Read a file',
          expectedToolCalls: [{ toolName: 'Read', minCalls: 1 }],
          judges: ['tool-invocation'],
        })
      );

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: async (): Promise<AgentResult> => ({
          output: 'File contents',
          success: true,
          toolCalls: [
            { toolName: 'Read', input: { path: '/file.ts' }, output: 'content' },
          ],
        }),
        maxRetries: 0,
        parallel: false,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(1);
      expect(result.passed).toBe(1);
      expect(result.results[0].judgeResults.length).toBeGreaterThan(0);
      expect(result.results[0].judgeResults[0].passed).toBe(true);
    });

    test('fails when expected tools are not called', async () => {
      await fs.writeFile(
        path.join(evalsDir, 'tool-fail.eval.json'),
        JSON.stringify({
          id: 'tool-fail-test',
          name: 'Tool Fail Test',
          description: 'Test tool invocation failure',
          category: 'tool',
          prompt: 'Read a file',
          expectedToolCalls: [{ toolName: 'Read', minCalls: 2 }],
          judges: ['tool-invocation'],
        })
      );

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: async (): Promise<AgentResult> => ({
          output: 'Done',
          success: true,
          toolCalls: [
            { toolName: 'Read', input: {}, output: 'x' },
          ],
        }),
        maxRetries: 0,
        parallel: false,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(1);
      expect(result.passed).toBe(0);
      expect(result.results[0].judgeResults[0].passed).toBe(false);
    });
  });

  describe('code-gen eval execution', () => {
    test('passes when files are created', async () => {
      await fs.writeFile(
        path.join(evalsDir, 'codegen.eval.json'),
        JSON.stringify({
          id: 'codegen-test',
          name: 'CodeGen Test',
          description: 'Test code generation',
          category: 'code-gen',
          prompt: 'Create hello.ts',
          targetFiles: ['hello.ts'],
          judges: ['file-existence'],
        })
      );

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: async (_prompt, context): Promise<AgentResult> => {
          await fs.writeFile(
            path.join(context.workingDirectory, 'hello.ts'),
            'export const hello = "world";'
          );
          return { output: 'Created file', success: true };
        },
        maxRetries: 0,
        parallel: false,
        preserveWorkspaces: true,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(1);
      expect(result.passed).toBe(1);
    });

    test('fails when files are not created', async () => {
      await fs.writeFile(
        path.join(evalsDir, 'codegen-fail.eval.json'),
        JSON.stringify({
          id: 'codegen-fail-test',
          name: 'CodeGen Fail Test',
          description: 'Test code gen failure',
          category: 'code-gen',
          prompt: 'Create hello.ts',
          targetFiles: ['hello.ts', 'world.ts'],
          judges: ['file-existence'],
        })
      );

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: async (): Promise<AgentResult> => ({
          output: 'Did nothing',
          success: true,
        }),
        maxRetries: 0,
        parallel: false,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(1);
      expect(result.passed).toBe(0);
    });

    test('validates pattern matching in generated files', async () => {
      await fs.writeFile(
        path.join(evalsDir, 'pattern.eval.json'),
        JSON.stringify({
          id: 'pattern-test',
          name: 'Pattern Test',
          description: 'Test pattern matching',
          category: 'code-gen',
          prompt: 'Create utils.ts with greet function',
          targetFiles: ['utils.ts'],
          expectedPatterns: [
            { file: 'utils.ts', patterns: ['export', 'function greet', 'string'] },
          ],
          judges: ['file-existence', 'pattern-match'],
        })
      );

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: async (_prompt, context): Promise<AgentResult> => {
          await fs.writeFile(
            path.join(context.workingDirectory, 'utils.ts'),
            'export function greet(name: string): string { return `Hello ${name}`; }'
          );
          return { output: 'Created', success: true };
        },
        maxRetries: 0,
        parallel: false,
        preserveWorkspaces: true,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(1);
      expect(result.passed).toBe(1);
      expect(result.results[0].judgeResults.length).toBe(2);
    });
  });

  describe('filtering', () => {
    beforeEach(async () => {
      await fs.writeFile(
        path.join(evalsDir, 'basic1.eval.json'),
        JSON.stringify({
          id: 'basic-1',
          name: 'Basic 1',
          description: 'd',
          category: 'basic',
          prompt: 'p',
          tags: ['smoke'],
          judges: [],
        })
      );

      await fs.writeFile(
        path.join(evalsDir, 'tool1.eval.json'),
        JSON.stringify({
          id: 'tool-1',
          name: 'Tool 1',
          description: 'd',
          category: 'tool',
          prompt: 'p',
          expectedToolCalls: [],
          tags: ['regression'],
          judges: [],
        })
      );

      await fs.writeFile(
        path.join(evalsDir, 'basic2.eval.json'),
        JSON.stringify({
          id: 'basic-2',
          name: 'Basic 2',
          description: 'd',
          category: 'basic',
          prompt: 'p',
          tags: ['smoke', 'regression'],
          judges: [],
        })
      );
    });

    test('filters by category', async () => {
      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: async () => ({ output: '', success: true }),
        maxRetries: 0,
        parallel: false,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run({ categories: ['basic'] });

      expect(result.total).toBe(2);
    });

    test('filters by tag', async () => {
      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: async () => ({ output: '', success: true }),
        maxRetries: 0,
        parallel: false,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run({ tags: ['smoke'] });

      expect(result.total).toBe(2);
    });

    test('filters by id', async () => {
      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: async () => ({ output: '', success: true }),
        maxRetries: 0,
        parallel: false,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run({ ids: ['tool-1'] });

      expect(result.total).toBe(1);
      expect(result.results[0].evalCase.id).toBe('tool-1');
    });
  });

  describe('parallel execution', () => {
    test('runs evals in parallel', async () => {
      const executionOrder: string[] = [];

      for (let i = 1; i <= 4; i++) {
        await fs.writeFile(
          path.join(evalsDir, `parallel-${i}.eval.json`),
          JSON.stringify({
            id: `parallel-${i}`,
            name: `Parallel ${i}`,
            description: 'd',
            category: 'basic',
            prompt: `Test ${i}`,
            judges: [],
          })
        );
      }

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: async (prompt) => {
          executionOrder.push(prompt);
          await new Promise(r => setTimeout(r, 10));
          return { output: prompt, success: true };
        },
        maxRetries: 0,
        parallel: true,
        maxConcurrency: 2,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(4);
      expect(result.passed).toBe(4);
    });
  });

  describe('lifecycle hooks', () => {
    test('calls setup and teardown', async () => {
      const calls: string[] = [];

      await fs.writeFile(
        path.join(evalsDir, 'hook.eval.json'),
        JSON.stringify({
          id: 'hook-test',
          name: 'Hook Test',
          description: 'd',
          category: 'basic',
          prompt: 'p',
          judges: [],
        })
      );

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: async () => {
          calls.push('agent');
          return { output: '', success: true };
        },
        setup: async () => {
          calls.push('setup');
        },
        teardown: async () => {
          calls.push('teardown');
        },
        maxRetries: 0,
        parallel: false,
      });

      const runner = new EvalRunner(config);
      await runner.run();

      expect(calls).toEqual(['setup', 'agent', 'teardown']);
    });

    test('calls beforeEach and afterEach', async () => {
      const calls: string[] = [];

      await fs.writeFile(
        path.join(evalsDir, 'before.eval.json'),
        JSON.stringify({
          id: 'before-test',
          name: 'Before Test',
          description: 'd',
          category: 'basic',
          prompt: 'p',
          judges: [],
        })
      );

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: async () => {
          calls.push('agent');
          return { output: '', success: true };
        },
        beforeEach: async (evalCase) => {
          calls.push(`before:${evalCase.id}`);
        },
        afterEach: async (result) => {
          calls.push(`after:${result.evalCase.id}`);
        },
        maxRetries: 0,
        parallel: false,
      });

      const runner = new EvalRunner(config);
      await runner.run();

      expect(calls).toEqual(['before:before-test', 'agent', 'after:before-test']);
    });
  });
});

describe('Integration: Custom Judges', () => {
  let testDir: string;
  let evalsDir: string;

  beforeEach(async () => {
    resetJudgeRegistry();
    testDir = path.join(os.tmpdir(), `integ-judge-${Date.now()}`);
    evalsDir = path.join(testDir, '__evals__');
    await fs.mkdir(evalsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test('uses custom judge for evaluation', async () => {
    class LengthJudge extends BaseJudge {
      id = 'length-check';
      name = 'Length Check Judge';
      type: JudgeType = 'code';

      async evaluate(context: JudgeContext): Promise<JudgeResult> {
        const length = context.executionResult.output.length;
        const passed = length >= 10;

        return this.createResult({
          passed,
          score: passed ? 100 : 0,
          reasoning: `Output length: ${length}`,
        });
      }
    }

    const registry = getJudgeRegistry();
    registry.register(new LengthJudge());

    await fs.writeFile(
      path.join(evalsDir, 'length.eval.json'),
      JSON.stringify({
        id: 'length-test',
        name: 'Length Test',
        description: 'd',
        category: 'basic',
        prompt: 'Say something long',
        judges: ['length-check'],
      })
    );

    const config = createResolvedConfig({
      testDir: evalsDir,
      agent: async () => ({
        output: 'This is a sufficiently long response',
        success: true,
      }),
      maxRetries: 0,
      parallel: false,
    });

    const runner = new EvalRunner(config);
    const result = await runner.run();

    expect(result.total).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.results[0].judgeResults[0].judgeId).toBe('length-check');
    expect(result.results[0].judgeResults[0].passed).toBe(true);
  });

  test('custom judge can fail evaluation', async () => {
    class StrictJudge extends BaseJudge {
      id = 'strict-check';
      name = 'Strict Judge';
      type: JudgeType = 'code';

      async evaluate(): Promise<JudgeResult> {
        return this.createResult({
          passed: false,
          score: 0,
          reasoning: 'Always fails',
        });
      }
    }

    const registry = getJudgeRegistry();
    registry.register(new StrictJudge());

    await fs.writeFile(
      path.join(evalsDir, 'strict.eval.json'),
      JSON.stringify({
        id: 'strict-test',
        name: 'Strict Test',
        description: 'd',
        category: 'basic',
        prompt: 'Test',
        judges: ['strict-check'],
      })
    );

    const config = createResolvedConfig({
      testDir: evalsDir,
      agent: async () => ({ output: 'Response', success: true }),
      maxRetries: 0,
      parallel: false,
    });

    const runner = new EvalRunner(config);
    const result = await runner.run();

    expect(result.total).toBe(1);
    expect(result.passed).toBe(0);
    expect(result.results[0].judgeResults[0].passed).toBe(false);
  });

  test('combines multiple custom judges', async () => {
    class AlwaysPassJudge extends BaseJudge {
      id = 'always-pass';
      name = 'Always Pass';
      type: JudgeType = 'code';

      async evaluate(): Promise<JudgeResult> {
        return this.createResult({ passed: true, score: 100, reasoning: 'Pass' });
      }
    }

    class ContainsHelloJudge extends BaseJudge {
      id = 'contains-hello';
      name = 'Contains Hello';
      type: JudgeType = 'code';

      async evaluate(context: JudgeContext): Promise<JudgeResult> {
        const hasHello = context.executionResult.output.toLowerCase().includes('hello');
        return this.createResult({
          passed: hasHello,
          score: hasHello ? 100 : 0,
          reasoning: hasHello ? 'Contains hello' : 'Missing hello',
        });
      }
    }

    const registry = getJudgeRegistry();
    registry.register(new AlwaysPassJudge());
    registry.register(new ContainsHelloJudge());

    await fs.writeFile(
      path.join(evalsDir, 'multi-judge.eval.json'),
      JSON.stringify({
        id: 'multi-judge-test',
        name: 'Multi Judge Test',
        description: 'd',
        category: 'basic',
        prompt: 'Greet me',
        judges: ['always-pass', 'contains-hello'],
      })
    );

    const config = createResolvedConfig({
      testDir: evalsDir,
      agent: async () => ({ output: 'Hello there!', success: true }),
      maxRetries: 0,
      parallel: false,
    });

    const runner = new EvalRunner(config);
    const result = await runner.run();

    expect(result.total).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.results[0].judgeResults.length).toBe(2);
    expect(result.results[0].judgeResults.every(j => j.passed)).toBe(true);
  });
});
