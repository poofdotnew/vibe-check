import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseJudge } from '../judge-interface.js';
import type { JudgeContext, JudgeResult, JudgeType } from '../judge-interface.js';
import { isRoutingEval } from '../../config/schemas.js';

const DEFAULT_WORK_TYPE_KEYWORDS: Record<string, string[]> = {};

export interface AgentRoutingJudgeOptions {
  workTypeKeywords?: Record<string, string[]>;
}

export class AgentRoutingJudge extends BaseJudge {
  id = 'agent-routing';
  name = 'Agent Routing Judge';
  type: JudgeType = 'code';

  private workTypeKeywords: Record<string, string[]>;

  constructor(options: AgentRoutingJudgeOptions = {}) {
    super();
    this.workTypeKeywords = options.workTypeKeywords || DEFAULT_WORK_TYPE_KEYWORDS;
  }

  async evaluate(context: JudgeContext): Promise<JudgeResult> {
    const { executionResult, evalCase, workingDirectory } = context;

    if (!isRoutingEval(evalCase)) {
      return this.notApplicable('Only applicable for routing evals');
    }

    const taskCalls = executionResult.toolCalls.filter(
      (call) =>
        call.toolName === 'Task' ||
        call.toolName === 'Handoff' ||
        call.toolName.includes('task') ||
        call.toolName.includes('handoff')
    );

    let agentsInvoked = taskCalls
      .map((call) => {
        const input = call.input as Record<string, unknown> | undefined;
        return (input?.agent as string) || (input?.subagent_type as string) || 'unknown';
      })
      .filter((agent) => agent !== 'unknown');

    const jsonlAgents = await this.extractAgentsFromJsonl(workingDirectory);
    const openaiAgents = await this.extractAgentsFromOpenAITraces(workingDirectory);
    const vercelAgents = await this.extractAgentsFromVercelAISteps(workingDirectory);
    agentsInvoked = [
      ...new Set([...agentsInvoked, ...jsonlAgents, ...openaiAgents, ...vercelAgents]),
    ];

    const expectedAgent = evalCase.expectedAgent;
    const invokedExpected = agentsInvoked.includes(expectedAgent);

    const forbiddenAgents = evalCase.shouldNotRoute || [];
    const invokedForbidden = forbiddenAgents.filter((a) => agentsInvoked.includes(a));

    const output = executionResult.output || '';
    const outputLower = output.toLowerCase();
    const hasDelegationIntent = this.checkDelegationIntent(
      outputLower,
      expectedAgent,
      forbiddenAgents
    );

    let score: number;
    let passed: boolean;
    let reasoning: string;

    if (invokedExpected && invokedForbidden.length === 0) {
      score = 100;
      passed = true;
      reasoning = `Correctly routed to ${expectedAgent}`;
    } else if (invokedExpected && invokedForbidden.length > 0) {
      score = 50;
      passed = false;
      reasoning = `Routed to ${expectedAgent} but also incorrectly routed to: ${invokedForbidden.join(', ')}`;
    } else if (hasDelegationIntent.toExpected && !hasDelegationIntent.toForbidden) {
      score = 80;
      passed = true;
      reasoning = `AI indicated delegation intent to ${expectedAgent} (no actual Task tool invocation detected)`;
    } else if (hasDelegationIntent.toExpected && hasDelegationIntent.toForbidden) {
      score = 40;
      passed = false;
      reasoning = `AI mentioned ${expectedAgent} but also mentioned forbidden agents`;
    } else if (hasDelegationIntent.performedRightWork) {
      score = 70;
      passed = true;
      reasoning = `AI performed ${expectedAgent}-appropriate work directly (no delegation, but correct work type)`;
    } else if (agentsInvoked.length === 0) {
      score = 0;
      passed = false;
      reasoning = `Expected ${expectedAgent} but no agent was invoked and no delegation intent detected. The main agent may have handled the task directly.`;
    } else {
      score = 0;
      passed = false;
      reasoning = `Expected ${expectedAgent} but got: ${agentsInvoked.join(', ')}`;
    }

    return this.createResult({
      passed,
      score,
      reasoning,
      details: {
        agentsInvoked,
        expectedAgent,
        invokedForbidden,
        taskCallCount: taskCalls.length,
        jsonlAgentsFound: jsonlAgents,
        delegationIntentDetected: hasDelegationIntent.toExpected,
        performedRightWork: hasDelegationIntent.performedRightWork,
      },
    });
  }

