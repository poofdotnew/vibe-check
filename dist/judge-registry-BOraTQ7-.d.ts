import { z } from 'zod';

declare const EvalCategorySchema: z.ZodEnum<["tool", "code-gen", "multi-turn", "routing", "basic"]>;
type EvalCategory = z.infer<typeof EvalCategorySchema>;
declare const EvalAgentTypeSchema: z.ZodEnum<["coding", "conversational", "research", "computer-use", "general"]>;
type EvalAgentType = z.infer<typeof EvalAgentTypeSchema>;
declare const ReferenceSolutionSchema: z.ZodObject<{
    files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    description: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    code?: string | undefined;
    files?: string[] | undefined;
    description?: string | undefined;
}, {
    code?: string | undefined;
    files?: string[] | undefined;
    description?: string | undefined;
}>;
type ReferenceSolution = z.infer<typeof ReferenceSolutionSchema>;
declare const TrialConfigSchema: z.ZodObject<{
    count: z.ZodDefault<z.ZodNumber>;
    passThreshold: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    count: number;
    passThreshold: number;
}, {
    count?: number | undefined;
    passThreshold?: number | undefined;
}>;
type TrialConfig = z.infer<typeof TrialConfigSchema>;
declare const ExpectedToolCallSchema: z.ZodObject<{
    toolName: z.ZodString;
    expectedInput: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    minCalls: z.ZodOptional<z.ZodNumber>;
    maxCalls: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    toolName: string;
    expectedInput?: Record<string, unknown> | undefined;
    minCalls?: number | undefined;
    maxCalls?: number | undefined;
}, {
    toolName: string;
    expectedInput?: Record<string, unknown> | undefined;
    minCalls?: number | undefined;
    maxCalls?: number | undefined;
}>;
type ExpectedToolCall = z.infer<typeof ExpectedToolCallSchema>;
declare const ExpectedSkillSchema: z.ZodObject<{
    skillName: z.ZodString;
    minCalls: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    minCalls: number;
    skillName: string;
}, {
    skillName: string;
    minCalls?: number | undefined;
}>;
type ExpectedSkill = z.infer<typeof ExpectedSkillSchema>;
declare const ToolEvalSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    timeout: z.ZodOptional<z.ZodNumber>;
    agentType: z.ZodOptional<z.ZodEnum<["coding", "conversational", "research", "computer-use", "general"]>>;
    trials: z.ZodOptional<z.ZodObject<{
        count: z.ZodDefault<z.ZodNumber>;
        passThreshold: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        count: number;
        passThreshold: number;
    }, {
        count?: number | undefined;
        passThreshold?: number | undefined;
    }>>;
    referenceSolution: z.ZodOptional<z.ZodObject<{
        files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        description: z.ZodOptional<z.ZodString>;
        code: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }>>;
} & {
    category: z.ZodLiteral<"tool">;
    prompt: z.ZodString;
    expectedToolCalls: z.ZodArray<z.ZodObject<{
        toolName: z.ZodString;
        expectedInput: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        minCalls: z.ZodOptional<z.ZodNumber>;
        maxCalls: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        toolName: string;
        expectedInput?: Record<string, unknown> | undefined;
        minCalls?: number | undefined;
        maxCalls?: number | undefined;
    }, {
        toolName: string;
        expectedInput?: Record<string, unknown> | undefined;
        minCalls?: number | undefined;
        maxCalls?: number | undefined;
    }>, "many">;
    expectedSkills: z.ZodOptional<z.ZodArray<z.ZodObject<{
        skillName: z.ZodString;
        minCalls: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        minCalls: number;
        skillName: string;
    }, {
        skillName: string;
        minCalls?: number | undefined;
    }>, "many">>;
    judges: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    description: string;
    id: string;
    name: string;
    category: "tool";
    enabled: boolean;
    prompt: string;
    expectedToolCalls: {
        toolName: string;
        expectedInput?: Record<string, unknown> | undefined;
        minCalls?: number | undefined;
        maxCalls?: number | undefined;
    }[];
    judges: string[];
    tags?: string[] | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count: number;
        passThreshold: number;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    expectedSkills?: {
        minCalls: number;
        skillName: string;
    }[] | undefined;
}, {
    description: string;
    id: string;
    name: string;
    category: "tool";
    prompt: string;
    expectedToolCalls: {
        toolName: string;
        expectedInput?: Record<string, unknown> | undefined;
        minCalls?: number | undefined;
        maxCalls?: number | undefined;
    }[];
    judges: string[];
    tags?: string[] | undefined;
    enabled?: boolean | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count?: number | undefined;
        passThreshold?: number | undefined;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    expectedSkills?: {
        skillName: string;
        minCalls?: number | undefined;
    }[] | undefined;
}>;
type ToolEvalCase = z.infer<typeof ToolEvalSchema>;
declare const ExpectedPatternSchema: z.ZodObject<{
    file: z.ZodString;
    patterns: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    file: string;
    patterns: string[];
}, {
    file: string;
    patterns: string[];
}>;
type ExpectedPattern = z.infer<typeof ExpectedPatternSchema>;
declare const CodeGenEvalSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    timeout: z.ZodOptional<z.ZodNumber>;
    agentType: z.ZodOptional<z.ZodEnum<["coding", "conversational", "research", "computer-use", "general"]>>;
    trials: z.ZodOptional<z.ZodObject<{
        count: z.ZodDefault<z.ZodNumber>;
        passThreshold: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        count: number;
        passThreshold: number;
    }, {
        count?: number | undefined;
        passThreshold?: number | undefined;
    }>>;
    referenceSolution: z.ZodOptional<z.ZodObject<{
        files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        description: z.ZodOptional<z.ZodString>;
        code: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }>>;
} & {
    category: z.ZodLiteral<"code-gen">;
    prompt: z.ZodString;
    targetFiles: z.ZodArray<z.ZodString, "many">;
    expectedPatterns: z.ZodOptional<z.ZodArray<z.ZodObject<{
        file: z.ZodString;
        patterns: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        file: string;
        patterns: string[];
    }, {
        file: string;
        patterns: string[];
    }>, "many">>;
    syntaxValidation: z.ZodDefault<z.ZodBoolean>;
    buildVerification: z.ZodDefault<z.ZodBoolean>;
    judges: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    description: string;
    id: string;
    name: string;
    category: "code-gen";
    enabled: boolean;
    prompt: string;
    judges: string[];
    targetFiles: string[];
    syntaxValidation: boolean;
    buildVerification: boolean;
    tags?: string[] | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count: number;
        passThreshold: number;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    expectedPatterns?: {
        file: string;
        patterns: string[];
    }[] | undefined;
}, {
    description: string;
    id: string;
    name: string;
    category: "code-gen";
    prompt: string;
    judges: string[];
    targetFiles: string[];
    tags?: string[] | undefined;
    enabled?: boolean | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count?: number | undefined;
        passThreshold?: number | undefined;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    expectedPatterns?: {
        file: string;
        patterns: string[];
    }[] | undefined;
    syntaxValidation?: boolean | undefined;
    buildVerification?: boolean | undefined;
}>;
type CodeGenEvalCase = z.infer<typeof CodeGenEvalSchema>;
declare const RoutingEvalSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    timeout: z.ZodOptional<z.ZodNumber>;
    agentType: z.ZodOptional<z.ZodEnum<["coding", "conversational", "research", "computer-use", "general"]>>;
    trials: z.ZodOptional<z.ZodObject<{
        count: z.ZodDefault<z.ZodNumber>;
        passThreshold: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        count: number;
        passThreshold: number;
    }, {
        count?: number | undefined;
        passThreshold?: number | undefined;
    }>>;
    referenceSolution: z.ZodOptional<z.ZodObject<{
        files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        description: z.ZodOptional<z.ZodString>;
        code: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }>>;
} & {
    category: z.ZodLiteral<"routing">;
    prompt: z.ZodString;
    expectedAgent: z.ZodString;
    shouldNotRoute: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    judges: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    description: string;
    id: string;
    name: string;
    category: "routing";
    enabled: boolean;
    prompt: string;
    judges: string[];
    expectedAgent: string;
    tags?: string[] | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count: number;
        passThreshold: number;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    shouldNotRoute?: string[] | undefined;
}, {
    description: string;
    id: string;
    name: string;
    category: "routing";
    prompt: string;
    judges: string[];
    expectedAgent: string;
    tags?: string[] | undefined;
    enabled?: boolean | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count?: number | undefined;
        passThreshold?: number | undefined;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    shouldNotRoute?: string[] | undefined;
}>;
type RoutingEvalCase = z.infer<typeof RoutingEvalSchema>;
declare const TurnSchema: z.ZodObject<{
    prompt: z.ZodString;
    expectedBehavior: z.ZodOptional<z.ZodString>;
    judges: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    prompt: string;
    judges?: string[] | undefined;
    expectedBehavior?: string | undefined;
}, {
    prompt: string;
    judges?: string[] | undefined;
    expectedBehavior?: string | undefined;
}>;
type Turn = z.infer<typeof TurnSchema>;
declare const MultiTurnEvalSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    timeout: z.ZodOptional<z.ZodNumber>;
    agentType: z.ZodOptional<z.ZodEnum<["coding", "conversational", "research", "computer-use", "general"]>>;
    trials: z.ZodOptional<z.ZodObject<{
        count: z.ZodDefault<z.ZodNumber>;
        passThreshold: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        count: number;
        passThreshold: number;
    }, {
        count?: number | undefined;
        passThreshold?: number | undefined;
    }>>;
    referenceSolution: z.ZodOptional<z.ZodObject<{
        files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        description: z.ZodOptional<z.ZodString>;
        code: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }>>;
} & {
    category: z.ZodLiteral<"multi-turn">;
    turns: z.ZodArray<z.ZodObject<{
        prompt: z.ZodString;
        expectedBehavior: z.ZodOptional<z.ZodString>;
        judges: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        prompt: string;
        judges?: string[] | undefined;
        expectedBehavior?: string | undefined;
    }, {
        prompt: string;
        judges?: string[] | undefined;
        expectedBehavior?: string | undefined;
    }>, "many">;
    sessionPersistence: z.ZodDefault<z.ZodBoolean>;
    contextValidation: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    judges: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    description: string;
    id: string;
    name: string;
    category: "multi-turn";
    enabled: boolean;
    turns: {
        prompt: string;
        judges?: string[] | undefined;
        expectedBehavior?: string | undefined;
    }[];
    sessionPersistence: boolean;
    tags?: string[] | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count: number;
        passThreshold: number;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    judges?: string[] | undefined;
    contextValidation?: string[] | undefined;
}, {
    description: string;
    id: string;
    name: string;
    category: "multi-turn";
    turns: {
        prompt: string;
        judges?: string[] | undefined;
        expectedBehavior?: string | undefined;
    }[];
    tags?: string[] | undefined;
    enabled?: boolean | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count?: number | undefined;
        passThreshold?: number | undefined;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    judges?: string[] | undefined;
    sessionPersistence?: boolean | undefined;
    contextValidation?: string[] | undefined;
}>;
type MultiTurnEvalCase = z.infer<typeof MultiTurnEvalSchema>;
declare const BasicEvalSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    timeout: z.ZodOptional<z.ZodNumber>;
    agentType: z.ZodOptional<z.ZodEnum<["coding", "conversational", "research", "computer-use", "general"]>>;
    trials: z.ZodOptional<z.ZodObject<{
        count: z.ZodDefault<z.ZodNumber>;
        passThreshold: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        count: number;
        passThreshold: number;
    }, {
        count?: number | undefined;
        passThreshold?: number | undefined;
    }>>;
    referenceSolution: z.ZodOptional<z.ZodObject<{
        files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        description: z.ZodOptional<z.ZodString>;
        code: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }>>;
} & {
    category: z.ZodLiteral<"basic">;
    prompt: z.ZodString;
    expectedBehavior: z.ZodOptional<z.ZodString>;
    judges: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    description: string;
    id: string;
    name: string;
    category: "basic";
    enabled: boolean;
    prompt: string;
    judges: string[];
    tags?: string[] | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count: number;
        passThreshold: number;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    expectedBehavior?: string | undefined;
}, {
    description: string;
    id: string;
    name: string;
    category: "basic";
    prompt: string;
    judges: string[];
    tags?: string[] | undefined;
    enabled?: boolean | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count?: number | undefined;
        passThreshold?: number | undefined;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    expectedBehavior?: string | undefined;
}>;
type BasicEvalCase = z.infer<typeof BasicEvalSchema>;
declare const EvalCaseSchema: z.ZodDiscriminatedUnion<"category", [z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    timeout: z.ZodOptional<z.ZodNumber>;
    agentType: z.ZodOptional<z.ZodEnum<["coding", "conversational", "research", "computer-use", "general"]>>;
    trials: z.ZodOptional<z.ZodObject<{
        count: z.ZodDefault<z.ZodNumber>;
        passThreshold: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        count: number;
        passThreshold: number;
    }, {
        count?: number | undefined;
        passThreshold?: number | undefined;
    }>>;
    referenceSolution: z.ZodOptional<z.ZodObject<{
        files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        description: z.ZodOptional<z.ZodString>;
        code: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }>>;
} & {
    category: z.ZodLiteral<"tool">;
    prompt: z.ZodString;
    expectedToolCalls: z.ZodArray<z.ZodObject<{
        toolName: z.ZodString;
        expectedInput: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        minCalls: z.ZodOptional<z.ZodNumber>;
        maxCalls: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        toolName: string;
        expectedInput?: Record<string, unknown> | undefined;
        minCalls?: number | undefined;
        maxCalls?: number | undefined;
    }, {
        toolName: string;
        expectedInput?: Record<string, unknown> | undefined;
        minCalls?: number | undefined;
        maxCalls?: number | undefined;
    }>, "many">;
    expectedSkills: z.ZodOptional<z.ZodArray<z.ZodObject<{
        skillName: z.ZodString;
        minCalls: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        minCalls: number;
        skillName: string;
    }, {
        skillName: string;
        minCalls?: number | undefined;
    }>, "many">>;
    judges: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    description: string;
    id: string;
    name: string;
    category: "tool";
    enabled: boolean;
    prompt: string;
    expectedToolCalls: {
        toolName: string;
        expectedInput?: Record<string, unknown> | undefined;
        minCalls?: number | undefined;
        maxCalls?: number | undefined;
    }[];
    judges: string[];
    tags?: string[] | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count: number;
        passThreshold: number;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    expectedSkills?: {
        minCalls: number;
        skillName: string;
    }[] | undefined;
}, {
    description: string;
    id: string;
    name: string;
    category: "tool";
    prompt: string;
    expectedToolCalls: {
        toolName: string;
        expectedInput?: Record<string, unknown> | undefined;
        minCalls?: number | undefined;
        maxCalls?: number | undefined;
    }[];
    judges: string[];
    tags?: string[] | undefined;
    enabled?: boolean | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count?: number | undefined;
        passThreshold?: number | undefined;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    expectedSkills?: {
        skillName: string;
        minCalls?: number | undefined;
    }[] | undefined;
}>, z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    timeout: z.ZodOptional<z.ZodNumber>;
    agentType: z.ZodOptional<z.ZodEnum<["coding", "conversational", "research", "computer-use", "general"]>>;
    trials: z.ZodOptional<z.ZodObject<{
        count: z.ZodDefault<z.ZodNumber>;
        passThreshold: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        count: number;
        passThreshold: number;
    }, {
        count?: number | undefined;
        passThreshold?: number | undefined;
    }>>;
    referenceSolution: z.ZodOptional<z.ZodObject<{
        files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        description: z.ZodOptional<z.ZodString>;
        code: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }>>;
} & {
    category: z.ZodLiteral<"code-gen">;
    prompt: z.ZodString;
    targetFiles: z.ZodArray<z.ZodString, "many">;
    expectedPatterns: z.ZodOptional<z.ZodArray<z.ZodObject<{
        file: z.ZodString;
        patterns: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        file: string;
        patterns: string[];
    }, {
        file: string;
        patterns: string[];
    }>, "many">>;
    syntaxValidation: z.ZodDefault<z.ZodBoolean>;
    buildVerification: z.ZodDefault<z.ZodBoolean>;
    judges: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    description: string;
    id: string;
    name: string;
    category: "code-gen";
    enabled: boolean;
    prompt: string;
    judges: string[];
    targetFiles: string[];
    syntaxValidation: boolean;
    buildVerification: boolean;
    tags?: string[] | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count: number;
        passThreshold: number;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    expectedPatterns?: {
        file: string;
        patterns: string[];
    }[] | undefined;
}, {
    description: string;
    id: string;
    name: string;
    category: "code-gen";
    prompt: string;
    judges: string[];
    targetFiles: string[];
    tags?: string[] | undefined;
    enabled?: boolean | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count?: number | undefined;
        passThreshold?: number | undefined;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    expectedPatterns?: {
        file: string;
        patterns: string[];
    }[] | undefined;
    syntaxValidation?: boolean | undefined;
    buildVerification?: boolean | undefined;
}>, z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    timeout: z.ZodOptional<z.ZodNumber>;
    agentType: z.ZodOptional<z.ZodEnum<["coding", "conversational", "research", "computer-use", "general"]>>;
    trials: z.ZodOptional<z.ZodObject<{
        count: z.ZodDefault<z.ZodNumber>;
        passThreshold: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        count: number;
        passThreshold: number;
    }, {
        count?: number | undefined;
        passThreshold?: number | undefined;
    }>>;
    referenceSolution: z.ZodOptional<z.ZodObject<{
        files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        description: z.ZodOptional<z.ZodString>;
        code: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }>>;
} & {
    category: z.ZodLiteral<"routing">;
    prompt: z.ZodString;
    expectedAgent: z.ZodString;
    shouldNotRoute: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    judges: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    description: string;
    id: string;
    name: string;
    category: "routing";
    enabled: boolean;
    prompt: string;
    judges: string[];
    expectedAgent: string;
    tags?: string[] | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count: number;
        passThreshold: number;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    shouldNotRoute?: string[] | undefined;
}, {
    description: string;
    id: string;
    name: string;
    category: "routing";
    prompt: string;
    judges: string[];
    expectedAgent: string;
    tags?: string[] | undefined;
    enabled?: boolean | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count?: number | undefined;
        passThreshold?: number | undefined;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    shouldNotRoute?: string[] | undefined;
}>, z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    timeout: z.ZodOptional<z.ZodNumber>;
    agentType: z.ZodOptional<z.ZodEnum<["coding", "conversational", "research", "computer-use", "general"]>>;
    trials: z.ZodOptional<z.ZodObject<{
        count: z.ZodDefault<z.ZodNumber>;
        passThreshold: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        count: number;
        passThreshold: number;
    }, {
        count?: number | undefined;
        passThreshold?: number | undefined;
    }>>;
    referenceSolution: z.ZodOptional<z.ZodObject<{
        files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        description: z.ZodOptional<z.ZodString>;
        code: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }>>;
} & {
    category: z.ZodLiteral<"multi-turn">;
    turns: z.ZodArray<z.ZodObject<{
        prompt: z.ZodString;
        expectedBehavior: z.ZodOptional<z.ZodString>;
        judges: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        prompt: string;
        judges?: string[] | undefined;
        expectedBehavior?: string | undefined;
    }, {
        prompt: string;
        judges?: string[] | undefined;
        expectedBehavior?: string | undefined;
    }>, "many">;
    sessionPersistence: z.ZodDefault<z.ZodBoolean>;
    contextValidation: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    judges: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    description: string;
    id: string;
    name: string;
    category: "multi-turn";
    enabled: boolean;
    turns: {
        prompt: string;
        judges?: string[] | undefined;
        expectedBehavior?: string | undefined;
    }[];
    sessionPersistence: boolean;
    tags?: string[] | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count: number;
        passThreshold: number;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    judges?: string[] | undefined;
    contextValidation?: string[] | undefined;
}, {
    description: string;
    id: string;
    name: string;
    category: "multi-turn";
    turns: {
        prompt: string;
        judges?: string[] | undefined;
        expectedBehavior?: string | undefined;
    }[];
    tags?: string[] | undefined;
    enabled?: boolean | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count?: number | undefined;
        passThreshold?: number | undefined;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    judges?: string[] | undefined;
    sessionPersistence?: boolean | undefined;
    contextValidation?: string[] | undefined;
}>, z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    timeout: z.ZodOptional<z.ZodNumber>;
    agentType: z.ZodOptional<z.ZodEnum<["coding", "conversational", "research", "computer-use", "general"]>>;
    trials: z.ZodOptional<z.ZodObject<{
        count: z.ZodDefault<z.ZodNumber>;
        passThreshold: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        count: number;
        passThreshold: number;
    }, {
        count?: number | undefined;
        passThreshold?: number | undefined;
    }>>;
    referenceSolution: z.ZodOptional<z.ZodObject<{
        files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        description: z.ZodOptional<z.ZodString>;
        code: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }, {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    }>>;
} & {
    category: z.ZodLiteral<"basic">;
    prompt: z.ZodString;
    expectedBehavior: z.ZodOptional<z.ZodString>;
    judges: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    description: string;
    id: string;
    name: string;
    category: "basic";
    enabled: boolean;
    prompt: string;
    judges: string[];
    tags?: string[] | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count: number;
        passThreshold: number;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    expectedBehavior?: string | undefined;
}, {
    description: string;
    id: string;
    name: string;
    category: "basic";
    prompt: string;
    judges: string[];
    tags?: string[] | undefined;
    enabled?: boolean | undefined;
    timeout?: number | undefined;
    agentType?: "coding" | "conversational" | "research" | "computer-use" | "general" | undefined;
    trials?: {
        count?: number | undefined;
        passThreshold?: number | undefined;
    } | undefined;
    referenceSolution?: {
        code?: string | undefined;
        files?: string[] | undefined;
        description?: string | undefined;
    } | undefined;
    expectedBehavior?: string | undefined;
}>]>;
type EvalCase = z.infer<typeof EvalCaseSchema>;
declare function parseEvalCase(data: unknown): EvalCase;
declare function isToolEval(evalCase: EvalCase): evalCase is ToolEvalCase;
declare function isCodeGenEval(evalCase: EvalCase): evalCase is CodeGenEvalCase;
declare function isRoutingEval(evalCase: EvalCase): evalCase is RoutingEvalCase;
declare function isMultiTurnEval(evalCase: EvalCase): evalCase is MultiTurnEvalCase;
declare function isBasicEval(evalCase: EvalCase): evalCase is BasicEvalCase;
interface JudgeResult {
    judgeId: string;
    passed: boolean;
    score: number;
    confidence: number;
    reasoning: string;
    details?: Record<string, unknown>;
}
type ErrorType = 'api' | 'timeout' | 'judge' | 'unknown';
interface EvalCaseResult {
    evalCase: EvalCase;
    success: boolean;
    output: string;
    duration: number;
    judgeResults: JudgeResult[];
    toolCalls?: Array<{
        toolName: string;
        input: unknown;
        output?: unknown;
        isError?: boolean;
        timestamp?: number;
        duration?: number;
    }>;
    error?: Error;
    errorType?: ErrorType;
    retryCount?: number;
    trialResults?: boolean[];
    /** Whether this test passed on a retry (indicates flaky test) */
    flaky?: boolean;
    /** Error messages from each failed retry attempt */
    retryErrors?: string[];
}

