import { defineConfig, type AgentResult, type ToolCall } from '@poofnew/vibe-check';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(__dirname, '../../.env') });

/**
 * Mock agent with deliberate flaws for demonstrating the learning system.
 *
 * This agent has specific weaknesses that cause predictable failures:
 * 1. Never uses the Write tool (always uses Read instead)
 * 2. Ignores requests to create files
 * 3. Doesn't handle multi-step tasks well
 * 4. Lacks proper error handling instructions
 */
export default defineConfig({
  testDir: './__evals__',

  learning: {
    enabled: true,
    ruleOutputDir: './prompts',
    minFailuresForPattern: 2,
  },

  agent: async (prompt, _context): Promise<AgentResult> => {
    const toolCalls: ToolCall[] = [];
    let output = '';

    // Simulate agent behavior with deliberate flaws

    // Flaw 1: Always reads instead of writes
    if (prompt.toLowerCase().includes('write') || prompt.toLowerCase().includes('create')) {
      toolCalls.push({
        toolName: 'Read',
        input: { path: '/some/file.txt' },
        output: 'File not found',
        isError: true,
      });
      output = 'I tried to read the file but it does not exist.';
    }
    // Flaw 2: Doesn't handle "delete" requests at all
    else if (prompt.toLowerCase().includes('delete') || prompt.toLowerCase().includes('remove')) {
      output = 'I understand you want to delete something, but I cannot perform that action.';
    }
    // Flaw 3: Uses wrong tool for API calls
    else if (prompt.toLowerCase().includes('api') || prompt.toLowerCase().includes('fetch')) {
      toolCalls.push({
        toolName: 'Bash',
        input: { command: 'curl https://example.com' },
        output: 'Command not allowed',
        isError: true,
      });
      output = 'I attempted to use curl but the command was blocked.';
    }
    // Flaw 4: Doesn't validate input before processing
    else if (prompt.toLowerCase().includes('validate') || prompt.toLowerCase().includes('check')) {
      output = 'The input appears valid.';
    }
    // Default: Generic response
    else {
      output = `Processed request: ${prompt.substring(0, 50)}...`;
    }

    return {
      output,
      success: true,
      toolCalls,
    };
  },
});
