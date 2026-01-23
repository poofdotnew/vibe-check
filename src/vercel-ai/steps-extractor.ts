import * as fs from 'fs';
import * as path from 'path';
import type { ToolCall } from '../config/types.js';

export interface VercelAIToolCall {
  toolName: string;
  toolCallId: string;
  args: unknown;
}

export interface VercelAIToolResult {
  toolName: string;
  toolCallId: string;
  args: unknown;
  result: unknown;
}

export interface VercelAIStep {
  text?: string;
  toolCalls?: VercelAIToolCall[];
  toolResults?: VercelAIToolResult[];
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface VercelAIGenerateResult {
  text?: string;
  steps?: VercelAIStep[];
  toolCalls?: VercelAIToolCall[];
  toolResults?: VercelAIToolResult[];
}

export function extractToolCallsFromSteps(result: VercelAIGenerateResult): ToolCall[] {
  const toolCalls: ToolCall[] = [];

  if (result.steps) {
    for (const step of result.steps) {
      if (step.toolCalls) {
        for (const call of step.toolCalls) {
          toolCalls.push({
            toolName: call.toolName,
            input: call.args,
          });
        }
      }

      if (step.toolResults) {
        for (const toolResult of step.toolResults) {
          const existingCall = toolCalls.find(
            (tc) =>
              tc.toolName === toolResult.toolName &&
              JSON.stringify(tc.input) === JSON.stringify(toolResult.args)
          );

          if (existingCall) {
            existingCall.output = toolResult.result;
          } else {
            toolCalls.push({
              toolName: toolResult.toolName,
              input: toolResult.args,
              output: toolResult.result,
            });
          }
        }
      }
    }
  }

  if (result.toolCalls) {
    for (const call of result.toolCalls) {
      const exists = toolCalls.some(
        (tc) =>
          tc.toolName === call.toolName && JSON.stringify(tc.input) === JSON.stringify(call.args)
      );
      if (!exists) {
        toolCalls.push({
          toolName: call.toolName,
          input: call.args,
        });
      }
    }
  }

  if (result.toolResults) {
    for (const toolResult of result.toolResults) {
      const existingCall = toolCalls.find(
        (tc) =>
          tc.toolName === toolResult.toolName &&
          JSON.stringify(tc.input) === JSON.stringify(toolResult.args)
      );

      if (existingCall) {
        existingCall.output = toolResult.result;
      }
    }
  }

  return toolCalls;
}

export interface StepEntry {
  type: 'step' | 'handoff';
  timestamp: number;
  tool_name?: string;
  tool_input?: string;
  tool_output?: string;
  text?: string;
  finish_reason?: string;
  from_agent?: string;
  to_agent?: string;
}

export class VibeCheckStepsWriter {
  private stepsPath: string;
  private stream: fs.WriteStream | null = null;

  constructor(workspacePath: string) {
    this.stepsPath = path.join(workspacePath, '.vercel-ai', 'steps.jsonl');
  }

  private ensureDir(): void {
    const dir = path.dirname(this.stepsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!this.stream) {
      this.stream = fs.createWriteStream(this.stepsPath, { flags: 'a' });
    }
  }

  writeResult(result: VercelAIGenerateResult): void {
    this.ensureDir();

    if (result.steps) {
      for (const step of result.steps) {
        if (step.toolCalls) {
          for (const call of step.toolCalls) {
            const entry: StepEntry = {
              type: 'step',
              timestamp: Date.now(),
              tool_name: call.toolName,
              tool_input: typeof call.args === 'string' ? call.args : JSON.stringify(call.args),
            };
            this.stream?.write(JSON.stringify(entry) + '\n');
          }
        }

        if (step.toolResults) {
          for (const toolResult of step.toolResults) {
            const entry: StepEntry = {
              type: 'step',
              timestamp: Date.now(),
              tool_name: toolResult.toolName,
              tool_input:
                typeof toolResult.args === 'string'
                  ? toolResult.args
                  : JSON.stringify(toolResult.args),
              tool_output:
                typeof toolResult.result === 'string'
                  ? toolResult.result
                  : JSON.stringify(toolResult.result),
            };
            this.stream?.write(JSON.stringify(entry) + '\n');
          }
        }

        if (step.text) {
          const entry: StepEntry = {
            type: 'step',
            timestamp: Date.now(),
            text: step.text,
            finish_reason: step.finishReason,
          };
          this.stream?.write(JSON.stringify(entry) + '\n');
        }
      }
    }
  }

  writeHandoff(fromAgent: string, toAgent: string): void {
    this.ensureDir();
    const entry: StepEntry = {
      type: 'handoff',
      timestamp: Date.now(),
      from_agent: fromAgent,
      to_agent: toAgent,
    };
    this.stream?.write(JSON.stringify(entry) + '\n');
  }

  async flush(): Promise<void> {
    return new Promise((resolve) => {
      if (this.stream) {
        this.stream.end(() => resolve());
        this.stream = null;
      } else {
        resolve();
      }
    });
  }
}