interface ExecutionResult {
    success: boolean;
    output: string;
    error?: Error;
    toolCalls: ToolCallRecord[];
    duration: number;
    numTurns?: number;
    sessionId?: string;
    workingDirectory?: string;
    workspaceId?: string;
    transcript?: Transcript;
    progressUpdates?: ProgressRecord[];
    usage?: {
        inputTokens: number;
        outputTokens: number;
        totalCostUsd?: number;
    };
}
interface ToolCallRecord {
    toolName: string;
    toolUseId?: string;
    input: unknown;
    output?: unknown;
    timestamp?: number;
    duration?: number;
    isError?: boolean;
}
interface JudgeContext {
    evalCase: EvalCase;
    executionResult: ExecutionResult;
    workingDirectory: string;
    turnIndex?: number;
}
type JudgeType = 'code' | 'llm' | 'hybrid';
interface Judge {
    id: string;
    name: string;
    type: JudgeType;
    evaluate(context: JudgeContext): Promise<JudgeResult>;
}
declare abstract class BaseJudge implements Judge {
    abstract id: string;
    abstract name: string;
    abstract type: JudgeType;
    abstract evaluate(context: JudgeContext): Promise<JudgeResult>;
    protected createResult(params: {
        passed: boolean;
        score: number;
        reasoning: string;
        confidence?: number;
        details?: Record<string, unknown>;
    }): JudgeResult;
    protected notApplicable(reason?: string): JudgeResult;
}
declare function agentResultToExecutionResult(result: AgentResult): ExecutionResult;

