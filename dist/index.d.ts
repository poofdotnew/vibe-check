import { R as ResolvedConfig, E as EvalCategory, a as EvalCaseResult, b as EvalCase, c as ExecutionResult, d as ErrorType } from './judge-registry-BOraTQ7-.js';
export { A as AgentContext, h as AgentFunction, g as AgentResult, i as AgentType, G as BaseJudge, F as BasicEvalCase, C as CodeGenEvalCase, t as EvalAgentType, j as EvalWorkspace, z as ExpectedPattern, x as ExpectedSkill, w as ExpectedToolCall, I as Judge, N as JudgeContext, Q as JudgeRegistry, J as JudgeResult, K as JudgeType, L as LearningConfig, M as MultiTurnEvalCase, P as ProgressRecord, u as ReferenceSolution, B as RoutingEvalCase, T as ToolCall, O as ToolCallRecord, y as ToolEvalCase, k as Transcript, m as TranscriptOutcome, l as TranscriptTurn, v as TrialConfig, D as Turn, V as VibeCheckConfig, H as agentResultToExecutionResult, f as defaultConfig, e as defineConfig, S as getJudgeRegistry, s as isBasicEval, o as isCodeGenEval, r as isMultiTurnEval, q as isRoutingEval, n as isToolEval, p as parseEvalCase, U as resetJudgeRegistry } from './judge-registry-BOraTQ7-.js';
import 'zod';

declare function loadConfig(configPath?: string): Promise<ResolvedConfig>;

interface EvalRunnerOptions {
    categories?: EvalCategory[];
    tags?: string[];
    ids?: string[];
}
/** @deprecated Use EvalRunnerOptions instead */
type RunnerOptions = EvalRunnerOptions;
interface EvalSuiteResult {
    runId: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
    passRate: number;
    results: EvalCaseResult[];
    duration: number;
    timestamp: string;
}
declare class EvalRunner {
    private config;
    private harness;
    constructor(config: ResolvedConfig);
    private verbose;
    run(options?: EvalRunnerOptions): Promise<EvalSuiteResult>;
    private runParallel;
    private runSequential;
    private runSingle;
    private runWithTrials;
    private runWithRetries;
    private getRetryDelay;
    private classifyError;
    private executeAndJudge;
    private runJudgesParallel;
    private runJudgesForMultiTurn;
    private evaluateJudgeWithRetry;
    private getJudgeIds;
    private sleep;
}

interface TestHarnessOptions {
    config: ResolvedConfig;
}
/** @deprecated Use TestHarnessOptions instead */
type HarnessOptions = TestHarnessOptions;
declare class TestHarness {
    private config;
    private workspaces;
    constructor(options: TestHarnessOptions);
    private verbose;
    execute(evalCase: EvalCase): Promise<ExecutionResult>;
    executeMultiTurn(evalCase: EvalCase & {
        category: 'multi-turn';
    }): Promise<ExecutionResult[]>;
    private getPrompt;
    private executeWithTimeout;
    cleanup(): Promise<void>;
    cleanupWorkspace(workspaceId: string): Promise<void>;
    private createDefaultWorkspace;
    private getWorkspaceBaseDir;
    private cleanupWorkspaceById;
    private extractToolCallsFromJsonl;
}

interface EvalLoadOptions {
    testDir: string;
    testMatch: string[];
    categories?: EvalCategory[];
    tags?: string[];
    ids?: string[];
    enabledOnly?: boolean;
}
/** @deprecated Use EvalLoadOptions instead */
type LoadOptions = EvalLoadOptions;
declare function loadEvalCases(options: EvalLoadOptions): Promise<EvalCase[]>;
declare function loadEvalCase(id: string, options: EvalLoadOptions): Promise<EvalCase | null>;
declare function groupByCategory(cases: EvalCase[]): Record<EvalCategory, EvalCase[]>;

interface EvalReportOptions {
    verbose?: boolean;
    showDetails?: boolean;
    format?: 'text' | 'json';
}
/** @deprecated Use EvalReportOptions instead */
type ReportOptions = EvalReportOptions;
interface CategorySummary {
    category: EvalCategory;
    total: number;
    passed: number;
    failed: number;
    errors: number;
    passRate: number;
}
interface ErrorSummary {
    type: ErrorType;
    count: number;
    examples: string[];
}
declare function formatDuration(ms: number): string;
declare function formatPassRate(rate: number): string;
declare function getStatusSymbol(success: boolean): string;
declare function summarizeByCategory(results: EvalCaseResult[]): CategorySummary[];
declare function summarizeErrors(results: EvalCaseResult[]): ErrorSummary[];
declare function printSummary(suiteResult: EvalSuiteResult, options?: EvalReportOptions): void;
declare function generateJsonReport(suiteResult: EvalSuiteResult): object;

interface AggregatedResult {
    evalId: string;
    evalName: string;
    runs: number;
    passes: number;
    failures: number;
    errors: number;
    passRate: number;
    avgDuration: number;
    flaky: boolean;
    flakinessScore: number;
}
interface AggregatedSummary {
    totalRuns: number;
    totalEvals: number;
    overallPassRate: number;
    avgPassRate: number;
    flakyEvals: number;
    results: AggregatedResult[];
}
declare function aggregateResults(suiteResults: EvalSuiteResult[]): AggregatedSummary;
declare function detectRegressions(current: EvalSuiteResult, baseline: EvalSuiteResult): {
    evalId: string;
    evalName: string;
    wasSuccess: boolean;
    isSuccess: boolean;
}[];
declare function calculateNonDeterminismMetrics(suiteResults: EvalSuiteResult[]): {
    totalEvals: number;
    deterministicEvals: number;
    nonDeterministicEvals: number;
    avgConsistency: number;
};

export { type AggregatedResult, type AggregatedSummary, type CategorySummary, type ErrorSummary, EvalCase, EvalCaseResult, EvalCategory, type EvalLoadOptions, type EvalReportOptions, EvalRunner, type EvalRunnerOptions, type EvalSuiteResult, ExecutionResult, type HarnessOptions, type LoadOptions, type ReportOptions, ResolvedConfig, type RunnerOptions, TestHarness, type TestHarnessOptions, aggregateResults, calculateNonDeterminismMetrics, detectRegressions, formatDuration, formatPassRate, generateJsonReport, getStatusSymbol, groupByCategory, loadConfig, loadEvalCase, loadEvalCases, printSummary, summarizeByCategory, summarizeErrors };
