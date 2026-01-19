import { x as BaseJudge, D as JudgeType, F as JudgeContext, J as JudgeResult } from '../judge-registry-BqFLuLcc.js';
export { c as ExecutionResult, z as Judge, H as JudgeRegistry, G as ToolCallRecord, y as agentResultToExecutionResult, I as getJudgeRegistry, K as resetJudgeRegistry } from '../judge-registry-BqFLuLcc.js';
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

export { BaseJudge, FileExistenceJudge, JudgeContext, JudgeResult, JudgeType, PatternMatchJudge, ToolInvocationJudge };
