import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { EvalRunner } from '../../runner/eval-runner.js';
import { defaultConfig, type VibeCheckConfig, type ResolvedConfig } from '../../config/types.js';
import { resetJudgeRegistry } from '../../judges/judge-registry.js';
import type { AgentResult, AgentContext, ToolCall } from '../../config/types.js';

const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

function createResolvedConfig(config: VibeCheckConfig): ResolvedConfig {
  return {
    ...defaultConfig,
    ...config,
    learning: { ...defaultConfig.learning, ...config.learning },
  } as ResolvedConfig;
}

async function createClaudeAgentSdkAgent(
  workingDirectory: string,
  options: {
    allowedTools?: string[];
    timeout?: number;
  } = {}
): Promise<(prompt: string, context: AgentContext) => Promise<AgentResult>> {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');

  return async (prompt: string, context: AgentContext): Promise<AgentResult> => {
    const toolCalls: ToolCall[] = [];
    let output = '';
    let success = false;
    let sessionId: string | undefined;
    let usage: { inputTokens: number; outputTokens: number; totalCostUsd?: number } | undefined;
    let numTurns = 0;
    const startTime = Date.now();

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, options.timeout ?? 60000);

    try {
      for await (const message of query({
        prompt,
        options: {
          cwd: context.workingDirectory || workingDirectory,
          allowedTools: options.allowedTools ?? ['Read', 'Glob', 'Grep', 'Bash', 'Write', 'Edit'],
          abortController,
        },
      })) {
        if (!sessionId && 'session_id' in message) {
          sessionId = message.session_id;
        }

        if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'tool_use') {
              toolCalls.push({
                toolName: block.name,
                input: block.input,
              });
            }
          }
        }

        if (message.type === 'user' && 'tool_use_result' in message && message.tool_use_result !== undefined) {
          const lastCall = toolCalls[toolCalls.length - 1];
          if (lastCall) {
            lastCall.output = message.tool_use_result;
          }
        }

        if (message.type === 'result') {
          numTurns = message.num_turns;
          if (message.subtype === 'success') {
            output = message.result || '';
            success = true;
            usage = {
              inputTokens: message.usage.input_tokens,
              outputTokens: message.usage.output_tokens,
              totalCostUsd: message.total_cost_usd,
            };
          } else {
            success = false;
            output = message.errors?.join('\n') || 'Unknown error';
          }
        }
      }

      clearTimeout(timeoutId);

      return {
        output,
        success,
        toolCalls,
        sessionId,
        duration: Date.now() - startTime,
        numTurns,
        usage,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      return {
        output: '',
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        toolCalls,
        duration: Date.now() - startTime,
      };
    }
  };
}

