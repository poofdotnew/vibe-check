import { defineConfig } from '@pooflabs/vibe-check';
import { PythonAgentAdapter } from '@pooflabs/vibe-check/adapters';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(__dirname, '../../.env') });

const adapter = new PythonAgentAdapter({
  scriptPath: './agent.py',
  pythonPath: './.venv/bin/python',
  cwd: __dirname,
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  },
});

export default defineConfig({
  testDir: './__evals__',
  rubricsDir: './__evals__/rubrics',
  agentType: 'claude-code',
  timeout: 120000,
  maxRetries: 1,
  parallel: true,
  maxConcurrency: 2,
  verbose: true,
  agent: adapter.createAgent(),
});
