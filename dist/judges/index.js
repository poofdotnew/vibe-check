import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';

// src/judges/judge-interface.ts
var BaseJudge = class {
  createResult(params) {
    return {
      judgeId: this.id,
      passed: params.passed,
      score: params.score,
      confidence: params.confidence ?? 1,
      reasoning: params.reasoning,
      details: params.details
    };
  }
  notApplicable(reason = "Not applicable") {
    return this.createResult({
      passed: true,
      score: 100,
      reasoning: reason
    });
  }
};
function agentResultToExecutionResult(result) {
  return {
    success: result.success,
    output: result.output,
    error: result.error,
    toolCalls: (result.toolCalls ?? []).map((tc) => ({
      toolName: tc.toolName,
      input: tc.input,
      output: tc.output,
      isError: tc.isError
    })),
    duration: result.duration ?? 0,
    numTurns: result.numTurns,
    sessionId: result.sessionId,
    usage: result.usage
  };
}
var EvalCategorySchema = z.enum(["tool", "code-gen", "multi-turn", "routing", "basic"]);
var EvalAgentTypeSchema = z.enum(["coding", "conversational", "research", "computer-use", "general"]);
var ReferenceSolutionSchema = z.object({
  files: z.array(z.string()).optional(),
  description: z.string().optional(),
  code: z.string().optional()
});
var TrialConfigSchema = z.object({
  count: z.number().min(1).max(10).default(1),
  passThreshold: z.number().min(0).max(1).default(0.5)
});
var BaseEvalCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: EvalCategorySchema,
  tags: z.array(z.string()).optional(),
  enabled: z.boolean().default(true),
  timeout: z.number().optional(),
  agentType: EvalAgentTypeSchema.optional(),
  trials: TrialConfigSchema.optional(),
  referenceSolution: ReferenceSolutionSchema.optional()
});
var ExpectedToolCallSchema = z.object({
  toolName: z.string(),
  expectedInput: z.record(z.unknown()).optional(),
  minCalls: z.number().optional(),
  maxCalls: z.number().optional()
});
var ExpectedSkillSchema = z.object({
  skillName: z.string(),
  minCalls: z.number().optional().default(1)
});
var ToolEvalSchema = BaseEvalCaseSchema.extend({
  category: z.literal("tool"),
  prompt: z.string(),
  expectedToolCalls: z.array(ExpectedToolCallSchema),
  expectedSkills: z.array(ExpectedSkillSchema).optional(),
  judges: z.array(z.string())
});
var ExpectedPatternSchema = z.object({
  file: z.string(),
  patterns: z.array(z.string())
});
var CodeGenEvalSchema = BaseEvalCaseSchema.extend({
  category: z.literal("code-gen"),
  prompt: z.string(),
  targetFiles: z.array(z.string()),
  expectedPatterns: z.array(ExpectedPatternSchema).optional(),
  syntaxValidation: z.boolean().default(true),
  buildVerification: z.boolean().default(false),
  judges: z.array(z.string())
});
var RoutingEvalSchema = BaseEvalCaseSchema.extend({
  category: z.literal("routing"),
  prompt: z.string(),
  expectedAgent: z.string(),
  shouldNotRoute: z.array(z.string()).optional(),
  judges: z.array(z.string())
});
var TurnSchema = z.object({
  prompt: z.string(),
  expectedBehavior: z.string().optional(),
  judges: z.array(z.string()).optional()
});
var MultiTurnEvalSchema = BaseEvalCaseSchema.extend({
  category: z.literal("multi-turn"),
  turns: z.array(TurnSchema),
  sessionPersistence: z.boolean().default(true),
  contextValidation: z.array(z.string()).optional(),
  judges: z.array(z.string()).optional()
});
var BasicEvalSchema = BaseEvalCaseSchema.extend({
  category: z.literal("basic"),
  prompt: z.string(),
  expectedBehavior: z.string().optional(),
  judges: z.array(z.string())
});
z.discriminatedUnion("category", [
  ToolEvalSchema,
  CodeGenEvalSchema,
  RoutingEvalSchema,
  MultiTurnEvalSchema,
  BasicEvalSchema
]);
function isToolEval(evalCase) {
  return evalCase.category === "tool";
}
function isCodeGenEval(evalCase) {
  return evalCase.category === "code-gen";
}

// src/judges/builtin/file-existence.ts
var FileExistenceJudge = class extends BaseJudge {
  id = "file-existence";
  name = "File Existence Judge";
  type = "code";
  async evaluate(context) {
    const { evalCase, workingDirectory } = context;
    if (!isCodeGenEval(evalCase)) {
      return this.notApplicable("Only applicable for code-gen evals");
    }
    const targetFiles = evalCase.targetFiles || [];
    if (targetFiles.length === 0) {
      return this.notApplicable("No target files specified");
    }
    const baseDir = workingDirectory || process.cwd();
    const results = [];
    for (const file of targetFiles) {
      const fullPath = path.join(baseDir, file);
      try {
        await fs.access(fullPath);
        results.push({ file, exists: true });
      } catch {
        results.push({ file, exists: false });
      }
    }
    const existingCount = results.filter((r) => r.exists).length;
    const score = existingCount / targetFiles.length * 100;
    const passed = score >= 80;
    const missingFiles = results.filter((r) => !r.exists).map((r) => r.file);
    return this.createResult({
      passed,
      score,
      reasoning: missingFiles.length > 0 ? `${existingCount}/${targetFiles.length} expected files exist. Missing: ${missingFiles.join(", ")}` : `All ${targetFiles.length} expected files exist`,
      details: { results, missingFiles }
    });
  }
};

