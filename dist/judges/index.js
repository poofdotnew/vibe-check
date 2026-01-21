import * as fs3 from 'fs/promises';
import * as path6 from 'path';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';

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
function isRoutingEval(evalCase) {
  return evalCase.category === "routing";
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
      const fullPath = path6.join(baseDir, file);
      try {
        await fs3.access(fullPath);
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
      const fullPath = path6.join(baseDir, file);
      let content = "";
      try {
        content = await fs3.readFile(fullPath, "utf-8");
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
var DEFAULT_WORK_TYPE_KEYWORDS = {};
var AgentRoutingJudge = class extends BaseJudge {
  id = "agent-routing";
  name = "Agent Routing Judge";
  type = "code";
  workTypeKeywords;
  constructor(options = {}) {
    super();
    this.workTypeKeywords = options.workTypeKeywords || DEFAULT_WORK_TYPE_KEYWORDS;
  }
  async evaluate(context) {
    const { executionResult, evalCase, workingDirectory } = context;
    if (!isRoutingEval(evalCase)) {
      return this.notApplicable("Only applicable for routing evals");
    }
    const taskCalls = executionResult.toolCalls.filter(
      (call) => call.toolName === "Task" || call.toolName.includes("task")
    );
    let agentsInvoked = taskCalls.map((call) => {
      const input = call.input;
      return input?.agent || input?.subagent_type || "unknown";
    }).filter((agent) => agent !== "unknown");
    const jsonlAgents = await this.extractAgentsFromJsonl(workingDirectory);
    agentsInvoked = [.../* @__PURE__ */ new Set([...agentsInvoked, ...jsonlAgents])];
    const expectedAgent = evalCase.expectedAgent;
    const invokedExpected = agentsInvoked.includes(expectedAgent);
    const forbiddenAgents = evalCase.shouldNotRoute || [];
    const invokedForbidden = forbiddenAgents.filter((a) => agentsInvoked.includes(a));
    const output = executionResult.output || "";
    const outputLower = output.toLowerCase();
    const hasDelegationIntent = this.checkDelegationIntent(outputLower, expectedAgent, forbiddenAgents);
    let score;
    let passed;
    let reasoning;
    if (invokedExpected && invokedForbidden.length === 0) {
      score = 100;
      passed = true;
      reasoning = `Correctly routed to ${expectedAgent}`;
    } else if (invokedExpected && invokedForbidden.length > 0) {
      score = 50;
      passed = false;
      reasoning = `Routed to ${expectedAgent} but also incorrectly routed to: ${invokedForbidden.join(", ")}`;
    } else if (hasDelegationIntent.toExpected && !hasDelegationIntent.toForbidden) {
      score = 80;
      passed = true;
      reasoning = `AI indicated delegation intent to ${expectedAgent} (no actual Task tool invocation detected)`;
    } else if (hasDelegationIntent.toExpected && hasDelegationIntent.toForbidden) {
      score = 40;
      passed = false;
      reasoning = `AI mentioned ${expectedAgent} but also mentioned forbidden agents`;
    } else if (hasDelegationIntent.performedRightWork) {
      score = 70;
      passed = true;
      reasoning = `AI performed ${expectedAgent}-appropriate work directly (no delegation, but correct work type)`;
    } else if (agentsInvoked.length === 0) {
      score = 0;
      passed = false;
      reasoning = `Expected ${expectedAgent} but no agent was invoked and no delegation intent detected. The main agent may have handled the task directly.`;
    } else {
      score = 0;
      passed = false;
      reasoning = `Expected ${expectedAgent} but got: ${agentsInvoked.join(", ")}`;
    }
    return this.createResult({
      passed,
      score,
      reasoning,
      details: {
        agentsInvoked,
        expectedAgent,
        invokedForbidden,
        taskCallCount: taskCalls.length,
        jsonlAgentsFound: jsonlAgents,
        delegationIntentDetected: hasDelegationIntent.toExpected,
        performedRightWork: hasDelegationIntent.performedRightWork
      }
    });
  }
  async extractAgentsFromJsonl(workspacePath) {
    const agents = [];
    try {
      const claudeDir = path6.join(workspacePath, ".claude", "projects");
      try {
        await fs3.access(claudeDir);
      } catch {
        return agents;
      }
      const projectDirs = await fs3.readdir(claudeDir);
      for (const projectDir of projectDirs) {
        const projectPath = path6.join(claudeDir, projectDir);
        const stat3 = await fs3.stat(projectPath);
        if (!stat3.isDirectory()) continue;
        const files = await fs3.readdir(projectPath);
        const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
        for (const jsonlFile of jsonlFiles) {
          const filePath = path6.join(projectPath, jsonlFile);
          const content = await fs3.readFile(filePath, "utf-8");
          const lines = content.split("\n").filter((line) => line.trim());
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              const message = entry.message;
              if (!message?.content || !Array.isArray(message.content)) continue;
              for (const block of message.content) {
                if (block.type === "tool_use" && block.name === "Task") {
                  const input = block.input;
                  const agentType = input?.subagent_type || input?.agent;
                  if (agentType && !agents.includes(agentType)) {
                    agents.push(agentType);
                  }
                }
              }
            } catch {
            }
          }
        }
      }
    } catch {
    }
    return agents;
  }
  checkDelegationIntent(outputLower, expectedAgent, forbiddenAgents) {
    const delegationKeywords = [
      "delegate",
      "task tool",
      "subagent",
      "agent",
      "specialized",
      "use the",
      "invoke",
      "call the"
    ];
    const expectedAgentLower = expectedAgent.toLowerCase();
    const mentionsExpected = outputLower.includes(expectedAgentLower);
    const hasDelegationContext = delegationKeywords.some((kw) => outputLower.includes(kw));
    const toExpected = mentionsExpected && hasDelegationContext;
    const toForbidden = forbiddenAgents.some((agent) => {
      const agentLower = agent.toLowerCase();
      return outputLower.includes(agentLower) && hasDelegationContext;
    });
    const performedRightWork = this.checkWorkType(outputLower, expectedAgent);
    return { toExpected, toForbidden, performedRightWork };
  }
  checkWorkType(outputLower, expectedAgent) {
    const keywords = this.workTypeKeywords[expectedAgent] || [];
    if (keywords.length === 0) return false;
    const matchCount = keywords.filter((kw) => outputLower.includes(kw)).length;
    return matchCount >= 2;
  }
};
var SkillInvocationJudge = class extends BaseJudge {
  id = "skill-invocation";
  name = "Skill Invocation Judge";
  type = "code";
  async evaluate(context) {
    const { evalCase, executionResult, workingDirectory } = context;
    if (!isToolEval(evalCase)) {
      return this.notApplicable("Only applicable for tool evals");
    }
    const expectedSkills = evalCase.expectedSkills || [];
    if (expectedSkills.length === 0) {
      return this.notApplicable("No expected skills specified");
    }
    const jsonlSkillCalls = await this.extractSkillCallsFromJsonl(workingDirectory);
    const mainAgentSkillCalls = this.extractSkillCallsFromToolCalls(executionResult.toolCalls || []);
    const skillCalls = [...jsonlSkillCalls, ...mainAgentSkillCalls];
    const results = [];
    for (const expected of expectedSkills) {
      const matchCount = skillCalls.filter(
        (call) => call.skillName === expected.skillName
      ).length;
      const meetsMin = matchCount >= (expected.minCalls ?? 1);
      results.push({
        skillName: expected.skillName,
        found: matchCount > 0,
        callCount: matchCount,
        meetsMin
      });
    }
    const passedCount = results.filter((r) => r.found && r.meetsMin).length;
    const score = passedCount / expectedSkills.length * 100;
    const passed = score >= 80;
    const failedChecks = results.filter((r) => !r.found || !r.meetsMin);
    const allSkillNames = Array.from(new Set(skillCalls.map((c) => c.skillName)));
    return this.createResult({
      passed,
      score,
      reasoning: failedChecks.length > 0 ? `${passedCount}/${expectedSkills.length} expected skills invoked. Failed: ${failedChecks.map((f) => `${f.skillName} (found ${f.callCount}x)`).join(", ")}` : `All ${expectedSkills.length} expected skills were invoked`,
      details: {
        results,
        actualSkillNames: allSkillNames,
        totalSkillCalls: skillCalls.length
      }
    });
  }
  extractSkillCallsFromToolCalls(toolCalls) {
    const skillCalls = [];
    for (const call of toolCalls) {
      if (call.toolName === "Skill") {
        const input = call.input;
        const skillName = input?.skill || input?.command;
        if (skillName) {
          skillCalls.push({
            skillName: skillName.replace(/^\//, ""),
            input: input || {}
          });
        }
      }
    }
    return skillCalls;
  }
  async extractSkillCallsFromJsonl(workspacePath) {
    const skillCalls = [];
    try {
      const claudeDir = path6.join(workspacePath, ".claude", "projects");
      try {
        await fs3.access(claudeDir);
      } catch {
        return skillCalls;
      }
      const projectDirs = await fs3.readdir(claudeDir);
      for (const projectDir of projectDirs) {
        const projectPath = path6.join(claudeDir, projectDir);
        const stat3 = await fs3.stat(projectPath);
        if (!stat3.isDirectory()) continue;
        const files = await fs3.readdir(projectPath);
        const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
        for (const jsonlFile of jsonlFiles) {
          const filePath = path6.join(projectPath, jsonlFile);
          const content = await fs3.readFile(filePath, "utf-8");
          const lines = content.split("\n").filter((line) => line.trim());
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              const message = entry.message;
              if (!message?.content || !Array.isArray(message.content)) continue;
              for (const block of message.content) {
                if (block.type === "tool_use" && block.name === "Skill") {
                  const input = block.input;
                  const skillName = input?.skill || input?.command;
                  if (skillName) {
                    skillCalls.push({
                      skillName: skillName.replace(/^\//, ""),
                      input: input || {}
                    });
                  }
                }
              }
            } catch {
            }
          }
        }
      }
    } catch {
    }
    return skillCalls;
  }
};
var SyntaxValidationJudge = class extends BaseJudge {
  id = "syntax-validation";
  name = "Syntax Validation Judge";
  type = "code";
  async evaluate(context) {
    const { executionResult, evalCase, workingDirectory } = context;
    if (!isCodeGenEval(evalCase)) {
      return this.notApplicable("Only applicable for code-gen evals");
    }
    if (!evalCase.syntaxValidation) {
      return this.notApplicable("Syntax validation disabled for this eval");
    }
    const targetFiles = evalCase.targetFiles || [];
    const codeFiles = targetFiles.filter(
      (f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".js") || f.endsWith(".jsx")
    );
    if (codeFiles.length === 0) {
      return this.notApplicable("No code files to validate");
    }
    const results = [];
    for (const file of codeFiles) {
      const fullPath = path6.join(workingDirectory || executionResult.workingDirectory || "", file);
      try {
        const content = await fs3.readFile(fullPath, "utf-8");
        const isValid = await this.validateSyntax(content, file);
        results.push({ file, valid: isValid.valid, error: isValid.error });
      } catch (error) {
        results.push({
          file,
          valid: false,
          error: error instanceof Error ? error.message : "File not found"
        });
      }
    }
    const validCount = results.filter((r) => r.valid).length;
    const score = validCount / codeFiles.length * 100;
    const passed = score >= 90;
    const invalidFiles = results.filter((r) => !r.valid);
    return this.createResult({
      passed,
      score,
      reasoning: invalidFiles.length > 0 ? `${validCount}/${codeFiles.length} files have valid syntax. Invalid: ${invalidFiles.map((f) => `${f.file} (${f.error})`).join(", ")}` : `All ${codeFiles.length} files have valid syntax`,
      details: { results }
    });
  }
  async validateSyntax(content, filename) {
    try {
      const { parse } = await import('@babel/parser');
      const isTypeScript = filename.endsWith(".ts") || filename.endsWith(".tsx");
      const isJSX = filename.endsWith(".tsx") || filename.endsWith(".jsx");
      const plugins = [];
      if (isTypeScript) plugins.push("typescript");
      if (isJSX) plugins.push("jsx");
      parse(content, {
        sourceType: "module",
        plugins
      });
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Parse error"
      };
    }
  }
};
var DEFAULT_MODEL = "claude-sonnet-4-20250514";
var DEFAULT_RUBRICS_DIR = "./__evals__/rubrics";
async function loadRubric(rubricPath, rubricsDir) {
  const baseDir = rubricsDir || DEFAULT_RUBRICS_DIR;
  const fullPath = path6.isAbsolute(rubricPath) ? rubricPath : path6.join(process.cwd(), baseDir, rubricPath);
  const content = await fs3.readFile(fullPath, "utf-8");
  const id = path6.basename(rubricPath, path6.extname(rubricPath));
  return { id, content };
}
var LLMJudge = class extends BaseJudge {
  id;
  name;
  type = "llm";
  rubricPath;
  anthropic;
  rubricsDir;
  model;
  constructor(id, rubricPath, options = {}) {
    super();
    this.id = id;
    this.name = `LLM Judge: ${id}`;
    this.rubricPath = rubricPath;
    this.rubricsDir = options.rubricsDir || DEFAULT_RUBRICS_DIR;
    this.model = options.model || DEFAULT_MODEL;
    this.anthropic = new Anthropic();
  }
  async evaluate(context) {
    const { evalCase, executionResult, workingDirectory } = context;
    let rubric;
    try {
      rubric = await loadRubric(this.rubricPath, this.rubricsDir);
    } catch (error) {
      return this.createResult({
        passed: false,
        score: 0,
        reasoning: `Failed to load rubric: ${error instanceof Error ? error.message : "Unknown error"}`,
        confidence: 0
      });
    }
    const generatedFiles = await this.readTargetFiles(evalCase, workingDirectory);
    const referenceSolution = evalCase.referenceSolution;
    let referenceFiles;
    if (referenceSolution) {
      referenceFiles = await this.readReferenceFiles(referenceSolution, workingDirectory);
    }
    const prompt = referenceFiles && referenceFiles.size > 0 ? this.buildPairwisePrompt(evalCase, executionResult, rubric, generatedFiles, referenceFiles) : this.buildPrompt(evalCase, executionResult, rubric, generatedFiles);
    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }]
      });
      const content = response.content[0];
      if (content.type !== "text") {
        throw new Error("Unexpected response type from LLM");
      }
      return this.parseResponse(content.text);
    } catch (error) {
      return this.createResult({
        passed: false,
        score: 0,
        reasoning: `LLM evaluation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        confidence: 0
      });
    }
  }
  async readReferenceFiles(referenceSolution, workingDirectory) {
    const files = /* @__PURE__ */ new Map();
    if (referenceSolution.code) {
      files.set("reference_code", referenceSolution.code);
    }
    if (referenceSolution.files && referenceSolution.files.length > 0) {
      for (const filePath of referenceSolution.files) {
        const fullPath = path6.isAbsolute(filePath) ? filePath : path6.join(workingDirectory, filePath);
        try {
          const content = await fs3.readFile(fullPath, "utf-8");
          files.set(filePath, content);
        } catch {
          files.set(filePath, "[REFERENCE FILE NOT FOUND]");
        }
      }
    }
    return files;
  }
  buildPairwisePrompt(evalCase, result, rubric, generatedFiles, referenceFiles) {
    const toolCallSummary = this.formatToolCalls(result.toolCalls);
    let generatedFilesSection = "";
    if (generatedFiles && generatedFiles.size > 0) {
      const fileContents = Array.from(generatedFiles.entries()).map(([filePath, content]) => `### ${filePath}
\`\`\`
${content}
\`\`\``).join("\n\n");
      generatedFilesSection = `
## Generated Output (Candidate)
${fileContents}
`;
    }
    let referenceFilesSection = "";
    if (referenceFiles && referenceFiles.size > 0) {
      const fileContents = Array.from(referenceFiles.entries()).map(([filePath, content]) => `### ${filePath}
\`\`\`
${content}
\`\`\``).join("\n\n");
      referenceFilesSection = `
## Reference Solution (Gold Standard)
${fileContents}
`;
    }
    return `You are an AI evaluation judge performing PAIRWISE COMPARISON. Compare the candidate output against the reference solution.

## Evaluation Case
ID: ${evalCase.id}
Name: ${evalCase.name}
Description: ${evalCase.description}
Category: ${evalCase.category}
Original Prompt: ${evalCase.prompt || "N/A"}
Expected Behavior: ${evalCase.expectedBehavior || "N/A"}

## Rubric
${rubric.content}
${referenceFilesSection}
${generatedFilesSection}
## Execution Result
Success: ${result.success}
AI Response: ${result.output || "N/A"}
Duration: ${result.duration}ms
Tool Calls: ${toolCallSummary}
Error: ${result.error?.message || "None"}

## Pairwise Comparison Instructions
1. Compare the candidate output against the reference solution
2. Evaluate how closely the candidate matches the reference in terms of:
   - Functional correctness
   - Code quality and style
   - Completeness of implementation
3. Award scores based on how well the candidate achieves the same goals as the reference
4. A candidate that fully matches or exceeds the reference should score 90-100
5. Output your evaluation in the following JSON format:

\`\`\`json
{
  "score": <number 0-100>,
  "passed": <boolean - true if score >= 70>,
  "confidence": <number 0-1 indicating how confident you are in this evaluation>,
  "reasoning": "<your detailed reasoning comparing candidate to reference, 2-4 sentences>"
}
\`\`\`

Output only the JSON block, no other text.`;
  }
  async readTargetFiles(evalCase, workingDirectory) {
    const files = /* @__PURE__ */ new Map();
    const targetFiles = evalCase.targetFiles;
    if (!targetFiles || targetFiles.length === 0) {
      return files;
    }
    for (const filePath of targetFiles) {
      const fullPath = path6.join(workingDirectory, filePath);
      try {
        const content = await fs3.readFile(fullPath, "utf-8");
        files.set(filePath, content);
      } catch {
        files.set(filePath, "[FILE NOT FOUND]");
      }
    }
    return files;
  }
  buildPrompt(evalCase, result, rubric, generatedFiles) {
    const toolCallSummary = this.formatToolCalls(result.toolCalls);
    let generatedFilesSection = "";
    if (generatedFiles && generatedFiles.size > 0) {
      const fileContents = Array.from(generatedFiles.entries()).map(([filePath, content]) => `### ${filePath}
\`\`\`
${content}
\`\`\``).join("\n\n");
      generatedFilesSection = `
## Generated Files
${fileContents}
`;
    }
    return `You are an AI evaluation judge. Evaluate the following AI execution result against the rubric.

## Evaluation Case
ID: ${evalCase.id}
Name: ${evalCase.name}
Description: ${evalCase.description}
Category: ${evalCase.category}
Original Prompt: ${evalCase.prompt || "N/A"}
Expected Behavior: ${evalCase.expectedBehavior || "N/A"}

## Rubric
${rubric.content}

## Execution Result
Success: ${result.success}
AI Response: ${result.output || "N/A"}
Duration: ${result.duration}ms
Tool Calls: ${toolCallSummary}
Error: ${result.error?.message || "None"}
${generatedFilesSection}
## Instructions
1. Carefully evaluate the result against each criterion in the rubric
2. Consider both what the AI did correctly and what it failed to do
3. For code-gen evals, focus on the Generated Files section to evaluate the actual code quality
4. Provide a score from 0-100 based on the rubric criteria
5. Be specific in your reasoning - cite specific behaviors observed
6. Output your evaluation in the following JSON format:

\`\`\`json
{
  "score": <number 0-100>,
  "passed": <boolean - true if score >= 70>,
  "confidence": <number 0-1 indicating how confident you are in this evaluation>,
  "reasoning": "<your detailed reasoning, 2-4 sentences>"
}
\`\`\`

Output only the JSON block, no other text.`;
  }
  parseResponse(text) {
    const parsed = parseLLMJudgeResponse(text);
    return this.createResult(parsed);
  }
  formatToolCalls(toolCalls) {
    return formatToolCallsSummary(toolCalls);
  }
};
function createLLMCodeQualityJudge(options = {}) {
  return new LLMJudge("llm-code-quality", "code-quality.md", options);
}
function createLLMRoutingQualityJudge(options = {}) {
  return new LLMJudge("llm-routing-quality", "routing-quality.md", options);
}
function createLLMResponseQualityJudge(options = {}) {
  return new LLMJudge("llm-response-quality", "response-quality.md", options);
}
function createLLMConversationQualityJudge(options = {}) {
  return new LLMJudge("llm-conversation-quality", "conversation-quality.md", options);
}
function parseLLMJudgeResponse(text) {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonContent = jsonMatch ? jsonMatch[1] : text;
  try {
    const parsed = JSON.parse(jsonContent.trim());
    return {
      passed: parsed.passed ?? parsed.score >= 70,
      score: Math.max(0, Math.min(100, parsed.score || 0)),
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
      reasoning: parsed.reasoning || "No reasoning provided"
    };
  } catch {
    return {
      passed: false,
      score: 0,
      reasoning: `Failed to parse LLM response: ${text.substring(0, 200)}...`,
      confidence: 0
    };
  }
}
function formatToolCallsSummary(toolCalls) {
  if (!toolCalls || toolCalls.length === 0) {
    return "None";
  }
  if (toolCalls.length <= 10) {
    return toolCalls.map((t) => t.toolName).join(", ");
  }
  const toolCounts = /* @__PURE__ */ new Map();
  for (const call of toolCalls) {
    const name = call.toolName || "unknown";
    toolCounts.set(name, (toolCounts.get(name) || 0) + 1);
  }
  return Array.from(toolCounts.entries()).map(([name, count]) => count > 1 ? `${name} (x${count})` : name).join(", ");
}

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
    this.register(new AgentRoutingJudge());
    this.register(new SkillInvocationJudge());
    this.register(new SyntaxValidationJudge());
    this.register(createLLMCodeQualityJudge());
    this.register(createLLMRoutingQualityJudge());
    this.register(createLLMResponseQualityJudge());
    this.register(createLLMConversationQualityJudge());
  }
  register(judge) {
    this.judges.set(judge.id, judge);
  }
  /** @internal Used for testing only */
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
  /** @internal Used for testing only */
  listByType(type) {
    return Array.from(this.judges.entries()).filter(([_, judge]) => judge.type === type).map(([id]) => id);
  }
  /** @internal Used for testing only */
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

export { AgentRoutingJudge, BaseJudge, FileExistenceJudge, JudgeRegistry, LLMJudge, PatternMatchJudge, SkillInvocationJudge, SyntaxValidationJudge, ToolInvocationJudge, agentResultToExecutionResult, createLLMCodeQualityJudge, createLLMConversationQualityJudge, createLLMResponseQualityJudge, createLLMRoutingQualityJudge, getJudgeRegistry, loadRubric, resetJudgeRegistry };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map