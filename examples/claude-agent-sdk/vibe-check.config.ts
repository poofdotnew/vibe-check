import { defineConfig, type AgentResult, type AgentContext } from '@pooflabs/vibe-check';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from vibe-check root
config({ path: resolve(__dirname, '../../.env') });

async function runClaudeAgent(prompt: string, context: AgentContext): Promise<AgentResult> {
  let output = '';
  let success = false;

  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    for await (const message of query({
      prompt,
      options: {
        cwd: context.workingDirectory,
        allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
        env: {
          ...process.env,
          CLAUDE_CONFIG_DIR: `${context.workingDirectory}/.claude`,
        },
      },
    })) {
      if (message.type === 'result') {
        output = message.result || '';
        success = message.subtype === 'success';
      }
    }

    // Tool calls are automatically extracted from JSONL by vibe-check
    return { output, success };
  } catch (error) {
    return {
      output: '',
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

export default defineConfig({
  testDir: './__evals__',
  rubricsDir: './__evals__/rubrics',
  agentType: 'claude-code',
  timeout: 120000,
  maxRetries: 1,
  parallel: true,
  maxConcurrency: 2,
  verbose: true,

  agent: runClaudeAgent,
});
