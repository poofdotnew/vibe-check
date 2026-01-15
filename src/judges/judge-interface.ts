import type { EvalCase, JudgeResult } from '../config/schemas.js';
import type { AgentResult } from '../config/types.js';

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: Error;
  toolCalls: ToolCallRecord[];
  duration: number;
  numTurns?: number;
  sessionId?: string;
  workingDirectory?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalCostUsd?: number;
  };
}

export interface ToolCallRecord {
  toolName: string;
  toolUseId?: string;
  input: unknown;
  output?: unknown;
  timestamp?: number;
  duration?: number;
  isError?: boolean;
}

export interface JudgeContext {
  evalCase: EvalCase;
  executionResult: ExecutionResult;
  workingDirectory: string;
  turnIndex?: number;
}

export type JudgeType = 'code' | 'llm' | 'hybrid';

export interface Judge {
  id: string;
  name: string;
  type: JudgeType;
  evaluate(context: JudgeContext): Promise<JudgeResult>;
}

export abstract class BaseJudge implements Judge {
  abstract id: string;
  abstract name: string;
  abstract type: JudgeType;

  abstract evaluate(context: JudgeContext): Promise<JudgeResult>;

  protected createResult(params: {
    passed: boolean;
    score: number;
    reasoning: string;
    confidence?: number;
    details?: Record<string, unknown>;
  }): JudgeResult {
    return {
      judgeId: this.id,
      passed: params.passed,
      score: params.score,
      confidence: params.confidence ?? 1,
      reasoning: params.reasoning,
      details: params.details,
    };
  }

  protected notApplicable(reason: string = 'Not applicable'): JudgeResult {
    return this.createResult({
      passed: true,
      score: 100,
      reasoning: reason,
    });
  }
}

export function agentResultToExecutionResult(result: AgentResult): ExecutionResult {
  return {
    success: result.success,
    output: result.output,
    error: result.error,
    toolCalls: (result.toolCalls ?? []).map(tc => ({
      toolName: tc.toolName,
      input: tc.input,
      output: tc.output,
      isError: tc.isError,
    })),
    duration: result.duration ?? 0,
    numTurns: result.numTurns,
    sessionId: result.sessionId,
    usage: result.usage,
  };
}

export { JudgeResult };
