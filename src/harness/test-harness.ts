import type { EvalCase } from '../config/schemas.js';
import type { AgentFunction, AgentContext, AgentResult, ResolvedConfig } from '../config/types.js';
import type { ExecutionResult } from '../judges/judge-interface.js';
import { agentResultToExecutionResult } from '../judges/judge-interface.js';
import { WorkspaceManager } from './workspace-manager.js';

export interface HarnessOptions {
  config: ResolvedConfig;
  workspaceManager?: WorkspaceManager;
}

export class TestHarness {
  private config: ResolvedConfig;
  private workspaceManager: WorkspaceManager;

  constructor(options: HarnessOptions) {
    this.config = options.config;
    this.workspaceManager = options.workspaceManager ?? new WorkspaceManager();
  }

  async execute(evalCase: EvalCase): Promise<ExecutionResult> {
    const workspace = await this.workspaceManager.createWorkspace(this.config.workspaceTemplate);

    try {
      const context: AgentContext = {
        workingDirectory: workspace.path,
        evalId: evalCase.id,
        evalName: evalCase.name,
        timeout: evalCase.timeout ?? this.config.timeout,
      };

      const prompt = this.getPrompt(evalCase);
      const startTime = Date.now();

      const result = await this.executeWithTimeout(
        this.config.agent,
        prompt,
        context,
        context.timeout!
      );

      const executionResult = agentResultToExecutionResult(result);
      executionResult.duration = result.duration ?? (Date.now() - startTime);
      executionResult.workingDirectory = workspace.path;

      return executionResult;
    } finally {
      if (!this.config.preserveWorkspaces) {
        await this.workspaceManager.cleanupWorkspace(workspace.id);
      }
    }
  }

  async executeMultiTurn(evalCase: EvalCase & { category: 'multi-turn' }): Promise<ExecutionResult[]> {
    const workspace = await this.workspaceManager.createWorkspace(this.config.workspaceTemplate);
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

        const result = await this.executeWithTimeout(
          this.config.agent,
          turn.prompt,
          context,
          context.timeout!
        );

        const executionResult = agentResultToExecutionResult(result);
        executionResult.duration = result.duration ?? (Date.now() - startTime);
        executionResult.workingDirectory = workspace.path;

        results.push(executionResult);

        sessionId = result.sessionId;
      }

      return results;
    } finally {
      if (!this.config.preserveWorkspaces) {
        await this.workspaceManager.cleanupWorkspace(workspace.id);
      }
    }
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
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Agent execution timed out after ${timeout}ms`));
      }, timeout);

      try {
        const result = await agent(prompt, context);
        clearTimeout(timer);
        resolve(result);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  async cleanup(): Promise<void> {
    if (!this.config.preserveWorkspaces) {
      await this.workspaceManager.cleanupAll();
    }
  }
}