// src/judges/builtin/tool-invocation.ts
var ToolInvocationJudge = class extends BaseJudge {
  id = "tool-invocation";
  name = "Tool Invocation Judge";
  type = "code";
  async evaluate(context) {
    const { executionResult, evalCase } = context;
    if (!isToolEval(evalCase)) {
      return this.notApplicable("Only applicable for tool evals");
    }
    const expectedCalls = evalCase.expectedToolCalls || [];
    if (expectedCalls.length === 0) {
      return this.notApplicable("No expected tool calls specified");
    }
    const actualCalls = executionResult.toolCalls || [];
    const toolCallCounts = /* @__PURE__ */ new Map();
    for (const call of actualCalls) {
      const count = toolCallCounts.get(call.toolName) || 0;
      toolCallCounts.set(call.toolName, count + 1);
    }
    const stats = [];
    for (const expected of expectedCalls) {
      const actualCount = toolCallCounts.get(expected.toolName) || 0;
      const minCalls = expected.minCalls ?? 1;
      const maxCalls = expected.maxCalls ?? Infinity;
      let passed2 = true;
      let reason = "";
      if (actualCount < minCalls) {
        passed2 = false;
        reason = `Expected at least ${minCalls} call(s), got ${actualCount}`;
      } else if (actualCount > maxCalls) {
        passed2 = false;
        reason = `Expected at most ${maxCalls} call(s), got ${actualCount}`;
      } else {
        reason = `Called ${actualCount} time(s)`;
      }
      stats.push({
        toolName: expected.toolName,
        expected,
        actualCount,
        passed: passed2,
        reason
      });
    }
    const passedCount = stats.filter((s) => s.passed).length;
    const score = passedCount / stats.length * 100;
    const passed = passedCount === stats.length;
    const failedTools = stats.filter((s) => !s.passed);
    const reasoning = failedTools.length > 0 ? `${passedCount}/${stats.length} expected tool invocations satisfied. Failed: ${failedTools.map((s) => `${s.toolName} (${s.reason})`).join(", ")}` : `All ${stats.length} expected tool invocations satisfied`;
    return this.createResult({
      passed,
      score,
      reasoning,
      details: {
        stats,
        actualToolCalls: actualCalls.map((c) => c.toolName),
        toolCallCounts: Object.fromEntries(toolCallCounts)
      }
    });
  }
};
var PatternMatchJudge = class extends BaseJudge {
  id = "pattern-match";
  name = "Pattern Match Judge";
  type = "code";
  async evaluate(context) {
    const { evalCase, workingDirectory } = context;
    if (!isCodeGenEval(evalCase)) {
      return this.notApplicable("Only applicable for code-gen evals");
    }
    const expectedPatterns = evalCase.expectedPatterns || [];
    if (expectedPatterns.length === 0) {
      return this.notApplicable("No expected patterns specified");
    }
    const baseDir = workingDirectory || process.cwd();
    const results = [];
    for (const { file, patterns } of expectedPatterns) {
      const fullPath = path.join(baseDir, file);
      let content = "";
      try {
        content = await fs.readFile(fullPath, "utf-8");
      } catch {
        results.push({
          file,
          patterns: patterns.map((p) => ({ pattern: p, found: false })),
          allFound: false
        });
        continue;
      }
      const patternResults = patterns.map((pattern) => {
        const regex = new RegExp(pattern, "gm");
        return {
          pattern,
          found: regex.test(content)
        };
      });
      results.push({
        file,
        patterns: patternResults,
        allFound: patternResults.every((p) => p.found)
      });
    }
    const totalPatterns = results.reduce((sum, r) => sum + r.patterns.length, 0);
    const foundPatterns = results.reduce(
      (sum, r) => sum + r.patterns.filter((p) => p.found).length,
      0
    );
    const score = totalPatterns > 0 ? foundPatterns / totalPatterns * 100 : 100;
    const passed = score >= 80;
    const failedFiles = results.filter((r) => !r.allFound);
    const reasoning = failedFiles.length > 0 ? `${foundPatterns}/${totalPatterns} patterns found. Missing patterns in: ${failedFiles.map((r) => r.file).join(", ")}` : `All ${totalPatterns} expected patterns found`;
    return this.createResult({
      passed,
      score,
      reasoning,
      details: { results }
    });
  }
};

// src/judges/judge-registry.ts
var JudgeRegistry = class {
  judges = /* @__PURE__ */ new Map();
  constructor() {
    this.registerBuiltInJudges();
  }
  registerBuiltInJudges() {
    this.register(new FileExistenceJudge());
    this.register(new ToolInvocationJudge());
    this.register(new PatternMatchJudge());
  }
  register(judge) {
    this.judges.set(judge.id, judge);
  }
  unregister(id) {
    return this.judges.delete(id);
  }
  get(id) {
    return this.judges.get(id);
  }
  has(id) {
    return this.judges.has(id);
  }
  list() {
    return Array.from(this.judges.keys());
  }
  listByType(type) {
    return Array.from(this.judges.entries()).filter(([_, judge]) => judge.type === type).map(([id]) => id);
  }
  getAll() {
    return Array.from(this.judges.values());
  }
};
var defaultRegistry = null;
function getJudgeRegistry() {
  if (!defaultRegistry) {
    defaultRegistry = new JudgeRegistry();
  }
  return defaultRegistry;
}
function resetJudgeRegistry() {
  defaultRegistry = null;
}

export { BaseJudge, FileExistenceJudge, JudgeRegistry, PatternMatchJudge, ToolInvocationJudge, agentResultToExecutionResult, getJudgeRegistry, resetJudgeRegistry };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map