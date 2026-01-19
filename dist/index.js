import { z } from 'zod';
import * as path2 from 'path';
import * as fs2 from 'fs/promises';
import { pathToFileURL } from 'url';
import * as fsSync from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
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
    workspaceTemplate: userConfig.workspaceTemplate,
    preserveWorkspaces: userConfig.preserveWorkspaces ?? defaultConfig.preserveWorkspaces,
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
var execAsync = promisify(exec);
var SKIP_PATTERNS = ["node_modules", ".bun", "bun.lock", "dist", ".git", ".next", "coverage"];
function getWorkspaceBaseDir() {
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
var WorkspaceManager = class {
  workspaces = /* @__PURE__ */ new Map();
  baseDir;
  constructor(baseDir) {
    this.baseDir = baseDir ?? getWorkspaceBaseDir();
  }
  async createWorkspace(template) {
    const id = `ws-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const workspacePath = path2.join(this.baseDir, id);
    await fs2.mkdir(workspacePath, { recursive: true });
    if (template) {
      console.log(`[WorkspaceManager] Copying template from: ${template}`);
      try {
        await this.copyTemplate(template, workspacePath);
        console.log(`[WorkspaceManager] Template copied successfully to: ${workspacePath}`);
        await this.installDependencies(workspacePath);
        console.log(`[WorkspaceManager] Dependencies installed`);
      } catch (error) {
        console.error(`[WorkspaceManager] Failed to copy template from ${template}:`, error);
        await this.createMinimalStructure(workspacePath);
      }
    } else {
      console.log(`[WorkspaceManager] No template provided, creating minimal structure`);
      await this.createMinimalStructure(workspacePath);
    }
    const workspace = {
      id,
      path: workspacePath,
      createdAt: /* @__PURE__ */ new Date()
    };
    this.workspaces.set(id, workspace);
    return workspace;
  }
  async installDependencies(workspacePath) {
    try {
      const packageJsonPath = path2.join(workspacePath, "package.json");
      await fs2.access(packageJsonPath);
      await execAsync("bun install", { cwd: workspacePath });
    } catch {
    }
  }
  async createMinimalStructure(workspacePath) {
    await fs2.mkdir(path2.join(workspacePath, "src"), { recursive: true });
    await fs2.writeFile(
      path2.join(workspacePath, "package.json"),
      JSON.stringify({ name: "eval-workspace", version: "1.0.0", type: "module" }, null, 2)
    );
  }
  async copyTemplate(templatePath, workspacePath) {
    const resolvedTemplate = path2.isAbsolute(templatePath) ? templatePath : path2.join(process.cwd(), templatePath);
    try {
      await fs2.access(resolvedTemplate);
    } catch {
      throw new Error(`Template not found at: ${resolvedTemplate}`);
    }
    await this.copyDir(resolvedTemplate, workspacePath, SKIP_PATTERNS);
  }
  async copyDir(src, dest, skipPatterns = []) {
    await fs2.mkdir(dest, { recursive: true });
    const entries = await fs2.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      if (skipPatterns.some((pattern) => entry.name === pattern)) {
        continue;
      }
      const srcPath = path2.join(src, entry.name);
      const destPath = path2.join(dest, entry.name);
      if (entry.isDirectory()) {
        await this.copyDir(srcPath, destPath, skipPatterns);
      } else {
        await fs2.copyFile(srcPath, destPath);
      }
    }
  }
  async cleanupWorkspace(id) {
    const workspace = this.workspaces.get(id);
    if (workspace) {
      try {
        await fs2.rm(workspace.path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch (error) {
        console.warn(`Warning: Could not fully cleanup workspace ${id}:`, error.message);
      }
      this.workspaces.delete(id);
    }
  }
  async cleanupAll() {
    for (const id of this.workspaces.keys()) {
      await this.cleanupWorkspace(id);
    }
  }
  getWorkspace(id) {
    return this.workspaces.get(id);
  }
  listWorkspaces() {
    return Array.from(this.workspaces.values());
  }
};

// src/harness/test-harness.ts
var TestHarness = class {
  config;
  workspaceManager;
  constructor(options) {
    this.config = options.config;
    this.workspaceManager = options.workspaceManager ?? new WorkspaceManager();
  }
  async execute(evalCase) {
    const workspace = await this.workspaceManager.createWorkspace(this.config.workspaceTemplate);
    try {
      const context = {
        workingDirectory: workspace.path,
        evalId: evalCase.id,
        evalName: evalCase.name,
        timeout: evalCase.timeout ?? this.config.timeout
      };
      const prompt = this.getPrompt(evalCase);
      const startTime = Date.now();
      const result = await this.executeWithTimeout(
        this.config.agent,
        prompt,
        context,
        context.timeout
      );
      const executionResult = agentResultToExecutionResult(result);
      executionResult.duration = result.duration ?? Date.now() - startTime;
      executionResult.workingDirectory = workspace.path;
      return executionResult;
    } finally {
      if (!this.config.preserveWorkspaces) {
        await this.workspaceManager.cleanupWorkspace(workspace.id);
      }
    }
  }
  async executeMultiTurn(evalCase) {
    const workspace = await this.workspaceManager.createWorkspace(this.config.workspaceTemplate);
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
        const result = await this.executeWithTimeout(
          this.config.agent,
          turn.prompt,
          context,
          context.timeout
        );
        const executionResult = agentResultToExecutionResult(result);
        executionResult.duration = result.duration ?? Date.now() - startTime;
        executionResult.workingDirectory = workspace.path;
        results.push(executionResult);
        sessionId = result.sessionId;
      }
      return results;
    } finally {
      if (!this.config.preserveWorkspaces) {
        await this.workspaceManager.cleanupWorkspace(workspace.id);
      }
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
    if (!this.config.preserveWorkspaces) {
      await this.workspaceManager.cleanupAll();
    }
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
  }
  async run(options = {}) {
    const startTime = Date.now();
    const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    if (this.config.setup) {
      await this.config.setup();
    }
    const evalCases = await loadEvalCases({
      testDir: this.config.testDir,
      testMatch: this.config.testMatch,
      categories: options.categories,
      tags: options.tags,
      ids: options.ids,
      enabledOnly: true
    });
    if (this.config.verbose) {
      console.log(`Found ${evalCases.length} eval cases to run`);
    }
    const results = [];
    if (this.config.parallel && evalCases.length > 1) {
      results.push(...await this.runParallel(evalCases));
    } else {
      results.push(...await this.runSequential(evalCases));
    }
    if (this.config.teardown) {
      await this.config.teardown();
    }
    await this.harness.cleanup();
    const passed = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success && !r.error).length;
    const errors = results.filter((r) => r.error).length;
    return {
      runId,
      total: results.length,
      passed,
      failed,
      skipped: 0,
      errors,
      passRate: results.length > 0 ? passed / results.length : 0,
      results,
      duration: Date.now() - startTime,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async runParallel(evalCases) {
    const results = [];
    const { maxConcurrency } = this.config;
    for (let i = 0; i < evalCases.length; i += maxConcurrency) {
      const batch = evalCases.slice(i, i + maxConcurrency);
      const batchResults = await Promise.all(
        batch.map((evalCase) => this.runSingle(evalCase))
      );
      results.push(...batchResults);
    }
    return results;
  }
  async runSequential(evalCases) {
    const results = [];
    for (const evalCase of evalCases) {
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
      result = await this.runWithRetries(evalCase);
    } catch (error) {
      result = {
        evalCase,
        success: false,
        output: "",
        duration: Date.now() - startTime,
        judgeResults: [],
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
    if (this.config.afterEach) {
      await this.config.afterEach(result);
    }
    if (this.config.verbose) {
      const status = result.success ? "\u2713" : "\u2717";
      console.log(`${status} ${evalCase.name} (${result.duration}ms)`);
    }
    return result;
  }
  async runWithRetries(evalCase) {
    let lastError;
    let retryCount = 0;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.executeAndJudge(evalCase);
        if (result.success || attempt === this.config.maxRetries) {
          return { ...result, retryCount };
        }
        retryCount++;
        const delay = this.config.retryDelayMs * Math.pow(this.config.retryBackoffMultiplier, attempt);
        await this.sleep(delay);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount++;
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(this.config.retryBackoffMultiplier, attempt);
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
      retryCount
    };
  }
  async executeAndJudge(evalCase) {
    let executionResult;
    let turnResults;
    if (isMultiTurnEval(evalCase)) {
      turnResults = await this.harness.executeMultiTurn(evalCase);
      executionResult = turnResults[turnResults.length - 1];
    } else {
      executionResult = await this.harness.execute(evalCase);
    }
    const judgeResults = await this.runJudges(evalCase, executionResult);
    const allPassed = judgeResults.every((r) => r.passed);
    return {
      evalCase,
      success: executionResult.success && allPassed,
      output: executionResult.output,
      duration: executionResult.duration,
      judgeResults,
      toolCalls: executionResult.toolCalls,
      error: executionResult.error
    };
  }
  async runJudges(evalCase, executionResult) {
    const judgeIds = this.getJudgeIds(evalCase);
    const registry = getJudgeRegistry();
    const results = [];
    for (const judgeId of judgeIds) {
      const judge = registry.get(judgeId);
      if (!judge) {
        if (this.config.verbose) {
          console.warn(`Judge not found: ${judgeId}`);
        }
        continue;
      }
      const context = {
        evalCase,
        executionResult,
        workingDirectory: executionResult.workingDirectory || ""
      };
      try {
        const result = await judge.evaluate(context);
        results.push(result);
      } catch (error) {
        results.push({
          judgeId,
          passed: false,
          score: 0,
          confidence: 1,
          reasoning: `Judge error: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
    return results;
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

export { BaseJudge, EvalRunner, JudgeRegistry, TestHarness, WorkspaceManager, agentResultToExecutionResult, defaultConfig, defineConfig, getJudgeRegistry, groupByCategory, isBasicEval, isCodeGenEval, isMultiTurnEval, isRoutingEval, isToolEval, loadConfig, loadEvalCase, loadEvalCases, parseEvalCase, resetJudgeRegistry };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map