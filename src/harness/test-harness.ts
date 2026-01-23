import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { EvalCase } from '../config/schemas.js';
import type {
  AgentFunction,
  AgentContext,
  AgentResult,
  ResolvedConfig,
  EvalWorkspace,
  ToolCall,
} from '../config/types.js';
import type { ExecutionResult } from '../judges/judge-interface.js';
import { agentResultToExecutionResult } from '../judges/judge-interface.js';

export interface TestHarnessOptions {
  config: ResolvedConfig;
}

/** @deprecated Use TestHarnessOptions instead */
export type HarnessOptions = TestHarnessOptions;

export class TestHarness {
  private config: ResolvedConfig;
  private workspaces: Map<string, EvalWorkspace> = new Map();

  constructor(options: TestHarnessOptions) {
    this.config = options.config;
  }

  private verbose(message: string): void {
    if (this.config.verbose) {
      console.log(message);
    }
  }

  async execute(evalCase: EvalCase): Promise<ExecutionResult> {
    this.verbose(`[${evalCase.id}] Starting: ${evalCase.name}`);

    const workspace = this.config.createWorkspace
      ? await this.config.createWorkspace()
      : await this.createDefaultWorkspace();

    this.workspaces.set(workspace.id, workspace);
    this.verbose(`[${evalCase.id}] Workspace: ${workspace.id}`);

    try {
      const context: AgentContext = {
        workingDirectory: workspace.path,
        evalId: evalCase.id,
        evalName: evalCase.name,
        timeout: evalCase.timeout ?? this.config.timeout,
      };

      const prompt = this.getPrompt(evalCase);
      const startTime = Date.now();

      this.verbose(`[${evalCase.id}] Executing agent...`);
      const result = await this.executeWithTimeout(
        this.config.agent,
        prompt,
        context,
        context.timeout!
      );

      // Extract tool calls from JSONL for claude-code agent type
      if (this.config.agentType === 'claude-code') {
        const jsonlToolCalls = await this.extractToolCallsFromJsonl(workspace.path);
        if (jsonlToolCalls.length > 0) {
          this.verbose(`[${evalCase.id}] Found ${jsonlToolCalls.length} tool calls from JSONL`);
          result.toolCalls = result.toolCalls || [];
          for (const call of jsonlToolCalls) {
            if (!result.toolCalls.some((t) => t.toolName === call.toolName)) {
              result.toolCalls.push(call);
            }
          }
        }
      }

      // Extract tool calls from traces for openai-agents type
      if (this.config.agentType === 'openai-agents') {
        const traceToolCalls = await this.extractToolCallsFromOpenAITraces(workspace.path);
        if (traceToolCalls.length > 0) {
          this.verbose(`[${evalCase.id}] Found ${traceToolCalls.length} tool calls from traces`);
          result.toolCalls = result.toolCalls || [];
          for (const call of traceToolCalls) {
            if (
              !result.toolCalls.some(
                (t) =>
                  t.toolName === call.toolName &&
                  JSON.stringify(t.input) === JSON.stringify(call.input)
              )
            ) {
              result.toolCalls.push(call);
            }
          }
        }
      }

      // Extract tool calls from steps for vercel-ai type
      if (this.config.agentType === 'vercel-ai') {
        const stepsToolCalls = await this.extractToolCallsFromVercelAISteps(workspace.path);
        if (stepsToolCalls.length > 0) {
          this.verbose(`[${evalCase.id}] Found ${stepsToolCalls.length} tool calls from steps`);
          result.toolCalls = result.toolCalls || [];
          for (const call of stepsToolCalls) {
            if (
              !result.toolCalls.some(
                (t) =>
                  t.toolName === call.toolName &&
                  JSON.stringify(t.input) === JSON.stringify(call.input)
              )
            ) {
              result.toolCalls.push(call);
            }
          }
        }
      }

      const executionResult = agentResultToExecutionResult(result);
      executionResult.duration = result.duration ?? Date.now() - startTime;
      executionResult.workingDirectory = workspace.path;

      this.verbose(
        `[${evalCase.id}] Completed (${result.success ? 'success' : 'failed'}) in ${executionResult.duration}ms`
      );

      // Store workspace ID in result so eval runner can clean up after judging
      executionResult.workspaceId = workspace.id;

      return executionResult;
    } catch (error) {
      // Still try to extract tool calls even on error/timeout
      let extractedToolCalls: ToolCall[] = [];
      if (this.config.agentType === 'claude-code') {
        extractedToolCalls = await this.extractToolCallsFromJsonl(workspace.path);
      } else if (this.config.agentType === 'openai-agents') {
        extractedToolCalls = await this.extractToolCallsFromOpenAITraces(workspace.path);
      } else if (this.config.agentType === 'vercel-ai') {
        extractedToolCalls = await this.extractToolCallsFromVercelAISteps(workspace.path);
      }

      // On error, cleanup immediately
      if (this.config.cleanupWorkspace || !this.config.preserveWorkspaces) {
        await this.cleanupWorkspaceById(workspace.id);
      }

      // Re-throw with tool calls available for error analysis
      const executionError = error as Error & { toolCalls?: ToolCall[] };
      executionError.toolCalls = extractedToolCalls;
      throw executionError;
    }
    // Note: Workspace cleanup is deferred until after judging completes
    // The eval runner should call cleanupWorkspaceById after judges run
  }

