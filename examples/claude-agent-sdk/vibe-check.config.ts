import { defineConfig, type AgentResult, type AgentContext } from '@poofnew/vibe-check';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from vibe-check root
config({ path: resolve(__dirname, '../../.env') });

const subagents = {
  coding: {
    description:
      'Expert coding agent for writing, creating, and implementing code. Use for all programming tasks.',
    prompt: `You are an expert software engineer. Write clean, well-structured code with proper types and error handling.`,
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'Skill'],
    model: 'sonnet' as const,
  },
  research: {
    description:
      'Research agent for searching, finding information, and analyzing codebases. Use for exploration tasks.',
    prompt: `You are a research specialist. Thoroughly search and analyze to provide comprehensive answers.`,
    tools: ['Read', 'Glob', 'Grep'],
    model: 'sonnet' as const,
  },
  reviewer: {
    description: 'Code review agent for analyzing code quality, security, and best practices.',
    prompt: `You are a code review specialist. Identify issues, suggest improvements, and ensure code quality.`,
    tools: ['Read', 'Glob', 'Grep'],
    model: 'sonnet' as const,
  },
};

const skills = {
  test: {
    description: 'Run tests for the project. Use when asked to run or execute tests.',
    prompt: `Run the project tests using the appropriate test runner (jest, vitest, bun test, etc).`,
  },
  format: {
    description: 'Format code in the project. Use when asked to format or lint code.',
    prompt: `Format the code using the appropriate formatter (prettier, eslint --fix, etc).`,
  },
};

async function runClaudeAgent(prompt: string, context: AgentContext): Promise<AgentResult> {
  let output = '';
  let success = false;

  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    for await (const message of query({
      prompt,
      options: {
        cwd: context.workingDirectory,
        allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'Task', 'Skill'],
        agents: subagents,
        skills,
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