describe.skipIf(!hasApiKey)('Integration: Claude Agent SDK', () => {
  let testDir: string;
  let evalsDir: string;
  let workspaceDir: string;

  beforeEach(async () => {
    resetJudgeRegistry();
    testDir = path.join(os.tmpdir(), `integ-agent-sdk-${Date.now()}`);
    evalsDir = path.join(testDir, '__evals__');
    workspaceDir = path.join(testDir, 'workspace');
    await fs.mkdir(evalsDir, { recursive: true });
    await fs.mkdir(workspaceDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('basic prompts', () => {
    test('runs simple prompt with Claude Agent SDK', async () => {
      await fs.writeFile(
        path.join(evalsDir, 'simple.eval.json'),
        JSON.stringify({
          id: 'simple-sdk-test',
          name: 'Simple SDK Test',
          description: 'Test basic Claude Agent SDK integration',
          category: 'basic',
          prompt: 'What is 2 + 2? Answer with just the number.',
          judges: [],
        })
      );

      const agent = await createClaudeAgentSdkAgent(workspaceDir, { timeout: 60000 });

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent,
        agentType: 'claude-sdk',
        maxRetries: 0,
        parallel: false,
        timeout: 60000,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(1);
      expect(result.passed).toBe(1);
      expect(result.results[0].output).toContain('4');
    }, 90000);

    test('handles multiple sequential evals', async () => {
      await fs.writeFile(
        path.join(evalsDir, 'eval1.eval.json'),
        JSON.stringify({
          id: 'seq-1',
          name: 'Sequential 1',
          description: 'd',
          category: 'basic',
          prompt: 'Say "hello" and nothing else',
          judges: [],
        })
      );

      await fs.writeFile(
        path.join(evalsDir, 'eval2.eval.json'),
        JSON.stringify({
          id: 'seq-2',
          name: 'Sequential 2',
          description: 'd',
          category: 'basic',
          prompt: 'Say "world" and nothing else',
          judges: [],
        })
      );

      const agent = await createClaudeAgentSdkAgent(workspaceDir, { timeout: 60000 });

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent,
        agentType: 'claude-sdk',
        maxRetries: 0,
        parallel: false,
        timeout: 60000,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(2);
      expect(result.passed).toBe(2);

      const outputs = result.results.map(r => r.output.toLowerCase());
      expect(outputs.some(o => o.includes('hello'))).toBe(true);
      expect(outputs.some(o => o.includes('world'))).toBe(true);
    }, 120000);
  });

  describe('tool usage', () => {
    test('tracks tool calls from agent', async () => {
      await fs.writeFile(
        path.join(workspaceDir, 'test-file.txt'),
        'This is test content for reading.'
      );

      await fs.writeFile(
        path.join(evalsDir, 'read-file.eval.json'),
        JSON.stringify({
          id: 'read-file-test',
          name: 'Read File Test',
          description: 'Test file reading with SDK',
          category: 'tool',
          prompt: 'Read the file test-file.txt in the current directory and tell me what it contains.',
          expectedToolCalls: [{ toolName: 'Read', minCalls: 1 }],
          judges: ['tool-invocation'],
        })
      );

      const agent = await createClaudeAgentSdkAgent(workspaceDir, {
        allowedTools: ['Read', 'Glob', 'Grep'],
        timeout: 60000,
      });

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent,
        agentType: 'claude-sdk',
        maxRetries: 0,
        parallel: false,
        timeout: 60000,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(1);
      expect(result.results[0].toolCalls).toBeDefined();
      expect(result.results[0].toolCalls!.length).toBeGreaterThan(0);
      expect(result.results[0].toolCalls!.some(tc => tc.toolName === 'Read')).toBe(true);
    }, 90000);

    test('validates glob tool usage', async () => {
      await fs.writeFile(path.join(workspaceDir, 'file1.ts'), 'const a = 1;');
      await fs.writeFile(path.join(workspaceDir, 'file2.ts'), 'const b = 2;');
      await fs.writeFile(path.join(workspaceDir, 'file3.js'), 'const c = 3;');

      await fs.writeFile(
        path.join(evalsDir, 'glob-files.eval.json'),
        JSON.stringify({
          id: 'glob-test',
          name: 'Glob Test',
          description: 'Test glob functionality',
          category: 'tool',
          prompt: 'List all TypeScript files (*.ts) in the current directory.',
          expectedToolCalls: [{ toolName: 'Glob', minCalls: 1 }],
          judges: ['tool-invocation'],
        })
      );

      const agent = await createClaudeAgentSdkAgent(workspaceDir, {
        allowedTools: ['Glob', 'Read'],
        timeout: 60000,
      });

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent,
        agentType: 'claude-sdk',
        maxRetries: 0,
        parallel: false,
        timeout: 60000,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(1);
      expect(result.results[0].toolCalls!.some(tc => tc.toolName === 'Glob')).toBe(true);
    }, 90000);
  });

  describe('code generation', () => {
    test('creates files using Write tool', async () => {
      await fs.writeFile(
        path.join(evalsDir, 'create-file.eval.json'),
        JSON.stringify({
          id: 'create-file-test',
          name: 'Create File Test',
          description: 'Test file creation with SDK',
          category: 'code-gen',
          prompt: 'Create a file called hello.ts with a function that returns "Hello World"',
          targetFiles: ['hello.ts'],
          judges: ['file-existence'],
        })
      );

      const agent = await createClaudeAgentSdkAgent(workspaceDir, {
        allowedTools: ['Write', 'Read', 'Glob'],
        timeout: 90000,
      });

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent,
        agentType: 'claude-sdk',
        maxRetries: 1,
        parallel: false,
        timeout: 90000,
        preserveWorkspaces: true,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(1);
      expect(result.results[0].toolCalls!.some(tc => tc.toolName === 'Write')).toBe(true);
    }, 120000);

    test('edits existing files', async () => {
      await fs.writeFile(
        path.join(workspaceDir, 'edit-me.ts'),
        'export function greet() {\n  return "Hello";\n}\n'
      );

      await fs.writeFile(
        path.join(evalsDir, 'edit-file.eval.json'),
        JSON.stringify({
          id: 'edit-file-test',
          name: 'Edit File Test',
          description: 'Test file editing with SDK',
          category: 'code-gen',
          prompt: 'Edit edit-me.ts to add a name parameter to the greet function',
          targetFiles: ['edit-me.ts'],
          expectedPatterns: [{ file: 'edit-me.ts', patterns: ['name', 'greet'] }],
          judges: ['file-existence', 'pattern-match'],
        })
      );

      const agent = await createClaudeAgentSdkAgent(workspaceDir, {
        allowedTools: ['Read', 'Edit', 'Glob'],
        timeout: 90000,
      });

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent,
        agentType: 'claude-sdk',
        maxRetries: 1,
        parallel: false,
        timeout: 90000,
        preserveWorkspaces: true,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(1);
      expect(result.results[0].toolCalls).toBeDefined();
      expect(result.results[0].toolCalls!.length).toBeGreaterThan(0);
    }, 120000);
  });

  describe('error handling', () => {
    test('handles timeout gracefully', async () => {
      await fs.writeFile(
        path.join(evalsDir, 'timeout.eval.json'),
        JSON.stringify({
          id: 'timeout-test',
          name: 'Timeout Test',
          description: 'Test timeout handling',
          category: 'basic',
          prompt: 'Write a very long essay about the history of computing from 1800 to present day with detailed analysis of each decade.',
          judges: [],
        })
      );

      const agent = await createClaudeAgentSdkAgent(workspaceDir, { timeout: 5000 });

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent,
        agentType: 'claude-sdk',
        maxRetries: 0,
        parallel: false,
        timeout: 5000,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(1);
      expect(result.passed + result.failed + result.errors).toBe(1);
    }, 30000);
  });

  describe('parallel execution', () => {
    test('runs multiple evals in parallel', async () => {
      for (let i = 1; i <= 3; i++) {
        await fs.writeFile(
          path.join(evalsDir, `parallel-${i}.eval.json`),
          JSON.stringify({
            id: `parallel-${i}`,
            name: `Parallel Test ${i}`,
            description: 'd',
            category: 'basic',
            prompt: `What is ${i} times 2? Answer with just the number.`,
            judges: [],
          })
        );
      }

      const agent = await createClaudeAgentSdkAgent(workspaceDir, { timeout: 60000 });

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent,
        agentType: 'claude-sdk',
        maxRetries: 0,
        parallel: true,
        maxConcurrency: 2,
        timeout: 60000,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(3);
      expect(result.passed).toBe(3);
    }, 180000);
  });

  describe('usage tracking', () => {
    test('captures token usage and cost', async () => {
      await fs.writeFile(
        path.join(evalsDir, 'usage.eval.json'),
        JSON.stringify({
          id: 'usage-test',
          name: 'Usage Test',
          description: 'Test usage tracking',
          category: 'basic',
          prompt: 'Say "test"',
          judges: [],
        })
      );

      let capturedResult: AgentResult | undefined;

      const baseAgent = await createClaudeAgentSdkAgent(workspaceDir, { timeout: 60000 });
      const wrappedAgent = async (prompt: string, context: AgentContext): Promise<AgentResult> => {
        capturedResult = await baseAgent(prompt, context);
        return capturedResult;
      };

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: wrappedAgent,
        agentType: 'claude-sdk',
        maxRetries: 0,
        parallel: false,
        timeout: 60000,
      });

      const runner = new EvalRunner(config);
      await runner.run();

      expect(capturedResult).toBeDefined();
      expect(capturedResult!.usage).toBeDefined();
      expect(capturedResult!.usage!.inputTokens).toBeGreaterThan(0);
      expect(capturedResult!.usage!.outputTokens).toBeGreaterThan(0);
    }, 90000);
  });
});

describe.skipIf(!hasApiKey)('Integration: Claude Agent SDK with Bash', () => {
  let testDir: string;
  let evalsDir: string;
  let workspaceDir: string;

  beforeEach(async () => {
    resetJudgeRegistry();
    testDir = path.join(os.tmpdir(), `integ-sdk-bash-${Date.now()}`);
    evalsDir = path.join(testDir, '__evals__');
    workspaceDir = path.join(testDir, 'workspace');
    await fs.mkdir(evalsDir, { recursive: true });
    await fs.mkdir(workspaceDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test('executes bash commands', async () => {
    await fs.writeFile(
      path.join(evalsDir, 'bash.eval.json'),
      JSON.stringify({
        id: 'bash-test',
        name: 'Bash Test',
        description: 'Test bash command execution',
        category: 'tool',
        prompt: 'Run "echo hello" using the Bash tool and tell me what it outputs.',
        expectedToolCalls: [{ toolName: 'Bash', minCalls: 1 }],
        judges: ['tool-invocation'],
      })
    );

    const agent = await createClaudeAgentSdkAgent(workspaceDir, {
      allowedTools: ['Bash', 'Read'],
      timeout: 60000,
    });

    const config = createResolvedConfig({
      testDir: evalsDir,
      agent,
      agentType: 'claude-sdk',
      maxRetries: 0,
      parallel: false,
      timeout: 60000,
    });

    const runner = new EvalRunner(config);
    const result = await runner.run();

    expect(result.total).toBe(1);
    expect(result.results[0].toolCalls!.some(tc => tc.toolName === 'Bash')).toBe(true);
    expect(result.results[0].output.toLowerCase()).toContain('hello');
  }, 90000);
});
