import { G as BaseJudge, K as JudgeType, N as JudgeContext, J as JudgeResult } from '../judge-registry-BOraTQ7-.js';
export { c as ExecutionResult, I as Judge, Q as JudgeRegistry, O as ToolCallRecord, H as agentResultToExecutionResult, S as getJudgeRegistry, U as resetJudgeRegistry } from '../judge-registry-BOraTQ7-.js';
import 'zod';

declare class FileExistenceJudge extends BaseJudge {
    id: string;
    name: string;
    type: JudgeType;
    evaluate(context: JudgeContext): Promise<JudgeResult>;
}

declare class ToolInvocationJudge extends BaseJudge {
    id: string;
    name: string;
    type: JudgeType;
    evaluate(context: JudgeContext): Promise<JudgeResult>;
}

declare class PatternMatchJudge extends BaseJudge {
    id: string;
    name: string;
    type: JudgeType;
    evaluate(context: JudgeContext): Promise<JudgeResult>;
}

interface AgentRoutingJudgeOptions {
    workTypeKeywords?: Record<string, string[]>;
}
declare class AgentRoutingJudge extends BaseJudge {
    id: string;
    name: string;
    type: JudgeType;
    private workTypeKeywords;
    constructor(options?: AgentRoutingJudgeOptions);
    evaluate(context: JudgeContext): Promise<JudgeResult>;
    private extractAgentsFromJsonl;
    private checkDelegationIntent;
    private checkWorkType;
}

declare class SkillInvocationJudge extends BaseJudge {
    id: string;
    name: string;
    type: JudgeType;
    evaluate(context: JudgeContext): Promise<JudgeResult>;
    private extractSkillCallsFromToolCalls;
    private extractSkillCallsFromJsonl;
}

declare class SyntaxValidationJudge extends BaseJudge {
    id: string;
    name: string;
    type: JudgeType;
    evaluate(context: JudgeContext): Promise<JudgeResult>;
    private validateSyntax;
}

interface Rubric {
    id: string;
    content: string;
}
interface LLMJudgeOptions {
    rubricsDir?: string;
    model?: string;
}
declare function loadRubric(rubricPath: string, rubricsDir?: string): Promise<Rubric>;
declare class LLMJudge extends BaseJudge {
    id: string;
    name: string;
    type: JudgeType;
    private rubricPath;
    private anthropic;
    private rubricsDir;
    private model;
    constructor(id: string, rubricPath: string, options?: LLMJudgeOptions);
    evaluate(context: JudgeContext): Promise<JudgeResult>;
    private readReferenceFiles;
    private buildPairwisePrompt;
    private readTargetFiles;
    private buildPrompt;
    private parseResponse;
    private formatToolCalls;
}
declare function createLLMCodeQualityJudge(options?: LLMJudgeOptions): LLMJudge;
declare function createLLMRoutingQualityJudge(options?: LLMJudgeOptions): LLMJudge;
declare function createLLMResponseQualityJudge(options?: LLMJudgeOptions): LLMJudge;
declare function createLLMConversationQualityJudge(options?: LLMJudgeOptions): LLMJudge;

export { AgentRoutingJudge, type AgentRoutingJudgeOptions, BaseJudge, FileExistenceJudge, JudgeContext, JudgeResult, JudgeType, LLMJudge, type LLMJudgeOptions, PatternMatchJudge, type Rubric, SkillInvocationJudge, SyntaxValidationJudge, ToolInvocationJudge, createLLMCodeQualityJudge, createLLMConversationQualityJudge, createLLMResponseQualityJudge, createLLMRoutingQualityJudge, loadRubric };
