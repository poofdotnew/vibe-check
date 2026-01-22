import { defineConfig, type AgentResult, type AgentContext } from '@poofnew/vibe-check';
import { VibeCheckTracingProcessor } from '@poofnew/vibe-check/openai';
import { Agent, run, tool, setTraceProcessors, getGlobalTraceProvider } from '@openai/agents';
import { z } from 'zod';
import { config } from 'dotenv';
import { resolve, dirname, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

function createTools(workingDirectory: string) {
  const resolvePath = (filePath: string) =>
    isAbsolute(filePath) ? filePath : resolve(workingDirectory, filePath);

  const readFileTool = tool({
    name: 'read_file',
    description: 'Read contents of a file. Use relative paths.',
    parameters: z.object({ path: z.string() }),
    execute: async ({ path: filePath }) => await fs.readFile(resolvePath(filePath), 'utf-8'),
  });

  const writeFileTool = tool({
    name: 'write_file',
    description: 'Write content to a file. Use relative paths.',
    parameters: z.object({ path: z.string(), content: z.string() }),
    execute: async ({ path: filePath, content }) => {
      const fullPath = resolvePath(filePath);
      await fs.writeFile(fullPath, content);
      return `Wrote ${content.length} bytes to ${filePath}`;
    },
  });

  return { readFileTool, writeFileTool };
}

function createAgents(workingDirectory: string) {
  const { readFileTool, writeFileTool } = createTools(workingDirectory);

  const codingAgent = new Agent({
    name: 'coding',
    instructions: `You are an expert software engineer. Write clean, efficient code. The current working directory is: ${workingDirectory}. Always use relative paths for file operations.`,
    tools: [readFileTool, writeFileTool],
  });

  const researchAgent = new Agent({
    name: 'research',
    instructions: `You are a research specialist. Analyze and summarize information. The current working directory is: ${workingDirectory}. Always use relative paths for file operations.`,
    tools: [readFileTool],
  });

  const triageAgent = new Agent({
    name: 'triage',
    instructions: `You are a task router. Route coding tasks (writing code, fixing bugs, creating files) to the coding agent. Route research tasks (reading, analyzing, summarizing) to the research agent.`,
    handoffs: [codingAgent, researchAgent],
  });

  return triageAgent;
}

async function runOpenAIAgent(prompt: string, context: AgentContext): Promise<AgentResult> {
  const startTime = Date.now();

  const processor = new VibeCheckTracingProcessor(context.workingDirectory);
  setTraceProcessors([processor]);

  const triageAgent = createAgents(context.workingDirectory);

  try {
    const result = await run(triageAgent, prompt, { maxTurns: 10 });

    await getGlobalTraceProvider().forceFlush();

    return {
      output: String(result.finalOutput || ''),
      success: true,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    await getGlobalTraceProvider().forceFlush();
    return {
      output: '',
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      duration: Date.now() - startTime,
    };
  }
}

export default defineConfig({
  testDir: './__evals__',
  rubricsDir: './__evals__/rubrics',
  agentType: 'openai-agents',
  timeout: 120000,
  maxRetries: 1,
  parallel: true,
  maxConcurrency: 2,
  verbose: true,
  agent: runOpenAIAgent,
});