  async executeMultiTurn(
    evalCase: EvalCase & { category: 'multi-turn' }
  ): Promise<ExecutionResult[]> {
    this.verbose(
      `[${evalCase.id}] Starting multi-turn: ${evalCase.name} (${evalCase.turns.length} turns)`
    );

    const workspace = this.config.createWorkspace
      ? await this.config.createWorkspace()
      : await this.createDefaultWorkspace();

    this.workspaces.set(workspace.id, workspace);
    this.verbose(`[${evalCase.id}] Workspace: ${workspace.id}`);

    const results: ExecutionResult[] = [];
    let sessionId: string | undefined;

    try {
      for (let i = 0; i < evalCase.turns.length; i++) {
        const turn = evalCase.turns[i];

        const context: AgentContext = {
          workingDirectory: workspace.path,
          evalId: evalCase.id,
          evalName: `${evalCase.name} - Turn ${i + 1}`,
          timeout: evalCase.timeout ?? this.config.timeout,
          sessionId,
        };

        const startTime = Date.now();

        this.verbose(`[${evalCase.id}] Executing turn ${i + 1}/${evalCase.turns.length}...`);
        const result = await this.executeWithTimeout(
          this.config.agent,
          turn.prompt,
          context,
          context.timeout!
        );

        // Extract tool calls from JSONL for claude-code agent type
        if (this.config.agentType === 'claude-code') {
          const jsonlToolCalls = await this.extractToolCallsFromJsonl(workspace.path);
          if (jsonlToolCalls.length > 0) {
            this.verbose(`[${evalCase.id}] Found ${jsonlToolCalls.length} tool calls from JSONL`);
            result.toolCalls = result.toolCalls || [];
            for (const call of jsonlToolCalls) {
              if (!result.toolCalls.some((t) => t.toolName === call.toolName)) {
                result.toolCalls.push(call);
              }
            }
          }
        }

        // Extract tool calls from traces for openai-agents type
        if (this.config.agentType === 'openai-agents') {
          const traceToolCalls = await this.extractToolCallsFromOpenAITraces(workspace.path);
          if (traceToolCalls.length > 0) {
            this.verbose(`[${evalCase.id}] Found ${traceToolCalls.length} tool calls from traces`);
            result.toolCalls = result.toolCalls || [];
            for (const call of traceToolCalls) {
              if (
                !result.toolCalls.some(
                  (t) =>
                    t.toolName === call.toolName &&
                    JSON.stringify(t.input) === JSON.stringify(call.input)
                )
              ) {
                result.toolCalls.push(call);
              }
            }
          }
        }

        // Extract tool calls from steps for vercel-ai type
        if (this.config.agentType === 'vercel-ai') {
          const stepsToolCalls = await this.extractToolCallsFromVercelAISteps(workspace.path);
          if (stepsToolCalls.length > 0) {
            this.verbose(`[${evalCase.id}] Found ${stepsToolCalls.length} tool calls from steps`);
            result.toolCalls = result.toolCalls || [];
            for (const call of stepsToolCalls) {
              if (
                !result.toolCalls.some(
                  (t) =>
                    t.toolName === call.toolName &&
                    JSON.stringify(t.input) === JSON.stringify(call.input)
                )
              ) {
                result.toolCalls.push(call);
              }
            }
          }
        }

        const executionResult = agentResultToExecutionResult(result);
        executionResult.duration = result.duration ?? Date.now() - startTime;
        executionResult.workingDirectory = workspace.path;

        this.verbose(
          `[${evalCase.id}] Turn ${i + 1} completed (${result.success ? 'success' : 'failed'}) in ${executionResult.duration}ms`
        );

        results.push(executionResult);

        sessionId = result.sessionId;
      }

      this.verbose(`[${evalCase.id}] Multi-turn completed`);

      // Store workspace ID in final result so eval runner can clean up after judging
      if (results.length > 0) {
        results[results.length - 1].workspaceId = workspace.id;
      }

      return results;
    } catch (error) {
      // Still try to extract tool calls even on error/timeout
      let extractedToolCalls: ToolCall[] = [];
      if (this.config.agentType === 'claude-code') {
        extractedToolCalls = await this.extractToolCallsFromJsonl(workspace.path);
      } else if (this.config.agentType === 'openai-agents') {
        extractedToolCalls = await this.extractToolCallsFromOpenAITraces(workspace.path);
      } else if (this.config.agentType === 'vercel-ai') {
        extractedToolCalls = await this.extractToolCallsFromVercelAISteps(workspace.path);
      }

      // On error, cleanup immediately
      if (this.config.cleanupWorkspace || !this.config.preserveWorkspaces) {
        await this.cleanupWorkspaceById(workspace.id);
      }

      // Re-throw with tool calls available for error analysis
      const executionError = error as Error & { toolCalls?: ToolCall[] };
      executionError.toolCalls = extractedToolCalls;
      throw executionError;
    }
    // Note: Workspace cleanup is deferred until after judging completes
    // The eval runner should call cleanupWorkspaceById after judges run
  }

