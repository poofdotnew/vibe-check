import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import type { AgentFunction, AgentResult, AgentContext } from '../config/types.js';
import type { AgentRequest, AgentResponse } from './types.js';

export interface PythonAdapterOptions {
  scriptPath: string;
  pythonPath?: string;
  env?: Record<string, string>;
  cwd?: string;
}

export class PythonAgentAdapter {
  private scriptPath: string;
  private pythonPath: string;
  private env: Record<string, string>;
  private cwd: string;

  constructor(options: PythonAdapterOptions) {
    this.scriptPath = options.scriptPath;
    this.pythonPath = options.pythonPath || 'python3';
    this.env = options.env || {};
    this.cwd = options.cwd || dirname(options.scriptPath);
  }

  createAgent(): AgentFunction {
    return async (prompt: string, context: AgentContext): Promise<AgentResult> => {
      return this.runAgent(prompt, context);
    };
  }

  private async runAgent(prompt: string, context: AgentContext): Promise<AgentResult> {
    const request: AgentRequest = {
      prompt,
      context: {
        workingDirectory: context.workingDirectory,
        evalId: context.evalId,
        evalName: context.evalName,
        sessionId: context.sessionId,
        timeout: context.timeout,
      },
    };

    const timeout = context.timeout || 300000;

    return new Promise((resolvePromise) => {
      const scriptFullPath = resolve(this.cwd, this.scriptPath);
      const scriptDir = dirname(scriptFullPath);

      const proc = spawn(this.pythonPath, [scriptFullPath], {
        cwd: scriptDir,
        env: {
          ...process.env,
          ...this.env,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      const timeoutId = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        resolvePromise({
          output: '',
          success: false,
          error: new Error(`Failed to spawn Python process: ${err.message}`),
        });
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);

        if (killed) {
          resolvePromise({
            output: '',
            success: false,
            error: new Error(`Agent timed out after ${timeout}ms`),
          });
          return;
        }

        if (code !== 0) {
          resolvePromise({
            output: stderr || stdout,
            success: false,
            error: new Error(`Python process exited with code ${code}: ${stderr}`),
          });
          return;
        }

        try {
          const response = this.parseResponse(stdout);
          resolvePromise(this.toAgentResult(response));
        } catch (err) {
          resolvePromise({
            output: stdout,
            success: false,
            error:
              err instanceof Error ? err : new Error(`Failed to parse response: ${String(err)}`),
          });
        }
      });

      proc.stdin.write(JSON.stringify(request));
      proc.stdin.end();
    });
  }

  private parseResponse(stdout: string): AgentResponse {
    const lines = stdout.trim().split('\n');
    const lastLine = lines[lines.length - 1];

    try {
      return JSON.parse(lastLine) as AgentResponse;
    } catch {
      return JSON.parse(stdout.trim()) as AgentResponse;
    }
  }

  private toAgentResult(response: AgentResponse): AgentResult {
    return {
      output: response.output,
      success: response.success,
      toolCalls: response.toolCalls,
      sessionId: response.sessionId,
      error: response.error ? new Error(response.error) : undefined,
      duration: response.duration,
      numTurns: response.numTurns,
      usage: response.usage,
    };
  }
}
