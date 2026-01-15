import type { EvalCase, EvalCaseResult } from './schemas.js';
import type { Judge } from '../judges/judge-interface.js';

export interface ToolCall {
  toolName: string;
  input: unknown;
  output?: unknown;
  isError?: boolean;
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

export type AgentFunction = (
  prompt: string,
  context: AgentContext
) => Promise<AgentResult>;

export type AgentType = 'claude-code' | 'claude-sdk' | 'generic';

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
  workspaceTemplate?: string;
  preserveWorkspaces?: boolean;
  learning?: LearningConfig;
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  beforeEach?: (evalCase: EvalCase) => Promise<void>;
  afterEach?: (result: EvalCaseResult) => Promise<void>;
}

export interface ResolvedConfig extends Required<Omit<VibeCheckConfig, 'setup' | 'teardown' | 'beforeEach' | 'afterEach' | 'learning' | 'judges' | 'workspaceTemplate'>> {
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  beforeEach?: (evalCase: EvalCase) => Promise<void>;
  afterEach?: (result: EvalCaseResult) => Promise<void>;
  learning: Required<LearningConfig>;
  judges: Judge[];
  workspaceTemplate?: string;
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