  private getPrompt(evalCase: EvalCase): string {
    if ('prompt' in evalCase) {
      return evalCase.prompt;
    }
    if ('turns' in evalCase && evalCase.turns.length > 0) {
      return evalCase.turns[0].prompt;
    }
    throw new Error(`Eval case ${evalCase.id} has no prompt`);
  }

  private async executeWithTimeout(
    agent: AgentFunction,
    prompt: string,
    context: AgentContext,
    timeout: number
  ): Promise<AgentResult> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Agent execution timed out after ${timeout}ms`));
      }, timeout);
    });

    return Promise.race([agent(prompt, context), timeoutPromise]);
  }

  async cleanup(): Promise<void> {
    if (this.config.cleanupWorkspace || !this.config.preserveWorkspaces) {
      for (const id of this.workspaces.keys()) {
        await this.cleanupWorkspaceById(id);
      }
    }
  }

  async cleanupWorkspace(workspaceId: string): Promise<void> {
    if (this.config.cleanupWorkspace || !this.config.preserveWorkspaces) {
      await this.cleanupWorkspaceById(workspaceId);
    }
  }

  private async createDefaultWorkspace(): Promise<EvalWorkspace> {
    const id = `ws-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const baseDir = this.getWorkspaceBaseDir();
    const workspacePath = path.join(baseDir, id);

    await fs.mkdir(workspacePath, { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(workspacePath, 'package.json'),
      JSON.stringify({ name: 'eval-workspace', version: '1.0.0', type: 'module' }, null, 2)
    );

    return { id, path: workspacePath };
  }

  private getWorkspaceBaseDir(): string {
    const cwd = process.cwd();
    const evalsResultsDir = path.join(cwd, '__evals__', 'results', 'workspaces');

    try {
      fsSync.mkdirSync(evalsResultsDir, { recursive: true });
      const testFile = path.join(evalsResultsDir, '.write-test');
      fsSync.writeFileSync(testFile, '');
      fsSync.unlinkSync(testFile);
      return evalsResultsDir;
    } catch {
      const tmpDir = fsSync.realpathSync(os.tmpdir());
      return path.join(tmpDir, 'vibe-check-evals');
    }
  }

  private async cleanupWorkspaceById(id: string): Promise<void> {
    const workspace = this.workspaces.get(id);
    if (workspace) {
      this.verbose(`Cleaning up workspace: ${id}`);
      if (this.config.cleanupWorkspace) {
        await this.config.cleanupWorkspace(workspace);
      } else {
        try {
          await fs.rm(workspace.path, {
            recursive: true,
            force: true,
            maxRetries: 3,
            retryDelay: 100,
          });
        } catch {
          // Ignore cleanup errors
        }
      }
      this.workspaces.delete(id);
    }
  }

