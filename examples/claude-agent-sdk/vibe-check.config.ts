import { defineConfig, type AgentResult, type AgentContext, type ToolCall } from '@pooflabs/vibe-check';

async function runClaudeAgent(prompt: string, context: AgentContext): Promise<AgentResult> {
  const toolCalls: ToolCall[] = [];
  let output = '';
  let success = false;

  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    for await (const message of query({
      prompt,
      options: {
        cwd: context.workingDirectory,
      },
    })) {
      if (message.type === 'tool_use') {
        toolCalls.push({
          toolName: message.tool_name,
          input: message.input,
        });
      }

      if (message.type === 'tool_result') {
        const lastCall = toolCalls[toolCalls.length - 1];
        if (lastCall) {
          lastCall.output = message.output;
          lastCall.isError = message.is_error;
        }
      }

      if (message.type === 'result') {
        output = message.result || '';
        success = message.subtype === 'success';
      }
    }

    return { output, success, toolCalls };
  } catch (error) {
    return {
      output: '',
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      toolCalls,
    };
  }
}

export default defineConfig({
  testDir: './__evals__',
  agentType: 'claude-sdk',
  timeout: 120000,
  maxRetries: 1,
  parallel: true,
  maxConcurrency: 2,
  verbose: true,

  agent: runClaudeAgent,
});
