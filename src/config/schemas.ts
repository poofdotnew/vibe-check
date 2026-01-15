import { z } from 'zod';

export const EvalCategorySchema = z.enum(['tool', 'code-gen', 'multi-turn', 'routing', 'basic']);
export type EvalCategory = z.infer<typeof EvalCategorySchema>;

export const EvalAgentTypeSchema = z.enum(['coding', 'conversational', 'research', 'computer-use', 'general']);
export type EvalAgentType = z.infer<typeof EvalAgentTypeSchema>;

export const ReferenceSolutionSchema = z.object({
  files: z.array(z.string()).optional(),
  description: z.string().optional(),
  code: z.string().optional(),
});
export type ReferenceSolution = z.infer<typeof ReferenceSolutionSchema>;

export const TrialConfigSchema = z.object({
  count: z.number().min(1).max(10).default(1),
  passThreshold: z.number().min(0).max(1).default(0.5),
});
export type TrialConfig = z.infer<typeof TrialConfigSchema>;

const BaseEvalCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: EvalCategorySchema,
  tags: z.array(z.string()).optional(),
  enabled: z.boolean().default(true),
  timeout: z.number().optional(),
  agentType: EvalAgentTypeSchema.optional(),
  trials: TrialConfigSchema.optional(),
  referenceSolution: ReferenceSolutionSchema.optional(),
});

export const ExpectedToolCallSchema = z.object({
  toolName: z.string(),
  expectedInput: z.record(z.unknown()).optional(),
  minCalls: z.number().optional(),
  maxCalls: z.number().optional(),
});
export type ExpectedToolCall = z.infer<typeof ExpectedToolCallSchema>;

export const ExpectedSkillSchema = z.object({
  skillName: z.string(),
  minCalls: z.number().optional().default(1),
});
export type ExpectedSkill = z.infer<typeof ExpectedSkillSchema>;

export const ToolEvalSchema = BaseEvalCaseSchema.extend({
  category: z.literal('tool'),
  prompt: z.string(),
  expectedToolCalls: z.array(ExpectedToolCallSchema),
  expectedSkills: z.array(ExpectedSkillSchema).optional(),
  judges: z.array(z.string()),
});
export type ToolEvalCase = z.infer<typeof ToolEvalSchema>;

export const ExpectedPatternSchema = z.object({
  file: z.string(),
  patterns: z.array(z.string()),
});
export type ExpectedPattern = z.infer<typeof ExpectedPatternSchema>;

export const CodeGenEvalSchema = BaseEvalCaseSchema.extend({
  category: z.literal('code-gen'),
  prompt: z.string(),
  targetFiles: z.array(z.string()),
  expectedPatterns: z.array(ExpectedPatternSchema).optional(),
  syntaxValidation: z.boolean().default(true),
  buildVerification: z.boolean().default(false),
  judges: z.array(z.string()),
});
export type CodeGenEvalCase = z.infer<typeof CodeGenEvalSchema>;

export const RoutingEvalSchema = BaseEvalCaseSchema.extend({
  category: z.literal('routing'),
  prompt: z.string(),
  expectedAgent: z.string(),
  shouldNotRoute: z.array(z.string()).optional(),
  judges: z.array(z.string()),
});
export type RoutingEvalCase = z.infer<typeof RoutingEvalSchema>;

export const TurnSchema = z.object({
  prompt: z.string(),
  expectedBehavior: z.string().optional(),
  judges: z.array(z.string()).optional(),
});
export type Turn = z.infer<typeof TurnSchema>;

export const MultiTurnEvalSchema = BaseEvalCaseSchema.extend({
  category: z.literal('multi-turn'),
  turns: z.array(TurnSchema),
  sessionPersistence: z.boolean().default(true),
  contextValidation: z.array(z.string()).optional(),
  judges: z.array(z.string()).optional(),
});
export type MultiTurnEvalCase = z.infer<typeof MultiTurnEvalSchema>;

export const BasicEvalSchema = BaseEvalCaseSchema.extend({
  category: z.literal('basic'),
  prompt: z.string(),
  expectedBehavior: z.string().optional(),
  judges: z.array(z.string()),
});
export type BasicEvalCase = z.infer<typeof BasicEvalSchema>;

export const EvalCaseSchema = z.discriminatedUnion('category', [
  ToolEvalSchema,
  CodeGenEvalSchema,
  RoutingEvalSchema,
  MultiTurnEvalSchema,
  BasicEvalSchema,
]);
export type EvalCase = z.infer<typeof EvalCaseSchema>;

export function parseEvalCase(data: unknown): EvalCase {
  return EvalCaseSchema.parse(data);
}

export function isToolEval(evalCase: EvalCase): evalCase is ToolEvalCase {
  return evalCase.category === 'tool';
}

export function isCodeGenEval(evalCase: EvalCase): evalCase is CodeGenEvalCase {
  return evalCase.category === 'code-gen';
}

export function isRoutingEval(evalCase: EvalCase): evalCase is RoutingEvalCase {
  return evalCase.category === 'routing';
}

export function isMultiTurnEval(evalCase: EvalCase): evalCase is MultiTurnEvalCase {
  return evalCase.category === 'multi-turn';
}

export function isBasicEval(evalCase: EvalCase): evalCase is BasicEvalCase {
  return evalCase.category === 'basic';
}

export interface JudgeResult {
  judgeId: string;
  passed: boolean;
  score: number;
  confidence: number;
  reasoning: string;
  details?: Record<string, unknown>;
}

export interface EvalCaseResult {
  evalCase: EvalCase;
  success: boolean;
  output: string;
  duration: number;
  judgeResults: JudgeResult[];
  toolCalls?: Array<{ toolName: string; input: unknown; output?: unknown; isError?: boolean }>;
  error?: Error;
  retryCount?: number;
  trialResults?: boolean[];
}