  private async extractAgentsFromJsonl(workspacePath: string): Promise<string[]> {
    const agents: string[] = [];

    try {
      const claudeDir = path.join(workspacePath, '.claude', 'projects');

      try {
        await fs.access(claudeDir);
      } catch {
        return agents;
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

          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              const message = entry.message;

              if (!message?.content || !Array.isArray(message.content)) continue;

              for (const block of message.content) {
                if (block.type === 'tool_use' && block.name === 'Task') {
                  const input = block.input as Record<string, unknown> | undefined;
                  const agentType = (input?.subagent_type as string) || (input?.agent as string);
                  if (agentType && !agents.includes(agentType)) {
                    agents.push(agentType);
                  }
                }
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } catch {
      // Ignore errors reading JSONL
    }

    return agents;
  }

  private async extractAgentsFromOpenAITraces(workspacePath: string): Promise<string[]> {
    const agents: string[] = [];

    try {
      const tracesPath = path.join(workspacePath, '.openai-agents', 'traces.jsonl');

      try {
        await fs.access(tracesPath);
      } catch {
        return agents;
      }

      const content = await fs.readFile(tracesPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.type === 'span' && entry.span_type === 'handoff' && entry.to_agent) {
            if (!agents.includes(entry.to_agent)) {
              agents.push(entry.to_agent);
            }
          }
        } catch {
          // Skip invalid lines
        }
      }
    } catch {
      // Ignore errors
    }

    return agents;
  }

  private async extractAgentsFromVercelAISteps(workspacePath: string): Promise<string[]> {
    const agents: string[] = [];

    try {
      const stepsPath = path.join(workspacePath, '.vercel-ai', 'steps.jsonl');

      try {
        await fs.access(stepsPath);
      } catch {
        return agents;
      }

      const content = await fs.readFile(stepsPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.type === 'handoff' && entry.to_agent) {
            if (!agents.includes(entry.to_agent)) {
              agents.push(entry.to_agent);
            }
          }
        } catch {
          // Skip invalid lines
        }
      }
    } catch {
      // Ignore errors
    }

    return agents;
  }

  private checkDelegationIntent(
    outputLower: string,
    expectedAgent: string,
    forbiddenAgents: string[]
  ): { toExpected: boolean; toForbidden: boolean; performedRightWork: boolean } {
    const delegationKeywords = [
      'delegate',
      'task tool',
      'subagent',
      'agent',
      'specialized',
      'use the',
      'invoke',
      'call the',
    ];

    const expectedAgentLower = expectedAgent.toLowerCase();
    const mentionsExpected = outputLower.includes(expectedAgentLower);
    const hasDelegationContext = delegationKeywords.some((kw) => outputLower.includes(kw));

    const toExpected = mentionsExpected && hasDelegationContext;

    const toForbidden = forbiddenAgents.some((agent) => {
      const agentLower = agent.toLowerCase();
      return outputLower.includes(agentLower) && hasDelegationContext;
    });

    const performedRightWork = this.checkWorkType(outputLower, expectedAgent);

    return { toExpected, toForbidden, performedRightWork };
  }

  private checkWorkType(outputLower: string, expectedAgent: string): boolean {
    const keywords = this.workTypeKeywords[expectedAgent] || [];
    if (keywords.length === 0) return false;

    const matchCount = keywords.filter((kw) => outputLower.includes(kw)).length;
    return matchCount >= 2;
  }
}
