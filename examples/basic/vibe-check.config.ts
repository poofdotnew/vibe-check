import { defineConfig, type AgentResult } from '@poofnew/vibe-check';

export default defineConfig({
  testDir: './__evals__',

  agent: async (prompt, context): Promise<AgentResult> => {
    console.log(`[Agent] Received prompt: ${prompt}`);
    console.log(`[Agent] Working directory: ${context.workingDirectory}`);

    return {
      output: `Processed: ${prompt}`,
      success: true,
      toolCalls: [],
    };
  },
});
