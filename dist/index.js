import { z } from 'zod';
import * as path2 from 'path';
import * as fs2 from 'fs/promises';
import { pathToFileURL } from 'url';
import * as fsSync from 'fs';
import * as os from 'os';
import Anthropic from '@anthropic-ai/sdk';
import { glob } from 'glob';

// src/config/types.ts
function defineConfig(config) {
  return config;
}
var defaultConfig = {
  agentType: "generic",
  testMatch: ["**/*.eval.json"],
  testDir: "./__evals__",
  parallel: true,
  maxConcurrency: 3,
  timeout: 3e5,
  maxRetries: 2,
  retryDelayMs: 1e3,
  retryBackoffMultiplier: 2,
  trials: 1,
  trialPassThreshold: 0.5,
  judges: [],
  llmJudgeModel: "claude-sonnet-4-20250514",
  rubricsDir: "./__evals__/rubrics",
  outputDir: "./__evals__/results",
  verbose: false,
  preserveWorkspaces: false,
  learning: {
    enabled: false,
    ruleOutputDir: "./prompts",
    minFailuresForPattern: 2,
    similarityThreshold: 0.7,
    maxRulesPerIteration: 5,
    minRuleConfidence: 0.6,
    autoApprove: false,
    autoApproveThreshold: 0.8
  }
};
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
var EvalCaseSchema = z.discriminatedUnion("category", [
  ToolEvalSchema,
  CodeGenEvalSchema,
  RoutingEvalSchema,
  MultiTurnEvalSchema,
  BasicEvalSchema
]);
function parseEvalCase(data) {
  return EvalCaseSchema.parse(data);
}
function isToolEval(evalCase) {
  return evalCase.category === "tool";
}
function isCodeGenEval(evalCase) {
  return evalCase.category === "code-gen";
}
function isRoutingEval(evalCase) {
  return evalCase.category === "routing";
}
function isMultiTurnEval(evalCase) {
  return evalCase.category === "multi-turn";
}
function isBasicEval(evalCase) {
  return evalCase.category === "basic";
}
var CONFIG_FILE_NAMES = [
  "vibe-check.config.ts",
  "vibe-check.config.js",
  "vibe-check.config.mjs"
];
async function loadConfig(configPath) {
  const cwd = process.cwd();
  let configFile;
  if (configPath) {
    configFile = path2.isAbsolute(configPath) ? configPath : path2.join(cwd, configPath);
  } else {
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = path2.join(cwd, name);
      try {
        await fs2.access(candidate);
        configFile = candidate;
        break;
      } catch {
      }
    }
  }
  if (!configFile) {
    throw new Error(
      `No config file found. Create one of: ${CONFIG_FILE_NAMES.join(", ")}`
    );
  }
  const userConfig = await importConfig(configFile);
  if (!userConfig.agent) {
    throw new Error('Config must specify an "agent" function');
  }
  return resolveConfig(userConfig);
}
async function importConfig(configPath) {
  const fileUrl = pathToFileURL(configPath).href;
  try {
    const module = await import(fileUrl);
    return module.default || module;
  } catch (error) {
    if (configPath.endsWith(".ts")) {
      throw new Error(
        `Failed to import TypeScript config. Run with tsx: npx vibe-check
${error}`
      );
    }
    throw error;
  }
}
function resolveConfig(userConfig) {
  return {
    agent: userConfig.agent,
    agentType: userConfig.agentType ?? defaultConfig.agentType,
    testMatch: userConfig.testMatch ?? defaultConfig.testMatch,
    testDir: userConfig.testDir ?? defaultConfig.testDir,
    parallel: userConfig.parallel ?? defaultConfig.parallel,
    maxConcurrency: userConfig.maxConcurrency ?? defaultConfig.maxConcurrency,
    timeout: userConfig.timeout ?? defaultConfig.timeout,
    maxRetries: userConfig.maxRetries ?? defaultConfig.maxRetries,
    retryDelayMs: userConfig.retryDelayMs ?? defaultConfig.retryDelayMs,
    retryBackoffMultiplier: userConfig.retryBackoffMultiplier ?? defaultConfig.retryBackoffMultiplier,
    trials: userConfig.trials ?? defaultConfig.trials,
    trialPassThreshold: userConfig.trialPassThreshold ?? defaultConfig.trialPassThreshold,
    judges: userConfig.judges ?? defaultConfig.judges,
    llmJudgeModel: userConfig.llmJudgeModel ?? defaultConfig.llmJudgeModel,
    rubricsDir: userConfig.rubricsDir ?? defaultConfig.rubricsDir,
    outputDir: userConfig.outputDir ?? defaultConfig.outputDir,
    verbose: userConfig.verbose ?? defaultConfig.verbose,
    preserveWorkspaces: userConfig.preserveWorkspaces ?? defaultConfig.preserveWorkspaces,
    createWorkspace: userConfig.createWorkspace,
    cleanupWorkspace: userConfig.cleanupWorkspace,
    learning: {
      enabled: userConfig.learning?.enabled ?? defaultConfig.learning.enabled,
      ruleOutputDir: userConfig.learning?.ruleOutputDir ?? defaultConfig.learning.ruleOutputDir,
      minFailuresForPattern: userConfig.learning?.minFailuresForPattern ?? defaultConfig.learning.minFailuresForPattern,
      similarityThreshold: userConfig.learning?.similarityThreshold ?? defaultConfig.learning.similarityThreshold,
      maxRulesPerIteration: userConfig.learning?.maxRulesPerIteration ?? defaultConfig.learning.maxRulesPerIteration,
      minRuleConfidence: userConfig.learning?.minRuleConfidence ?? defaultConfig.learning.minRuleConfidence,
      autoApprove: userConfig.learning?.autoApprove ?? defaultConfig.learning.autoApprove,
      autoApproveThreshold: userConfig.learning?.autoApproveThreshold ?? defaultConfig.learning.autoApproveThreshold
    },
    setup: userConfig.setup,
    teardown: userConfig.teardown,
    beforeEach: userConfig.beforeEach,
    afterEach: userConfig.afterEach
  };
}

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