interface EvalWorkspace {
    id: string;
    path: string;
}
interface ToolCall {
    toolName: string;
    input: unknown;
    output?: unknown;
    isError?: boolean;
    timestamp?: number;
    duration?: number;
}
interface ProgressRecord {
    type: string;
    percentage: number;
    description: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
}
interface TranscriptTurn {
    role: 'user' | 'assistant';
    content: string;
    toolCalls?: ToolCall[];
    reasoning?: string;
    timestamp: number;
}
interface TranscriptOutcome {
    files: string[];
    success: boolean;
    error?: string;
    finalState?: Record<string, unknown>;
}
interface Transcript {
    turns: TranscriptTurn[];
    outcome: TranscriptOutcome;
    duration: number;
    startTime: number;
    endTime: number;
}
interface AgentContext {
    workingDirectory: string;
    evalId: string;
    evalName: string;
    sessionId?: string;
    timeout?: number;
}
interface AgentResult {
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
type AgentFunction = (prompt: string, context: AgentContext) => Promise<AgentResult>;
type AgentType = 'claude-code' | 'generic';
interface LearningConfig {
    enabled?: boolean;
    ruleOutputDir?: string;
    minFailuresForPattern?: number;
    similarityThreshold?: number;
    maxRulesPerIteration?: number;
    minRuleConfidence?: number;
    autoApprove?: boolean;
    autoApproveThreshold?: number;
}
interface VibeCheckConfig {
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
interface ResolvedConfig extends Required<Omit<VibeCheckConfig, 'setup' | 'teardown' | 'beforeEach' | 'afterEach' | 'learning' | 'judges' | 'createWorkspace' | 'cleanupWorkspace'>> {
    setup?: () => Promise<void>;
    teardown?: () => Promise<void>;
    beforeEach?: (evalCase: EvalCase) => Promise<void>;
    afterEach?: (result: EvalCaseResult) => Promise<void>;
    learning: Required<LearningConfig>;
    judges: Judge[];
    createWorkspace?: () => Promise<EvalWorkspace>;
    cleanupWorkspace?: (workspace: EvalWorkspace) => Promise<void>;
}
declare function defineConfig(config: VibeCheckConfig): VibeCheckConfig;
declare const defaultConfig: Omit<ResolvedConfig, 'agent'>;

declare class JudgeRegistry {
    private judges;
    constructor();
    private registerBuiltInJudges;
    register(judge: Judge): void;
    /** @internal Used for testing only */
    unregister(id: string): boolean;
    get(id: string): Judge | undefined;
    has(id: string): boolean;
    list(): string[];
    /** @internal Used for testing only */
    listByType(type: JudgeType): string[];
    /** @internal Used for testing only */
    getAll(): Judge[];
}
declare function getJudgeRegistry(): JudgeRegistry;
/** @internal Used for testing only */
declare function resetJudgeRegistry(): void;

export { type AgentContext as A, type RoutingEvalCase as B, type CodeGenEvalCase as C, type Turn as D, type EvalCategory as E, type BasicEvalCase as F, BaseJudge as G, agentResultToExecutionResult as H, type Judge as I, type JudgeResult as J, type JudgeType as K, type LearningConfig as L, type MultiTurnEvalCase as M, type JudgeContext as N, type ToolCallRecord as O, type ProgressRecord as P, JudgeRegistry as Q, type ResolvedConfig as R, getJudgeRegistry as S, type ToolCall as T, resetJudgeRegistry as U, type VibeCheckConfig as V, type EvalCaseResult as a, type EvalCase as b, type ExecutionResult as c, type ErrorType as d, defineConfig as e, defaultConfig as f, type AgentResult as g, type AgentFunction as h, type AgentType as i, type EvalWorkspace as j, type Transcript as k, type TranscriptTurn as l, type TranscriptOutcome as m, isToolEval as n, isCodeGenEval as o, parseEvalCase as p, isRoutingEval as q, isMultiTurnEval as r, isBasicEval as s, type EvalAgentType as t, type ReferenceSolution as u, type TrialConfig as v, type ExpectedToolCall as w, type ExpectedSkill as x, type ToolEvalCase as y, type ExpectedPattern as z };
