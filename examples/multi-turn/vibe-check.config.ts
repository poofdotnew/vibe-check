import { defineConfig, type AgentResult, type AgentContext } from '@poofnew/vibe-check';

// Simulated multi-turn agent that maintains session context
const sessions = new Map<string, string[]>();

async function multiTurnAgent(prompt: string, context: AgentContext): Promise<AgentResult> {
  const sessionId = context.sessionId || `session-${Date.now()}`;

  // Get or create session history
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, []);
  }
  const history = sessions.get(sessionId)!;
  history.push(prompt);

  // Simulate different responses based on turn
  const turnNumber = history.length;
  let output = '';

  if (turnNumber === 1) {
    output =
      'I understand you want to create a greeting function. Here is the initial implementation:\n\nfunction greet(name) {\n  return "Hello, " + name;\n}';
  } else if (turnNumber === 2) {
    output =
      'I have added TypeScript types to the function:\n\nfunction greet(name: string): string {\n  return "Hello, " + name;\n}';
  } else if (turnNumber === 3) {
    output =
      'I have added JSDoc documentation:\n\n/**\n * Greets a person by name\n * @param name - The name of the person to greet\n * @returns A greeting message\n */\nfunction greet(name: string): string {\n  return "Hello, " + name;\n}';
  } else {
    output = `Turn ${turnNumber}: Continuing the conversation about: ${prompt}`;
  }

  return {
    output,
    success: true,
    sessionId,
    toolCalls: [],
  };
}

export default defineConfig({
  testDir: './__evals__',
  timeout: 30000,
  verbose: true,

  agent: multiTurnAgent,
});