// src/harness/test-harness.ts
var TestHarness = class {
  config;
  workspaces = /* @__PURE__ */ new Map();
  constructor(options) {
    this.config = options.config;
  }
  verbose(message) {
    if (this.config.verbose) {
      console.log(message);
    }
  }
  async execute(evalCase) {
    this.verbose(`[${evalCase.id}] Starting: ${evalCase.name}`);
    const workspace = this.config.createWorkspace ? await this.config.createWorkspace() : await this.createDefaultWorkspace();
    this.workspaces.set(workspace.id, workspace);
    this.verbose(`[${evalCase.id}] Workspace: ${workspace.id}`);
    try {
      const context = {
        workingDirectory: workspace.path,
        evalId: evalCase.id,
        evalName: evalCase.name,
        timeout: evalCase.timeout ?? this.config.timeout
      };
      const prompt = this.getPrompt(evalCase);
      const startTime = Date.now();
      this.verbose(`[${evalCase.id}] Executing agent...`);
      const result = await this.executeWithTimeout(
        this.config.agent,
        prompt,
        context,
        context.timeout
      );
      if (this.config.agentType === "claude-code") {
        const jsonlToolCalls = await this.extractToolCallsFromJsonl(workspace.path);
        if (jsonlToolCalls.length > 0) {
          this.verbose(`[${evalCase.id}] Found ${jsonlToolCalls.length} tool calls from JSONL`);
          result.toolCalls = result.toolCalls || [];
          for (const call of jsonlToolCalls) {
            if (!result.toolCalls.some((t) => t.toolName === call.toolName)) {
              result.toolCalls.push(call);
            }
          }
        }
      }
      const executionResult = agentResultToExecutionResult(result);
      executionResult.duration = result.duration ?? Date.now() - startTime;
      executionResult.workingDirectory = workspace.path;
      this.verbose(`[${evalCase.id}] Completed (${result.success ? "success" : "failed"}) in ${executionResult.duration}ms`);
      executionResult.workspaceId = workspace.id;
      return executionResult;
    } catch (error) {
      let jsonlToolCalls = [];
      if (this.config.agentType === "claude-code") {
        jsonlToolCalls = await this.extractToolCallsFromJsonl(workspace.path);
      }
      if (this.config.cleanupWorkspace || !this.config.preserveWorkspaces) {
        await this.cleanupWorkspaceById(workspace.id);
      }
      const executionError = error;
      executionError.toolCalls = jsonlToolCalls;
      throw executionError;
    }
  }
  async executeMultiTurn(evalCase) {
    this.verbose(`[${evalCase.id}] Starting multi-turn: ${evalCase.name} (${evalCase.turns.length} turns)`);
    const workspace = this.config.createWorkspace ? await this.config.createWorkspace() : await this.createDefaultWorkspace();
    this.workspaces.set(workspace.id, workspace);
    this.verbose(`[${evalCase.id}] Workspace: ${workspace.id}`);
    const results = [];
    let sessionId;
    try {
      for (let i = 0; i < evalCase.turns.length; i++) {
        const turn = evalCase.turns[i];
        const context = {
          workingDirectory: workspace.path,
          evalId: evalCase.id,
          evalName: `${evalCase.name} - Turn ${i + 1}`,
          timeout: evalCase.timeout ?? this.config.timeout,
          sessionId
        };
        const startTime = Date.now();
        this.verbose(`[${evalCase.id}] Executing turn ${i + 1}/${evalCase.turns.length}...`);
        const result = await this.executeWithTimeout(
          this.config.agent,
          turn.prompt,
          context,
          context.timeout
        );
        if (this.config.agentType === "claude-code") {
          const jsonlToolCalls = await this.extractToolCallsFromJsonl(workspace.path);
          if (jsonlToolCalls.length > 0) {
            this.verbose(`[${evalCase.id}] Found ${jsonlToolCalls.length} tool calls from JSONL`);
            result.toolCalls = result.toolCalls || [];
            for (const call of jsonlToolCalls) {
              if (!result.toolCalls.some((t) => t.toolName === call.toolName)) {
                result.toolCalls.push(call);
              }
            }
          }
        }
        const executionResult = agentResultToExecutionResult(result);
        executionResult.duration = result.duration ?? Date.now() - startTime;
        executionResult.workingDirectory = workspace.path;
        this.verbose(`[${evalCase.id}] Turn ${i + 1} completed (${result.success ? "success" : "failed"}) in ${executionResult.duration}ms`);
        results.push(executionResult);
        sessionId = result.sessionId;
      }
      this.verbose(`[${evalCase.id}] Multi-turn completed`);
      if (results.length > 0) {
        results[results.length - 1].workspaceId = workspace.id;
      }
      return results;
    } catch (error) {
      let jsonlToolCalls = [];
      if (this.config.agentType === "claude-code") {
        jsonlToolCalls = await this.extractToolCallsFromJsonl(workspace.path);
      }
      if (this.config.cleanupWorkspace || !this.config.preserveWorkspaces) {
        await this.cleanupWorkspaceById(workspace.id);
      }
      const executionError = error;
      executionError.toolCalls = jsonlToolCalls;
      throw executionError;
    }
  }
  getPrompt(evalCase) {
    if ("prompt" in evalCase) {
      return evalCase.prompt;
    }
    if ("turns" in evalCase && evalCase.turns.length > 0) {
      return evalCase.turns[0].prompt;
    }
    throw new Error(`Eval case ${evalCase.id} has no prompt`);
  }
  async executeWithTimeout(agent, prompt, context, timeout) {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Agent execution timed out after ${timeout}ms`));
      }, timeout);
      try {
        const result = await agent(prompt, context);
        clearTimeout(timer);
        resolve(result);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }
  async cleanup() {
    if (this.config.cleanupWorkspace || !this.config.preserveWorkspaces) {
      for (const id of this.workspaces.keys()) {
        await this.cleanupWorkspaceById(id);
      }
    }
  }
  async cleanupWorkspace(workspaceId) {
    if (this.config.cleanupWorkspace || !this.config.preserveWorkspaces) {
      await this.cleanupWorkspaceById(workspaceId);
    }
  }
  async createDefaultWorkspace() {
    const id = `ws-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const baseDir = this.getWorkspaceBaseDir();
    const workspacePath = path2.join(baseDir, id);
    await fs2.mkdir(workspacePath, { recursive: true });
    await fs2.mkdir(path2.join(workspacePath, "src"), { recursive: true });
    await fs2.writeFile(
      path2.join(workspacePath, "package.json"),
      JSON.stringify({ name: "eval-workspace", version: "1.0.0", type: "module" }, null, 2)
    );
    return { id, path: workspacePath };
  }
  getWorkspaceBaseDir() {
    const cwd = process.cwd();
    const evalsResultsDir = path2.join(cwd, "__evals__", "results", "workspaces");
    try {
      fsSync.mkdirSync(evalsResultsDir, { recursive: true });
      const testFile = path2.join(evalsResultsDir, ".write-test");
      fsSync.writeFileSync(testFile, "");
      fsSync.unlinkSync(testFile);
      return evalsResultsDir;
    } catch {
      const tmpDir = fsSync.realpathSync(os.tmpdir());
      return path2.join(tmpDir, "vibe-check-evals");
    }
  }
  async cleanupWorkspaceById(id) {
    const workspace = this.workspaces.get(id);
    if (workspace) {
      this.verbose(`Cleaning up workspace: ${id}`);
      if (this.config.cleanupWorkspace) {
        await this.config.cleanupWorkspace(workspace);
      } else {
        try {
          await fs2.rm(workspace.path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        } catch {
        }
      }
      this.workspaces.delete(id);
    }
  }
  async extractToolCallsFromJsonl(workspacePath) {
    const toolCalls = [];
    const toolUseMap = /* @__PURE__ */ new Map();
    try {
      const claudeDir = path2.join(workspacePath, ".claude", "projects");
      try {
        await fs2.access(claudeDir);
      } catch {
        return toolCalls;
      }
      const projectDirs = await fs2.readdir(claudeDir);
      for (const projectDir of projectDirs) {
        const projectPath = path2.join(claudeDir, projectDir);
        const stat4 = await fs2.stat(projectPath);
        if (!stat4.isDirectory()) continue;
        const files = await fs2.readdir(projectPath);
        const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
        for (const jsonlFile of jsonlFiles) {
          const filePath = path2.join(projectPath, jsonlFile);
          const content = await fs2.readFile(filePath, "utf-8");
          const lines = content.split("\n").filter((line) => line.trim());
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              const message = entry.message;
              if (!message?.content || !Array.isArray(message.content)) continue;
              for (const block of message.content) {
                if (block.type === "tool_use" && typeof block.name === "string" && block.id) {
                  toolUseMap.set(block.id, { name: block.name, input: block.input || {} });
                }
              }
            } catch {
            }
          }
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              const message = entry.message;
              if (!message?.content || !Array.isArray(message.content)) continue;
              for (const block of message.content) {
                if (block.type === "tool_result" && block.tool_use_id) {
                  const toolUse = toolUseMap.get(block.tool_use_id);
                  if (toolUse) {
                    const output = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
                    if (!toolCalls.some((t) => t.toolName === toolUse.name && JSON.stringify(t.input) === JSON.stringify(toolUse.input))) {
                      toolCalls.push({
                        toolName: toolUse.name,
                        input: toolUse.input,
                        output,
                        isError: block.is_error
                      });
                    }
                    toolUseMap.delete(block.tool_use_id);
                  }
                }
              }
            } catch {
            }
          }
          for (const [, toolUse] of toolUseMap) {
            if (!toolCalls.some((t) => t.toolName === toolUse.name && JSON.stringify(t.input) === JSON.stringify(toolUse.input))) {
              toolCalls.push({
                toolName: toolUse.name,
                input: toolUse.input
              });
            }
          }
        }
      }
    } catch {
    }
    return toolCalls;
  }
};
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
      const fullPath = path2.join(baseDir, file);
      try {
        await fs2.access(fullPath);
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
      const fullPath = path2.join(baseDir, file);
      let content = "";
      try {
        content = await fs2.readFile(fullPath, "utf-8");
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
      const claudeDir = path2.join(workspacePath, ".claude", "projects");
      try {
        await fs2.access(claudeDir);
      } catch {
        return agents;
      }
      const projectDirs = await fs2.readdir(claudeDir);
      for (const projectDir of projectDirs) {
        const projectPath = path2.join(claudeDir, projectDir);
        const stat4 = await fs2.stat(projectPath);
        if (!stat4.isDirectory()) continue;
        const files = await fs2.readdir(projectPath);
        const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
        for (const jsonlFile of jsonlFiles) {
          const filePath = path2.join(projectPath, jsonlFile);
          const content = await fs2.readFile(filePath, "utf-8");
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
      const claudeDir = path2.join(workspacePath, ".claude", "projects");
      try {
        await fs2.access(claudeDir);
      } catch {
        return skillCalls;
      }
      const projectDirs = await fs2.readdir(claudeDir);
      for (const projectDir of projectDirs) {
        const projectPath = path2.join(claudeDir, projectDir);
        const stat4 = await fs2.stat(projectPath);
        if (!stat4.isDirectory()) continue;
        const files = await fs2.readdir(projectPath);
        const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
        for (const jsonlFile of jsonlFiles) {
          const filePath = path2.join(projectPath, jsonlFile);
          const content = await fs2.readFile(filePath, "utf-8");
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
      const fullPath = path2.join(workingDirectory || executionResult.workingDirectory || "", file);
      try {
        const content = await fs2.readFile(fullPath, "utf-8");
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
  const fullPath = path2.isAbsolute(rubricPath) ? rubricPath : path2.join(process.cwd(), baseDir, rubricPath);
  const content = await fs2.readFile(fullPath, "utf-8");
  const id = path2.basename(rubricPath, path2.extname(rubricPath));
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
        const fullPath = path2.isAbsolute(filePath) ? filePath : path2.join(workingDirectory, filePath);
        try {
          const content = await fs2.readFile(fullPath, "utf-8");
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
      const fullPath = path2.join(workingDirectory, filePath);
      try {
        const content = await fs2.readFile(fullPath, "utf-8");
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
async function loadEvalCases(options) {
  const { testDir, testMatch } = options;
  const patterns = testMatch.map((pattern) => path2.join(testDir, pattern));
  const files = await glob(patterns, { absolute: true });
  const evalCases = [];
  for (const file of files) {
    try {
      const content = await fs2.readFile(file, "utf-8");
      const data = JSON.parse(content);
      const evalCase = parseEvalCase(data);
      evalCases.push(evalCase);
    } catch (error) {
      console.warn(`Failed to load eval case from ${file}:`, error);
    }
  }
  return filterEvalCases(evalCases, options);
}
async function loadEvalCase(id, options) {
  const cases = await loadEvalCases({ ...options, ids: [id] });
  return cases[0] || null;
}
function filterEvalCases(cases, options) {
  let filtered = cases;
  if (options.enabledOnly !== false) {
    filtered = filtered.filter((c) => c.enabled !== false);
  }
  if (options.categories && options.categories.length > 0) {
    filtered = filtered.filter((c) => options.categories.includes(c.category));
  }
  if (options.tags && options.tags.length > 0) {
    filtered = filtered.filter((c) => c.tags?.some((t) => options.tags.includes(t)));
  }
  if (options.ids && options.ids.length > 0) {
    filtered = filtered.filter((c) => options.ids.includes(c.id));
  }
  return filtered;
}
function groupByCategory(cases) {
  const grouped = {
    tool: [],
    "code-gen": [],
    "multi-turn": [],
    routing: [],
    basic: []
  };
  for (const evalCase of cases) {
    grouped[evalCase.category].push(evalCase);
  }
  return grouped;
}

// src/runner/eval-runner.ts
var EvalRunner = class {
  config;
  harness;
  constructor(config) {
    this.config = config;
    this.harness = new TestHarness({ config });
    if (config.judges && config.judges.length > 0) {
      const registry = getJudgeRegistry();
      for (const judge of config.judges) {
        registry.register(judge);
      }
    }
  }
  verbose(message) {
    if (this.config.verbose) {
      console.log(message);
    }
  }
  async run(options = {}) {
    const startTime = Date.now();
    const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.verbose(`Starting eval run: ${runId}`);
    if (this.config.setup) {
      this.verbose(`Running setup hook...`);
      await this.config.setup();
      this.verbose(`Setup complete`);
    }
    this.verbose(`Loading eval cases from: ${this.config.testDir}`);
    const evalCases = await loadEvalCases({
      testDir: this.config.testDir,
      testMatch: this.config.testMatch,
      categories: options.categories,
      tags: options.tags,
      ids: options.ids,
      enabledOnly: true
    });
    const mode = this.config.parallel ? `parallel (${this.config.maxConcurrency} concurrent)` : "sequential";
    console.log(`Running ${evalCases.length} evals (${mode})...`);
    console.log();
    const results = [];
    if (this.config.parallel && evalCases.length > 1) {
      results.push(...await this.runParallel(evalCases));
    } else {
      results.push(...await this.runSequential(evalCases));
    }
    if (this.config.teardown) {
      this.verbose(`Running teardown hook...`);
      await this.config.teardown();
    }
    await this.harness.cleanup();
    const passed = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success && !r.error).length;
    const errors = results.filter((r) => r.error).length;
    const duration = Date.now() - startTime;
    console.log();
    console.log(`Completed: ${passed}/${results.length} passed (${Math.round(passed / results.length * 100)}%) in ${(duration / 1e3).toFixed(1)}s`);
    return {
      runId,
      total: results.length,
      passed,
      failed,
      skipped: 0,
      errors,
      passRate: results.length > 0 ? passed / results.length : 0,
      results,
      duration,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async runParallel(evalCases) {
    const results = new Array(evalCases.length);
    const { maxConcurrency } = this.config;
    let nextIndex = 0;
    return new Promise((resolve) => {
      const runNext = async () => {
        while (nextIndex < evalCases.length) {
          const currentIndex = nextIndex++;
          const evalCase = evalCases[currentIndex];
          console.log(`[${evalCase.id}] Starting (${currentIndex + 1}/${evalCases.length})`);
          try {
            const result = await this.runSingle(evalCase);
            results[currentIndex] = result;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            results[currentIndex] = {
              evalCase,
              success: false,
              output: "",
              duration: 0,
              judgeResults: [],
              error: error instanceof Error ? error : new Error(errorMessage),
              errorType: this.classifyError(error)
            };
          } finally {
          }
        }
      };
      const workers = Array(Math.min(maxConcurrency, evalCases.length)).fill(null).map(() => runNext());
      Promise.all(workers).then(() => resolve(results));
    });
  }
  async runSequential(evalCases) {
    const results = [];
    for (let i = 0; i < evalCases.length; i++) {
      const evalCase = evalCases[i];
      console.log(`[${evalCase.id}] Starting (${i + 1}/${evalCases.length})`);
      const result = await this.runSingle(evalCase);
      results.push(result);
    }
    return results;
  }
  async runSingle(evalCase) {
    const startTime = Date.now();
    if (this.config.beforeEach) {
      await this.config.beforeEach(evalCase);
    }
    let result;
    try {
      const trialConfig = evalCase.trials || { count: this.config.trials, passThreshold: this.config.trialPassThreshold };
      const trialCount = trialConfig.count ?? 1;
      if (trialCount > 1) {
        result = await this.runWithTrials(evalCase, trialCount, trialConfig.passThreshold ?? 0.5);
      } else {
        result = await this.runWithRetries(evalCase);
      }
    } catch (error) {
      result = {
        evalCase,
        success: false,
        output: "",
        duration: Date.now() - startTime,
        judgeResults: [],
        error: error instanceof Error ? error : new Error(String(error)),
        errorType: this.classifyError(error)
      };
    }
    if (this.config.afterEach) {
      await this.config.afterEach(result);
    }
    const status = result.success ? "\u2713" : "\u2717";
    const trialInfo = result.trialResults ? ` [${result.trialResults.filter((t) => t).length}/${result.trialResults.length} trials]` : "";
    const retryInfo = result.retryCount ? ` (${result.retryCount} retries)` : "";
    console.log(`[${evalCase.id}] ${status} ${(result.duration / 1e3).toFixed(1)}s${trialInfo}${retryInfo}`);
    return result;
  }
  async runWithTrials(evalCase, trialCount, passThreshold) {
    const trialResults = [];
    let lastResult;
    let totalDuration = 0;
    for (let trial = 0; trial < trialCount; trial++) {
      this.verbose(`[${evalCase.id}] Trial ${trial + 1}/${trialCount}...`);
      try {
        const result = await this.runWithRetries(evalCase);
        trialResults.push(result.success);
        totalDuration += result.duration;
        lastResult = result;
        this.verbose(`[${evalCase.id}] Trial ${trial + 1} ${result.success ? "passed" : "failed"}`);
      } catch (error) {
        trialResults.push(false);
        lastResult = {
          evalCase,
          success: false,
          output: "",
          duration: 0,
          judgeResults: [],
          error: error instanceof Error ? error : new Error(String(error)),
          errorType: this.classifyError(error)
        };
        this.verbose(`[${evalCase.id}] Trial ${trial + 1} errored: ${error.message}`);
      }
    }
    const passCount = trialResults.filter((t) => t).length;
    const passRate = passCount / trialCount;
    const overallSuccess = passRate >= passThreshold;
    this.verbose(`[${evalCase.id}] Trials complete: ${passCount}/${trialCount} passed (${(passRate * 100).toFixed(0)}%)`);
    return {
      ...lastResult,
      success: overallSuccess,
      trialResults,
      duration: totalDuration
    };
  }
  async runWithRetries(evalCase) {
    let lastError;
    let lastErrorType;
    let retryCount = 0;
    const retryErrors = [];
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      const isRetry = attempt > 0;
      try {
        const result = await this.executeAndJudge(evalCase);
        if (result.success) {
          return {
            ...result,
            retryCount,
            flaky: isRetry,
            retryErrors: isRetry ? retryErrors : void 0
          };
        }
        if (attempt === this.config.maxRetries) {
          return { ...result, retryCount, retryErrors: retryErrors.length > 0 ? retryErrors : void 0 };
        }
        const failReason = result.errorType || "judge failure";
        retryErrors.push(`Attempt ${attempt + 1}: ${failReason}`);
        retryCount++;
        const delay = this.getRetryDelay(attempt, result.errorType);
        this.verbose(`[${evalCase.id}] Attempt ${attempt + 1} failed (${failReason}), retrying in ${delay}ms... (${retryCount}/${this.config.maxRetries})`);
        await this.sleep(delay);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        lastErrorType = this.classifyError(error);
        retryErrors.push(`Attempt ${attempt + 1}: ${lastErrorType} - ${lastError.message.substring(0, 100)}`);
        retryCount++;
        if (attempt < this.config.maxRetries) {
          const delay = this.getRetryDelay(attempt, lastErrorType);
          this.verbose(`[${evalCase.id}] Attempt ${attempt + 1} errored (${lastErrorType}): ${lastError.message}, retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }
    return {
      evalCase,
      success: false,
      output: "",
      duration: 0,
      judgeResults: [],
      error: lastError,
      errorType: lastErrorType,
      retryCount,
      flaky: false,
      retryErrors: retryErrors.length > 0 ? retryErrors : void 0
    };
  }
  getRetryDelay(attempt, errorType) {
    const baseDelay = this.config.retryDelayMs;
    const multiplier = this.config.retryBackoffMultiplier;
    let delay = baseDelay * Math.pow(multiplier, attempt);
    if (errorType === "api") {
      delay *= 3;
    } else if (errorType === "timeout") {
      delay *= 1.5;
    }
    return delay;
  }
  classifyError(error, output) {
    if (!error) return "unknown";
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    const combinedText = output ? `${errorMessage} ${output.toLowerCase()}` : errorMessage;
    if (errorMessage.includes("timeout") || errorMessage.includes("timed out")) {
      return "timeout";
    }
    if (combinedText.includes("api") || combinedText.includes("rate limit") || combinedText.includes("429") || combinedText.includes("529") || combinedText.includes("500") || combinedText.includes("502") || combinedText.includes("503") || combinedText.includes("overloaded") || combinedText.includes("api error")) {
      return "api";
    }
    if (errorMessage.includes("judge")) {
      return "judge";
    }
    return "unknown";
  }
  async executeAndJudge(evalCase) {
    let executionResult;
    let turnResults;
    let judgeResults;
    if (isMultiTurnEval(evalCase)) {
      turnResults = await this.harness.executeMultiTurn(evalCase);
      executionResult = turnResults[turnResults.length - 1];
      judgeResults = await this.runJudgesForMultiTurn(evalCase, turnResults);
    } else {
      executionResult = await this.harness.execute(evalCase);
      judgeResults = await this.runJudgesParallel(evalCase, executionResult);
    }
    const allPassed = judgeResults.every((r) => r.passed);
    if (this.config.verbose && judgeResults.length > 0) {
      for (const result of judgeResults) {
        const status = result.passed ? "\u2713" : "\u2717";
        this.verbose(`[${evalCase.id}] Judge ${result.judgeId}: ${status} (score: ${result.score})`);
        if (!result.passed && result.reasoning) {
          this.verbose(`[${evalCase.id}]   \u2514\u2500 ${result.reasoning}`);
        }
      }
    }
    if (executionResult.workspaceId) {
      await this.harness.cleanupWorkspace(executionResult.workspaceId);
    }
    return {
      evalCase,
      success: executionResult.success && allPassed,
      output: executionResult.output,
      duration: executionResult.duration,
      judgeResults,
      toolCalls: executionResult.toolCalls,
      error: executionResult.error,
      errorType: executionResult.error ? this.classifyError(executionResult.error, executionResult.output) : void 0
    };
  }
  async runJudgesParallel(evalCase, executionResult, maxRetries = 2) {
    const judgeIds = this.getJudgeIds(evalCase);
    const registry = getJudgeRegistry();
    const judgePromises = judgeIds.map(async (judgeId) => {
      const judge = registry.get(judgeId);
      if (!judge) {
        this.verbose(`[${evalCase.id}] Warning: Judge not found: ${judgeId}`);
        return null;
      }
      return this.evaluateJudgeWithRetry(
        judge,
        {
          evalCase,
          executionResult,
          workingDirectory: executionResult.workingDirectory || ""
        },
        maxRetries,
        judgeId
      );
    });
    const results = await Promise.all(judgePromises);
    return results.filter((r) => r !== null);
  }
  async runJudgesForMultiTurn(evalCase, turnResults, maxRetries = 2) {
    const registry = getJudgeRegistry();
    const allJudgePromises = [];
    for (let i = 0; i < evalCase.turns.length; i++) {
      const turn = evalCase.turns[i];
      const turnResult = turnResults[i];
      const turnJudgeIds = turn.judges || [];
      for (const judgeId of turnJudgeIds) {
        const turnIndex = i;
        allJudgePromises.push(
          (async () => {
            const judge = registry.get(judgeId);
            if (!judge) {
              this.verbose(`[${evalCase.id}] Warning: Judge not found: ${judgeId}`);
              return null;
            }
            return this.evaluateJudgeWithRetry(
              judge,
              {
                evalCase,
                executionResult: turnResult,
                workingDirectory: turnResult.workingDirectory || "",
                turnIndex
              },
              maxRetries,
              `${judgeId}[turn-${turnIndex + 1}]`
            );
          })()
        );
      }
    }
    const globalJudgeIds = evalCase.judges || [];
    const lastResult = turnResults[turnResults.length - 1];
    for (const judgeId of globalJudgeIds) {
      allJudgePromises.push(
        (async () => {
          const judge = registry.get(judgeId);
          if (!judge) {
            this.verbose(`[${evalCase.id}] Warning: Judge not found: ${judgeId}`);
            return null;
          }
          return this.evaluateJudgeWithRetry(
            judge,
            {
              evalCase,
              executionResult: lastResult,
              workingDirectory: lastResult.workingDirectory || ""
            },
            maxRetries,
            judgeId
          );
        })()
      );
    }
    const results = await Promise.all(allJudgePromises);
    return results.filter((r) => r !== null);
  }
  async evaluateJudgeWithRetry(judge, context, maxRetries, judgeIdOverride) {
    const judgeId = judgeIdOverride || judge.id;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await judge.evaluate(context);
        if (attempt > 0) {
          this.verbose(`[${context.evalCase.id}] Judge ${judgeId} succeeded on attempt ${attempt + 1}`);
        }
        if (judgeIdOverride) {
          return { ...result, judgeId: judgeIdOverride };
        }
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) {
          const delay = 500 * (attempt + 1);
          this.verbose(`[${context.evalCase.id}] Judge ${judgeId} failed (attempt ${attempt + 1}), retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }
    return {
      judgeId,
      passed: false,
      score: 0,
      confidence: 1,
      reasoning: `Judge error after ${maxRetries + 1} attempts: ${lastError?.message || "Unknown"}`
    };
  }
  getJudgeIds(evalCase) {
    if ("judges" in evalCase && evalCase.judges) {
      return evalCase.judges;
    }
    return [];
  }
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};

// src/utils/reporter.ts
function formatDuration(ms) {
  if (ms < 1e3) return `${ms}ms`;
  if (ms < 6e4) return `${(ms / 1e3).toFixed(1)}s`;
  return `${(ms / 6e4).toFixed(1)}m`;
}
function formatPassRate(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}
function getStatusSymbol(success) {
  return success ? "\u2713" : "\u2717";
}
function summarizeByCategory(results) {
  const categoryMap = /* @__PURE__ */ new Map();
  for (const result of results) {
    const category = result.evalCase.category;
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category).push(result);
  }
  return Array.from(categoryMap.entries()).map(([category, categoryResults]) => ({
    category,
    total: categoryResults.length,
    passed: categoryResults.filter((r) => r.success).length,
    failed: categoryResults.filter((r) => !r.success && !r.error).length,
    errors: categoryResults.filter((r) => r.error).length,
    passRate: categoryResults.filter((r) => r.success).length / categoryResults.length
  }));
}
function summarizeErrors(results) {
  const errorMap = /* @__PURE__ */ new Map();
  for (const result of results) {
    if (result.error && result.errorType) {
      if (!errorMap.has(result.errorType)) {
        errorMap.set(result.errorType, { count: 0, examples: [] });
      }
      const entry = errorMap.get(result.errorType);
      entry.count++;
      if (entry.examples.length < 3) {
        entry.examples.push(`${result.evalCase.name}: ${result.error.message.substring(0, 100)}`);
      }
    }
  }
  return Array.from(errorMap.entries()).map(([type, data]) => ({
    type,
    count: data.count,
    examples: data.examples
  }));
}
function printSummary(suiteResult, options = {}) {
  const { verbose = false, showDetails = false } = options;
  console.log("\n" + "=".repeat(60));
  console.log("EVAL RESULTS SUMMARY");
  console.log("=".repeat(60));
  console.log(`
Run ID: ${suiteResult.runId}`);
  console.log(`Duration: ${formatDuration(suiteResult.duration)}`);
  console.log(`Timestamp: ${suiteResult.timestamp}`);
  console.log("\n--- Overall ---");
  console.log(`Total: ${suiteResult.total}`);
  console.log(`Passed: ${suiteResult.passed} (${formatPassRate(suiteResult.passRate)})`);
  console.log(`Failed: ${suiteResult.failed}`);
  console.log(`Errors: ${suiteResult.errors}`);
  const categorySummaries = summarizeByCategory(suiteResult.results);
  if (categorySummaries.length > 1) {
    console.log("\n--- By Category ---");
    for (const summary of categorySummaries) {
      console.log(`  ${summary.category}: ${summary.passed}/${summary.total} (${formatPassRate(summary.passRate)})`);
    }
  }
  const errorSummaries = summarizeErrors(suiteResult.results);
  if (errorSummaries.length > 0) {
    console.log("\n--- Errors by Type ---");
    for (const summary of errorSummaries) {
      console.log(`  ${summary.type}: ${summary.count}`);
      if (verbose) {
        for (const example of summary.examples) {
          console.log(`    - ${example}`);
        }
      }
    }
  }
  if (showDetails) {
    console.log("\n--- Individual Results ---");
    for (const result of suiteResult.results) {
      const status = getStatusSymbol(result.success);
      const trialInfo = result.trialResults ? ` [${result.trialResults.filter((t) => t).length}/${result.trialResults.length}]` : "";
      console.log(`${status} ${result.evalCase.name}${trialInfo} (${formatDuration(result.duration)})`);
      if (verbose && result.judgeResults.length > 0) {
        for (const judge of result.judgeResults) {
          const judgeStatus = getStatusSymbol(judge.passed);
          console.log(`    ${judgeStatus} ${judge.judgeId}: ${judge.score}/100 - ${judge.reasoning.substring(0, 80)}`);
        }
      }
      if (result.error) {
        console.log(`    Error: ${result.error.message.substring(0, 100)}`);
      }
    }
  }
  console.log("\n" + "=".repeat(60));
}
function generateJsonReport(suiteResult) {
  return {
    runId: suiteResult.runId,
    timestamp: suiteResult.timestamp,
    duration: suiteResult.duration,
    summary: {
      total: suiteResult.total,
      passed: suiteResult.passed,
      failed: suiteResult.failed,
      errors: suiteResult.errors,
      passRate: suiteResult.passRate
    },
    byCategory: summarizeByCategory(suiteResult.results),
    errorsByType: summarizeErrors(suiteResult.results),
    results: suiteResult.results.map((r) => ({
      id: r.evalCase.id,
      name: r.evalCase.name,
      category: r.evalCase.category,
      success: r.success,
      duration: r.duration,
      errorType: r.errorType,
      retryCount: r.retryCount,
      trialResults: r.trialResults,
      judgeResults: r.judgeResults.map((j) => ({
        judgeId: j.judgeId,
        passed: j.passed,
        score: j.score,
        reasoning: j.reasoning
      }))
    }))
  };
}

// src/utils/result-aggregator.ts
function aggregateResults(suiteResults) {
  const evalMap = /* @__PURE__ */ new Map();
  for (const suite of suiteResults) {
    for (const result of suite.results) {
      const id = result.evalCase.id;
      if (!evalMap.has(id)) {
        evalMap.set(id, {
          evalId: id,
          evalName: result.evalCase.name,
          results: []
        });
      }
      evalMap.get(id).results.push({
        success: result.success,
        duration: result.duration,
        hasError: !!result.error
      });
    }
  }
  const aggregatedResults = Array.from(evalMap.values()).map((data) => {
    const runs = data.results.length;
    const passes = data.results.filter((r) => r.success).length;
    const errors = data.results.filter((r) => r.hasError).length;
    const failures = runs - passes - errors;
    const passRate = runs > 0 ? passes / runs : 0;
    const avgDuration = runs > 0 ? data.results.reduce((sum, r) => sum + r.duration, 0) / runs : 0;
    const flakinessScore = calculateFlakinessScore(data.results.map((r) => r.success));
    const flaky = flakinessScore > 0.2 && runs >= 3;
    return {
      evalId: data.evalId,
      evalName: data.evalName,
      runs,
      passes,
      failures,
      errors,
      passRate,
      avgDuration,
      flaky,
      flakinessScore
    };
  });
  const totalRuns = suiteResults.length;
  const totalEvals = aggregatedResults.length;
  const overallPassRate = totalEvals > 0 ? aggregatedResults.reduce((sum, r) => sum + r.passRate, 0) / totalEvals : 0;
  const avgPassRate = totalEvals > 0 ? aggregatedResults.reduce((sum, r) => sum + r.passRate, 0) / totalEvals : 0;
  const flakyEvals = aggregatedResults.filter((r) => r.flaky).length;
  return {
    totalRuns,
    totalEvals,
    overallPassRate,
    avgPassRate,
    flakyEvals,
    results: aggregatedResults
  };
}
function calculateFlakinessScore(results) {
  if (results.length < 2) return 0;
  let transitions = 0;
  for (let i = 1; i < results.length; i++) {
    if (results[i] !== results[i - 1]) {
      transitions++;
    }
  }
  return transitions / (results.length - 1);
}
function detectRegressions(current, baseline) {
  const regressions = [];
  const baselineMap = /* @__PURE__ */ new Map();
  for (const result of baseline.results) {
    baselineMap.set(result.evalCase.id, result.success);
  }
  for (const result of current.results) {
    const wasSuccess = baselineMap.get(result.evalCase.id);
    if (wasSuccess === true && !result.success) {
      regressions.push({
        evalId: result.evalCase.id,
        evalName: result.evalCase.name,
        wasSuccess: true,
        isSuccess: false
      });
    }
  }
  return regressions;
}
function calculateNonDeterminismMetrics(suiteResults) {
  const evalMap = /* @__PURE__ */ new Map();
  for (const suite of suiteResults) {
    for (const result of suite.results) {
      const id = result.evalCase.id;
      if (!evalMap.has(id)) {
        evalMap.set(id, []);
      }
      evalMap.get(id).push(result.success);
    }
  }
  let deterministicCount = 0;
  let totalConsistency = 0;
  for (const [_, results] of evalMap) {
    if (results.length < 2) {
      deterministicCount++;
      totalConsistency += 1;
      continue;
    }
    const allSame = results.every((r) => r === results[0]);
    if (allSame) {
      deterministicCount++;
      totalConsistency += 1;
    } else {
      const modeCount = Math.max(
        results.filter((r) => r).length,
        results.filter((r) => !r).length
      );
      totalConsistency += modeCount / results.length;
    }
  }
  const totalEvals = evalMap.size;
  return {
    totalEvals,
    deterministicEvals: deterministicCount,
    nonDeterministicEvals: totalEvals - deterministicCount,
    avgConsistency: totalEvals > 0 ? totalConsistency / totalEvals : 1
  };
}

export { BaseJudge, EvalRunner, JudgeRegistry, TestHarness, agentResultToExecutionResult, aggregateResults, calculateNonDeterminismMetrics, defaultConfig, defineConfig, detectRegressions, formatDuration, formatPassRate, generateJsonReport, getJudgeRegistry, getStatusSymbol, groupByCategory, isBasicEval, isCodeGenEval, isMultiTurnEval, isRoutingEval, isToolEval, loadConfig, loadEvalCase, loadEvalCases, parseEvalCase, printSummary, resetJudgeRegistry, summarizeByCategory, summarizeErrors };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map