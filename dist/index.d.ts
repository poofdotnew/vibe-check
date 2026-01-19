import { R as ResolvedConfig, E as EvalCategory, a as EvalCaseResult, b as EvalCase, c as ExecutionResult } from './judge-registry-BqFLuLcc.js';
export { A as AgentContext, g as AgentFunction, f as AgentResult, h as AgentType, x as BaseJudge, B as BasicEvalCase, C as CodeGenEvalCase, n as EvalAgentType, u as ExpectedPattern, s as ExpectedSkill, r as ExpectedToolCall, z as Judge, F as JudgeContext, H as JudgeRegistry, J as JudgeResult, D as JudgeType, L as LearningConfig, M as MultiTurnEvalCase, o as ReferenceSolution, v as RoutingEvalCase, T as ToolCall, G as ToolCallRecord, t as ToolEvalCase, q as TrialConfig, w as Turn, V as VibeCheckConfig, y as agentResultToExecutionResult, e as defaultConfig, d as defineConfig, I as getJudgeRegistry, m as isBasicEval, j as isCodeGenEval, l as isMultiTurnEval, k as isRoutingEval, i as isToolEval, p as parseEvalCase, K as resetJudgeRegistry } from './judge-registry-BqFLuLcc.js';
import 'zod';

declare function loadConfig(configPath?: string): Promise<ResolvedConfig>;

interface RunnerOptions {
    categories?: EvalCategory[];
    tags?: string[];
    ids?: string[];
}
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
    run(options?: RunnerOptions): Promise<EvalSuiteResult>;
    private runParallel;
    private runSequential;
    private runSingle;
    private runWithRetries;
    private executeAndJudge;
    private runJudges;
    private getJudgeIds;
    private sleep;
}

interface EvalWorkspace {
    id: string;
    path: string;
    createdAt: Date;
}
declare class WorkspaceManager {
    private workspaces;
    private baseDir;
    constructor(baseDir?: string);
    createWorkspace(template?: string): Promise<EvalWorkspace>;
    private installDependencies;
    private createMinimalStructure;
    private copyTemplate;
    private copyDir;
    cleanupWorkspace(id: string): Promise<void>;
    cleanupAll(): Promise<void>;
    getWorkspace(id: string): EvalWorkspace | undefined;
    listWorkspaces(): EvalWorkspace[];
}

interface HarnessOptions {
    config: ResolvedConfig;
    workspaceManager?: WorkspaceManager;
}
declare class TestHarness {
    private config;
    private workspaceManager;
    constructor(options: HarnessOptions);
    execute(evalCase: EvalCase): Promise<ExecutionResult>;
    executeMultiTurn(evalCase: EvalCase & {
        category: 'multi-turn';
    }): Promise<ExecutionResult[]>;
    private getPrompt;
    private executeWithTimeout;
    cleanup(): Promise<void>;
}

interface LoadOptions {
    testDir: string;
    testMatch: string[];
    categories?: EvalCategory[];
    tags?: string[];
    ids?: string[];
    enabledOnly?: boolean;
}
declare function loadEvalCases(options: LoadOptions): Promise<EvalCase[]>;
declare function loadEvalCase(id: string, options: LoadOptions): Promise<EvalCase | null>;
declare function groupByCategory(cases: EvalCase[]): Record<EvalCategory, EvalCase[]>;

export { EvalCase, EvalCaseResult, EvalCategory, EvalRunner, type EvalSuiteResult, type EvalWorkspace, ExecutionResult, type HarnessOptions, type LoadOptions, ResolvedConfig, type RunnerOptions, TestHarness, WorkspaceManager, groupByCategory, loadConfig, loadEvalCase, loadEvalCases };