  private async extractToolCallsFromJsonl(workspacePath: string): Promise<ToolCall[]> {
    const toolCalls: ToolCall[] = [];
    const toolUseMap = new Map<string, { name: string; input: unknown }>();

    try {
      const claudeDir = path.join(workspacePath, '.claude', 'projects');
      try {
        await fs.access(claudeDir);
      } catch {
        return toolCalls;
      }

      const projectDirs = await fs.readdir(claudeDir);

      for (const projectDir of projectDirs) {
        const projectPath = path.join(claudeDir, projectDir);
        const stat = await fs.stat(projectPath);
        if (!stat.isDirectory()) continue;

        const files = await fs.readdir(projectPath);
        const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

        for (const jsonlFile of jsonlFiles) {
          const filePath = path.join(projectPath, jsonlFile);
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n').filter((line) => line.trim());

          // First pass: collect all tool_use blocks
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              const message = entry.message;
              if (!message?.content || !Array.isArray(message.content)) continue;

              for (const block of message.content) {
                if (block.type === 'tool_use' && typeof block.name === 'string' && block.id) {
                  toolUseMap.set(block.id, { name: block.name, input: block.input || {} });
                }
              }
            } catch {
              // Skip invalid JSON lines
            }
          }

          // Second pass: match with tool_result
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              const message = entry.message;
              if (!message?.content || !Array.isArray(message.content)) continue;

              for (const block of message.content) {
                if (block.type === 'tool_result' && block.tool_use_id) {
                  const toolUse = toolUseMap.get(block.tool_use_id);
                  if (toolUse) {
                    const output =
                      typeof block.content === 'string'
                        ? block.content
                        : JSON.stringify(block.content);
                    if (
                      !toolCalls.some(
                        (t) =>
                          t.toolName === toolUse.name &&
                          JSON.stringify(t.input) === JSON.stringify(toolUse.input)
                      )
                    ) {
                      toolCalls.push({
                        toolName: toolUse.name,
                        input: toolUse.input,
                        output,
                        isError: block.is_error,
                      });
                    }
                    toolUseMap.delete(block.tool_use_id);
                  }
                }
              }
            } catch {
              // Skip invalid JSON lines
            }
          }

          // Add any tool uses without results
          for (const [, toolUse] of toolUseMap) {
            if (
              !toolCalls.some(
                (t) =>
                  t.toolName === toolUse.name &&
                  JSON.stringify(t.input) === JSON.stringify(toolUse.input)
              )
            ) {
              toolCalls.push({
                toolName: toolUse.name,
                input: toolUse.input,
              });
            }
          }
        }
      }
    } catch {
      // Ignore errors
    }

    return toolCalls;
  }

  private async extractToolCallsFromOpenAITraces(workspacePath: string): Promise<ToolCall[]> {
    const toolCalls: ToolCall[] = [];

    try {
      const tracesPath = path.join(workspacePath, '.openai-agents', 'traces.jsonl');
      try {
        await fs.access(tracesPath);
      } catch {
        return toolCalls;
      }

      const content = await fs.readFile(tracesPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);

          // Extract function/tool calls
          if (entry.type === 'span' && entry.span_type === 'function') {
            let input: unknown;
            try {
              input =
                typeof entry.tool_input === 'string'
                  ? JSON.parse(entry.tool_input)
                  : entry.tool_input;
            } catch {
              input = entry.tool_input;
            }

            let output: unknown;
            try {
              output =
                typeof entry.tool_output === 'string'
                  ? JSON.parse(entry.tool_output)
                  : entry.tool_output;
            } catch {
              output = entry.tool_output;
            }

            toolCalls.push({
              toolName: entry.tool_name,
              input,
              output,
            });
          }

          // Extract handoffs as special tool calls
          if (entry.type === 'span' && entry.span_type === 'handoff') {
            toolCalls.push({
              toolName: 'Handoff',
              input: {
                agent: entry.to_agent,
                fromAgent: entry.from_agent,
              },
            });
          }
        } catch {
          // Skip invalid lines
        }
      }
    } catch {
      // Ignore errors
    }

    return toolCalls;
  }

  private async extractToolCallsFromVercelAISteps(workspacePath: string): Promise<ToolCall[]> {
    const toolCalls: ToolCall[] = [];

    try {
      const stepsPath = path.join(workspacePath, '.vercel-ai', 'steps.jsonl');
      try {
        await fs.access(stepsPath);
      } catch {
        return toolCalls;
      }

      const content = await fs.readFile(stepsPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);

          if (entry.type === 'step' && entry.tool_name) {
            let input: unknown;
            try {
              input =
                typeof entry.tool_input === 'string'
                  ? JSON.parse(entry.tool_input)
                  : entry.tool_input;
            } catch {
              input = entry.tool_input;
            }

            let output: unknown;
            if (entry.tool_output) {
              try {
                output =
                  typeof entry.tool_output === 'string'
                    ? JSON.parse(entry.tool_output)
                    : entry.tool_output;
              } catch {
                output = entry.tool_output;
              }
            }

            const existingCall = toolCalls.find(
              (tc) =>
                tc.toolName === entry.tool_name &&
                JSON.stringify(tc.input) === JSON.stringify(input)
            );

            if (existingCall && output) {
              existingCall.output = output;
            } else if (!existingCall) {
              toolCalls.push({
                toolName: entry.tool_name,
                input,
                output,
              });
            }
          }

          // Extract handoffs as special tool calls
          if (entry.type === 'handoff' && entry.to_agent) {
            toolCalls.push({
              toolName: 'Handoff',
              input: {
                agent: entry.to_agent,
                fromAgent: entry.from_agent,
              },
            });
          }
        } catch {
          // Skip invalid lines
        }
      }
    } catch {
      // Ignore errors
    }

    return toolCalls;
  }
}
