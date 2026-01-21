export interface AgentRequest {
  prompt: string;
  context: {
    workingDirectory: string;
    evalId: string;
    evalName: string;
    sessionId?: string;
    timeout?: number;
  };
}

export interface AgentResponse {
  output: string;
  success: boolean;
  toolCalls?: Array<{
    toolName: string;
    input: unknown;
    output?: unknown;
    isError?: boolean;
  }>;
  sessionId?: string;
  error?: string;
  duration?: number;
  numTurns?: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalCostUsd?: number;
  };
}
