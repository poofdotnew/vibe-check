import { defineConfig, type AgentResult, type AgentContext } from '@poofnew/vibe-check';
import { VibeCheckCopilotWriter } from '@poofnew/vibe-check/copilot';
import { CopilotClient, defineTool } from '@github/copilot-sdk';
import { z } from 'zod';
import { config } from 'dotenv';
import { resolve, dirname, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

type AgentType = 'coding' | 'research';

interface AgentConfig {
  name: AgentType;
  systemPrompt: string;
  tools: ReturnType<typeof defineTool>[];
}

function createTools(workingDirectory: string, writer: VibeCheckCopilotWriter) {
  const resolvePath = (filePath: string) =>
    isAbsolute(filePath) ? filePath : resolve(workingDirectory, filePath);

  const readFileTool = defineTool('read_file', {
    description: 'Read contents of a file. Use relative paths.',
    parameters: z.object({ path: z.string() }),
    handler: async ({ path: filePath }) => {
      const result = await fs.readFile(resolvePath(filePath), 'utf-8');
      writer.writeToolCall('read_file', { path: filePath }, result);
      return result;
    },
  });

  const writeFileTool = defineTool('write_file', {
    description: 'Write content to a file. Use relative paths.',
    parameters: z.object({ path: z.string(), content: z.string() }),
    handler: async ({ path: filePath, content }) => {
      const fullPath = resolvePath(filePath);
      await fs.writeFile(fullPath, content);
      const result = `Wrote ${content.length} bytes to ${filePath}`;
      writer.writeToolCall('write_file', { path: filePath, content }, result);
      return result;
    },
  });

  return { readFileTool, writeFileTool };
}

function createAgents(
  workingDirectory: string,
  writer: VibeCheckCopilotWriter
): Record<AgentType, AgentConfig> {
  const { readFileTool, writeFileTool } = createTools(workingDirectory, writer);

  return {
    coding: {
      name: 'coding',
      systemPrompt: `You are an expert software engineer. Write clean, efficient code. The current working directory is: ${workingDirectory}. Always use relative paths for file operations.`,
      tools: [readFileTool, writeFileTool],
    },
    research: {
      name: 'research',
      systemPrompt: `You are a research specialist. Analyze and summarize information. The current working directory is: ${workingDirectory}. Always use relative paths for file operations.`,
      tools: [readFileTool],
    },
  };
}

async function routeToAgent(client: CopilotClient, prompt: string): Promise<AgentType> {
  const routingSession = await client.createSession({
    model: 'gpt-4o-mini',
  });

  const done = new Promise<string>((resolve) => {
    let output = '';
    routingSession.on((event) => {
      if (event.type === 'assistant.message' && event.data?.content) {
        output += event.data.content;
      } else if (event.type === 'session.idle') {
        resolve(output);
      }
    });
  });

  await routingSession.send({
    prompt: `You are a task router. Given the following task, respond with ONLY the word "coding" or "research".
- coding: for tasks involving writing code, fixing bugs, creating files
- research: for tasks involving reading, analyzing, summarizing information

Task: ${prompt}

Response:`,
  });

  const response = await done;
  await routingSession.destroy();

  const agentName = response.toLowerCase().trim();
  return agentName === 'coding' || agentName === 'research' ? agentName : 'coding';
}

async function runCopilotAgent(prompt: string, context: AgentContext): Promise<AgentResult> {
  const startTime = Date.now();
  const eventsWriter = new VibeCheckCopilotWriter(context.workingDirectory);

  const client = new CopilotClient({
    autoStart: true,
  });

  try {
    await client.start();

    const selectedAgent = await routeToAgent(client, prompt);
    const agents = createAgents(context.workingDirectory, eventsWriter);
    const agent = agents[selectedAgent];

    eventsWriter.writeHandoff('triage', agent.name);

    const session = await client.createSession({
      model: 'gpt-4o',
      tools: agent.tools,
    });

    const done = new Promise<string>((resolve) => {
      let output = '';

      session.on((event) => {
        if (event.type === 'assistant.message' && event.data?.content) {
          output += event.data.content;
        } else if (event.type === 'session.idle') {
          resolve(output);
        }
      });
    });

    await session.send({
      prompt: `${agent.systemPrompt}\n\nTask: ${prompt}`,
    });

    const output = await done;
    await session.destroy();
    await client.stop();
    await eventsWriter.flush();

    return {
      output,
      success: true,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    await eventsWriter.flush();
    try {
      await client.stop();
    } catch {
      // Ignore cleanup errors
    }
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
  agentType: 'copilot',
  timeout: 120000,
  maxRetries: 1,
  parallel: true,
  maxConcurrency: 2,
  verbose: true,
  agent: runCopilotAgent,
});
