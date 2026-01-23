import type { EvalCase, EvalCaseResult } from './schemas.js';
import type { Judge } from '../judges/judge-interface.js';

export interface EvalWorkspace {
  id: string;
  path: string;
}

export interface ToolCall {
  toolName: string;
  input: unknown;
  output?: unknown;
  isError?: boolean;
  timestamp?: number;
  duration?: number;
}

export interface ProgressRecord {
  type: string;
  percentage: number;
  description: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface TranscriptTurn {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  reasoning?: string;
  timestamp: number;
}

export interface TranscriptOutcome {
  files: string[];
  success: boolean;
  error?: string;
  finalState?: Record<string, unknown>;
}

export interface Transcript {
  turns: TranscriptTurn[];
  outcome: TranscriptOutcome;
  duration: number;
  startTime: number;
  endTime: number;
}

export interface AgentContext {
  workingDirectory: string;
  evalId: string;
  evalName: string;
  sessionId?: string;
  timeout?: number;
}

export interface AgentResult {
  output: string;
  success: boolean;
  toolCalls?: ToolCall[];
  sessionId?: string;
  error?: Error;
  duration?: number;
  numTurns?: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalCostUsd?: number;
  };
}

export type AgentFunction = (prompt: string, context: AgentContext) => Promise<AgentResult>;

export type AgentType = 'claude-code' | 'openai-agents' | 'vercel-ai' | 'generic';

export interface LearningConfig {
  enabled?: boolean;
  ruleOutputDir?: string;
  minFailuresForPattern?: number;
  similarityThreshold?: number;
  maxRulesPerIteration?: number;
  minRuleConfidence?: number;
  autoApprove?: boolean;
  autoApproveThreshold?: number;
}

export interface VibeCheckConfig {
  agent: AgentFunction;
  agentType?: AgentType;
  testMatch?: string[];
  testDir?: string;
  parallel?: boolean;
  maxConcurrency?: number;
  timeout?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  retryBackoffMultiplier?: number;
  trials?: number;
  trialPassThreshold?: number;
  judges?: Judge[];
  llmJudgeModel?: string;
  rubricsDir?: string;
  outputDir?: string;
  verbose?: boolean;
  preserveWorkspaces?: boolean;
  learning?: LearningConfig;
  createWorkspace?: () => Promise<EvalWorkspace>;
  cleanupWorkspace?: (workspace: EvalWorkspace) => Promise<void>;
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  beforeEach?: (evalCase: EvalCase) => Promise<void>;
  afterEach?: (result: EvalCaseResult) => Promise<void>;
}

export interface ResolvedConfig extends Required<
  Omit<
    VibeCheckConfig,
    | 'setup'
    | 'teardown'
    | 'beforeEach'
    | 'afterEach'
    | 'learning'
    | 'judges'
    | 'createWorkspace'
    | 'cleanupWorkspace'
  >
> {
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  beforeEach?: (evalCase: EvalCase) => Promise<void>;
  afterEach?: (result: EvalCaseResult) => Promise<void>;
  learning: Required<LearningConfig>;
  judges: Judge[];
  createWorkspace?: () => Promise<EvalWorkspace>;
  cleanupWorkspace?: (workspace: EvalWorkspace) => Promise<void>;
}

export function defineConfig(config: VibeCheckConfig): VibeCheckConfig {
  return config;
}

export const defaultConfig: Omit<ResolvedConfig, 'agent'> = {
  agentType: 'generic',
  testMatch: ['**/*.eval.json'],
  testDir: './__evals__',
  parallel: true,
  maxConcurrency: 3,
  timeout: 300000,
  maxRetries: 2,
  retryDelayMs: 1000,
  retryBackoffMultiplier: 2,
  trials: 1,
  trialPassThreshold: 0.5,
  judges: [],
  llmJudgeModel: 'claude-sonnet-4-20250514',
  rubricsDir: './__evals__/rubrics',
  outputDir: './__evals__/results',
  verbose: false,
  preserveWorkspaces: false,
  learning: {
    enabled: false,
    ruleOutputDir: './prompts',
    minFailuresForPattern: 2,
    similarityThreshold: 0.7,
    maxRulesPerIteration: 5,
    minRuleConfidence: 0.6,
    autoApprove: false,
    autoApproveThreshold: 0.8,
  },
};
