// Config
export { defineConfig, defaultConfig } from './config/types.js';
export type {
  ToolCall,
  AgentContext,
  AgentResult,
  AgentFunction,
  AgentType,
  LearningConfig,
  VibeCheckConfig,
  ResolvedConfig,
  EvalWorkspace,
  ProgressRecord,
  Transcript,
  TranscriptTurn,
  TranscriptOutcome,
} from './config/types.js';

export {
  parseEvalCase,
  isToolEval,
  isCodeGenEval,
  isRoutingEval,
  isMultiTurnEval,
  isBasicEval,
} from './config/schemas.js';

export type {
  EvalCategory,
  EvalAgentType,
  ReferenceSolution,
  TrialConfig,
  ExpectedToolCall,
  ExpectedSkill,
  ToolEvalCase,
  ExpectedPattern,
  CodeGenEvalCase,
  RoutingEvalCase,
  Turn,
  MultiTurnEvalCase,
  BasicEvalCase,
  EvalCase,
  JudgeResult,
  EvalCaseResult,
} from './config/schemas.js';

export { loadConfig } from './config/config-loader.js';

// Runner
export { EvalRunner } from './runner/eval-runner.js';
export type { EvalRunnerOptions, RunnerOptions, EvalSuiteResult } from './runner/eval-runner.js';

// Judges
export { BaseJudge, agentResultToExecutionResult } from './judges/judge-interface.js';
export type {
  Judge,
  JudgeType,
  JudgeContext,
  ExecutionResult,
  ToolCallRecord,
} from './judges/judge-interface.js';

export { JudgeRegistry, getJudgeRegistry, resetJudgeRegistry } from './judges/judge-registry.js';

// Harness
export { TestHarness } from './harness/test-harness.js';
export type { TestHarnessOptions, HarnessOptions } from './harness/test-harness.js';


// Utils
export { loadEvalCases, loadEvalCase, groupByCategory } from './utils/eval-loader.js';
export type { EvalLoadOptions, LoadOptions } from './utils/eval-loader.js';

export {
  formatDuration,
  formatPassRate,
  getStatusSymbol,
  summarizeByCategory,
  summarizeErrors,
  printSummary,
  generateJsonReport,
} from './utils/reporter.js';
export type { EvalReportOptions, ReportOptions, CategorySummary, ErrorSummary } from './utils/reporter.js';

export {
  aggregateResults,
  detectRegressions,
  calculateNonDeterminismMetrics,
} from './utils/result-aggregator.js';
export type { AggregatedResult, AggregatedSummary } from './utils/result-aggregator.js';
