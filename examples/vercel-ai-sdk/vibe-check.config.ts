import { defineConfig, type AgentResult, type AgentContext } from '@poofnew/vibe-check';
import { VibeCheckStepsWriter } from '@poofnew/vibe-check/vercel-ai';
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
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

  return {
    read_file: tool({
      description: 'Read contents of a file. Use relative paths.',
      parameters: z.object({ path: z.string() }),
      execute: async ({ path: filePath }) => await fs.readFile(resolvePath(filePath), 'utf-8'),
    }),

    write_file: tool({
      description: 'Write content to a file. Use relative paths.',
      parameters: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path: filePath, content }) => {
        const fullPath = resolvePath(filePath);
        await fs.writeFile(fullPath, content);
        return `Wrote ${content.length} bytes to ${filePath}`;
      },
    }),
  };
}

type AgentType = 'coding' | 'research';

interface AgentConfig {
  name: AgentType;
  systemPrompt: string;
  tools: ReturnType<typeof createTools>;
}

function getAgentConfigs(workingDirectory: string): Record<AgentType, AgentConfig> {
  const tools = createTools(workingDirectory);

  return {
    coding: {
      name: 'coding',
      systemPrompt: `You are an expert software engineer. Write clean, efficient code. The current working directory is: ${workingDirectory}. Always use relative paths for file operations.`,
      tools,
    },
    research: {
      name: 'research',
      systemPrompt: `You are a research specialist. Analyze and summarize information. The current working directory is: ${workingDirectory}. Always use relative paths for file operations.`,
      tools: { read_file: tools.read_file },
    },
  };
}

async function routeToAgent(prompt: string): Promise<AgentType> {
  const result = await generateText({
    model: openai('gpt-4o-mini'),
    system: `You are a task router. Analyze the user's request and determine which specialist agent should handle it.

Available agents:
- coding: For writing code, creating files, fixing bugs, implementing features
- research: For reading files, analyzing content, summarizing information, answering questions about existing code

Respond with ONLY the agent name (coding or research), nothing else.`,
    prompt,
    maxSteps: 1,
  });

  const agentName = result.text.trim().toLowerCase();
  if (agentName === 'coding' || agentName === 'research') {
    return agentName;
  }
  return 'coding';
}

async function runVercelAIAgent(prompt: string, context: AgentContext): Promise<AgentResult> {
  const startTime = Date.now();
  const stepsWriter = new VibeCheckStepsWriter(context.workingDirectory);

  try {
    const selectedAgent = await routeToAgent(prompt);
    const agentConfigs = getAgentConfigs(context.workingDirectory);
    const agent = agentConfigs[selectedAgent];

    stepsWriter.writeHandoff('triage', agent.name);

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: agent.systemPrompt,
      prompt,
      tools: agent.tools,
      maxSteps: 10,
    });

    stepsWriter.writeResult(result);
    await stepsWriter.flush();

    return {
      output: result.text || '',
      success: true,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    await stepsWriter.flush();
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
  agentType: 'vercel-ai',
  timeout: 120000,
  maxRetries: 1,
  parallel: true,
  maxConcurrency: 2,
  verbose: true,
  agent: runVercelAIAgent,
});
