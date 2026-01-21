import { z } from 'zod';
import * as fs14 from 'fs/promises';
import fs14__default from 'fs/promises';
import * as path10 from 'path';
import path10__default from 'path';
import { glob } from 'glob';
import { pathToFileURL, fileURLToPath } from 'url';
import * as fsSync from 'fs';
import { createReadStream } from 'fs';
import * as readline from 'readline';
import readline__default from 'readline';
import * as dotenv from 'dotenv';
import { Command } from 'commander';
import chalk from 'chalk';
import * as os from 'os';
import Anthropic from '@anthropic-ai/sdk';

var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
var EvalCategorySchema, EvalAgentTypeSchema, ReferenceSolutionSchema, TrialConfigSchema, BaseEvalCaseSchema, ExpectedToolCallSchema, ExpectedSkillSchema, ToolEvalSchema, ExpectedPatternSchema, CodeGenEvalSchema, RoutingEvalSchema, TurnSchema, MultiTurnEvalSchema, BasicEvalSchema, EvalCaseSchema;
var init_schemas = __esm({
  "src/config/schemas.ts"() {
    EvalCategorySchema = z.enum(["tool", "code-gen", "multi-turn", "routing", "basic"]);
    EvalAgentTypeSchema = z.enum(["coding", "conversational", "research", "computer-use", "general"]);
    ReferenceSolutionSchema = z.object({
      files: z.array(z.string()).optional(),
      description: z.string().optional(),
      code: z.string().optional()
    });
    TrialConfigSchema = z.object({
      count: z.number().min(1).max(10).default(1),
      passThreshold: z.number().min(0).max(1).default(0.5)
    });
    BaseEvalCaseSchema = z.object({
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
    ExpectedToolCallSchema = z.object({
      toolName: z.string(),
      expectedInput: z.record(z.unknown()).optional(),
      minCalls: z.number().optional(),
      maxCalls: z.number().optional()
    });
    ExpectedSkillSchema = z.object({
      skillName: z.string(),
      minCalls: z.number().optional().default(1)
    });
    ToolEvalSchema = BaseEvalCaseSchema.extend({
      category: z.literal("tool"),
      prompt: z.string(),
      expectedToolCalls: z.array(ExpectedToolCallSchema),
      expectedSkills: z.array(ExpectedSkillSchema).optional(),
      judges: z.array(z.string())
    });
    ExpectedPatternSchema = z.object({
      file: z.string(),
      patterns: z.array(z.string())
    });
    CodeGenEvalSchema = BaseEvalCaseSchema.extend({
      category: z.literal("code-gen"),
      prompt: z.string(),
      targetFiles: z.array(z.string()),
      expectedPatterns: z.array(ExpectedPatternSchema).optional(),
      syntaxValidation: z.boolean().default(true),
      buildVerification: z.boolean().default(false),
      judges: z.array(z.string())
    });
    RoutingEvalSchema = BaseEvalCaseSchema.extend({
      category: z.literal("routing"),
      prompt: z.string(),
      expectedAgent: z.string(),
      shouldNotRoute: z.array(z.string()).optional(),
      judges: z.array(z.string())
    });
    TurnSchema = z.object({
      prompt: z.string(),
      expectedBehavior: z.string().optional(),
      judges: z.array(z.string()).optional()
    });
    MultiTurnEvalSchema = BaseEvalCaseSchema.extend({
      category: z.literal("multi-turn"),
      turns: z.array(TurnSchema),
      sessionPersistence: z.boolean().default(true),
      contextValidation: z.array(z.string()).optional(),
      judges: z.array(z.string()).optional()
    });
    BasicEvalSchema = BaseEvalCaseSchema.extend({
      category: z.literal("basic"),
      prompt: z.string(),
      expectedBehavior: z.string().optional(),
      judges: z.array(z.string())
    });
    EvalCaseSchema = z.discriminatedUnion("category", [
      ToolEvalSchema,
      CodeGenEvalSchema,
      RoutingEvalSchema,
      MultiTurnEvalSchema,
      BasicEvalSchema
    ]);
  }
});

// src/utils/eval-loader.ts
var eval_loader_exports = {};
__export(eval_loader_exports, {
  groupByCategory: () => groupByCategory,
  loadEvalCase: () => loadEvalCase,
  loadEvalCases: () => loadEvalCases
});
async function loadEvalCases(options) {
  const { testDir, testMatch } = options;
  const patterns = testMatch.map((pattern) => path10.join(testDir, pattern));
  const files = await glob(patterns, { absolute: true });
  const evalCases = [];
  for (const file of files) {
    try {
      const content = await fs14.readFile(file, "utf-8");
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
var init_eval_loader = __esm({
  "src/utils/eval-loader.ts"() {
    init_schemas();
  }
});
function getLearningConfig(overrides) {
  return {
    ...DEFAULT_LEARNING_CONFIG,
    ...overrides
  };
}
function getConfigFromEnv() {
  const overrides = {};
  if (process.env.LEARNING_EXPLANATION_MODEL) {
    overrides.explanationModel = process.env.LEARNING_EXPLANATION_MODEL;
  }
  if (process.env.LEARNING_RULE_MODEL) {
    overrides.ruleGenerationModel = process.env.LEARNING_RULE_MODEL;
  }
  if (process.env.LEARNING_MIN_PATTERN_SIZE) {
    overrides.minFailuresForPattern = parseInt(
      process.env.LEARNING_MIN_PATTERN_SIZE,
      10
    );
  }
  if (process.env.LEARNING_SIMILARITY_THRESHOLD) {
    overrides.similarityThreshold = parseFloat(
      process.env.LEARNING_SIMILARITY_THRESHOLD
    );
  }
  if (process.env.LEARNING_MAX_RULES) {
    overrides.maxRulesPerIteration = parseInt(
      process.env.LEARNING_MAX_RULES,
      10
    );
  }
  return overrides;
}
var __filename$1, __dirname$1, LEARNING_DIR, RULES_DIR, EVAL_RESULTS_DIR, DEFAULT_LEARNING_CONFIG;
var init_config = __esm({
  "src/learning/config.ts"() {
    __filename$1 = fileURLToPath(import.meta.url);
    __dirname$1 = path10__default.dirname(__filename$1);
    LEARNING_DIR = path10__default.join(__dirname$1);
    RULES_DIR = path10__default.join(LEARNING_DIR, "rules");
    EVAL_RESULTS_DIR = path10__default.join(__dirname$1, "..", "results");
    DEFAULT_LEARNING_CONFIG = {
      // Analysis settings
      minFailuresForPattern: 2,
      similarityThreshold: 0.7,
      maxFailuresPerIteration: 100,
      // Rule generation settings
      explanationModel: "claude-sonnet-4-20250514",
      ruleGenerationModel: "claude-sonnet-4-20250514",
      maxRulesPerIteration: 5,
      minRuleConfidence: 0.6,
      // Validation settings
      validationRunSize: 10,
      regressionThreshold: 5,
      // 5% max regression
      // Directories
      learningDir: LEARNING_DIR,
      promptsDir: path10__default.join(LEARNING_DIR, "prompts"),
      rulesDir: RULES_DIR,
      pendingDir: path10__default.join(RULES_DIR, "pending"),
      approvedDir: path10__default.join(RULES_DIR, "approved"),
      rejectedDir: path10__default.join(RULES_DIR, "rejected"),
      learnedRulesPath: path10__default.join(RULES_DIR, "learned-rules.json"),
      historyPath: path10__default.join(RULES_DIR, "history.json"),
      evalResultsDir: EVAL_RESULTS_DIR
    };
  }
});
function getPromptFromEvalCase(evalCase) {
  if ("prompt" in evalCase) {
    return evalCase.prompt;
  }
  if ("turns" in evalCase && evalCase.turns.length > 0) {
    return evalCase.turns.map((t) => t.prompt).join("\n---\n");
  }
  return "";
}
function getExpectedBehavior(evalCase) {
  if ("expectedBehavior" in evalCase) {
    return evalCase.expectedBehavior;
  }
  if ("expectedToolCalls" in evalCase) {
    return `Expected tool calls: ${evalCase.expectedToolCalls.map((t) => t.toolName).join(", ")}`;
  }
  if ("expectedAgent" in evalCase) {
    return `Expected to route to: ${evalCase.expectedAgent}`;
  }
  if ("targetFiles" in evalCase) {
    return `Expected to create/modify files: ${evalCase.targetFiles.join(", ")}`;
  }
  return void 0;
}
function evalResultToFailureInput(result) {
  const toolCalls = result.toolCalls?.map((tc) => ({
    name: tc.toolName,
    input: tc.input,
    output: typeof tc.output === "string" ? tc.output : JSON.stringify(tc.output)
  })) ?? [];
  return {
    id: result.evalCase.id,
    source: "eval",
    sourceId: result.evalCase.id,
    prompt: getPromptFromEvalCase(result.evalCase),
    expectedBehavior: getExpectedBehavior(result.evalCase),
    category: result.evalCase.category,
    output: result.output ?? "",
    toolCalls,
    error: result.error?.message,
    judgeResults: result.judgeResults,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    metadata: {
      evalName: result.evalCase.name,
      evalDescription: result.evalCase.description,
      evalTags: result.evalCase.tags,
      duration: result.duration,
      retryCount: result.retryCount
    }
  };
}
var EvalDataSource;
var init_eval_source = __esm({
  "src/learning/data-sources/eval-source.ts"() {
    init_config();
    EvalDataSource = class {
      name = "eval";
      resultsDir;
      constructor(resultsDir) {
        const config3 = getLearningConfig();
        this.resultsDir = resultsDir ?? config3.evalResultsDir;
      }
      async isAvailable() {
        try {
          await fs14__default.access(this.resultsDir);
          return true;
        } catch {
          return false;
        }
      }
      /**
       * Gets the path to the latest results file
       */
      async getLatestResultsPath() {
        try {
          const latestPath = path10__default.join(this.resultsDir, "latest.json");
          try {
            await fs14__default.access(latestPath);
            return latestPath;
          } catch {
          }
          const files = await fs14__default.readdir(this.resultsDir);
          const resultFiles = files.filter((f) => f.startsWith("eval-results-") && f.endsWith(".json")).sort().reverse();
          if (resultFiles.length === 0) {
            return null;
          }
          return path10__default.join(this.resultsDir, resultFiles[0]);
        } catch {
          return null;
        }
      }
      /**
       * Reads eval results from a file
       */
      async readResults(filePath) {
        try {
          const content = await fs14__default.readFile(filePath, "utf-8");
          return JSON.parse(content);
        } catch {
          return null;
        }
      }
      /**
       * Collects failed evals from the results directory
       */
      async collect(options) {
        const resultsPath = await this.getLatestResultsPath();
        if (!resultsPath) {
          console.warn("No eval results found in", this.resultsDir);
          return [];
        }
        const suiteResult = await this.readResults(resultsPath);
        if (!suiteResult) {
          console.warn("Could not parse eval results from", resultsPath);
          return [];
        }
        let failures = suiteResult.results.filter((r) => !r.success);
        if (options?.categories && options.categories.length > 0) {
          failures = failures.filter(
            (r) => options.categories.includes(r.evalCase.category)
          );
        }
        if (options?.ids && options.ids.length > 0) {
          failures = failures.filter((r) => options.ids.includes(r.evalCase.id));
        }
        if (options?.limit && options.limit > 0) {
          failures = failures.slice(0, options.limit);
        }
        return failures.map(evalResultToFailureInput);
      }
      /**
       * Gets summary statistics about available results
       */
      async getStats() {
        const files = await fs14__default.readdir(this.resultsDir).catch(() => []);
        const resultFiles = files.filter(
          (f) => f.startsWith("eval-results-") && f.endsWith(".json")
        );
        const latestPath = await this.getLatestResultsPath();
        const latestRun = latestPath ? await this.readResults(latestPath) : null;
        const failuresInLatest = latestRun ? latestRun.results.filter((r) => !r.success).length : 0;
        return {
          totalRuns: resultFiles.length,
          latestRun,
          failuresInLatest
        };
      }
    };
  }
});
var __filename2, __dirname2, JsonlDataSource;
var init_jsonl_source = __esm({
  "src/learning/data-sources/jsonl-source.ts"() {
    __filename2 = fileURLToPath(import.meta.url);
    __dirname2 = path10__default.dirname(__filename2);
    JsonlDataSource = class {
      name = "jsonl";
      promptRunsDir;
      constructor(promptRunsDir) {
        this.promptRunsDir = promptRunsDir || path10__default.join(__dirname2, "..", "..", "..", "cdk", "dev-server-manager", "prompt-runs");
      }
      async isAvailable() {
        try {
          await fs14__default.access(this.promptRunsDir);
          const projects = await this.findProjectFolders();
          return projects.length > 0;
        } catch {
          return false;
        }
      }
      /**
       * Finds all project-* folders in prompt-runs
       */
      async findProjectFolders() {
        try {
          const entries = await fs14__default.readdir(this.promptRunsDir, { withFileTypes: true });
          return entries.filter((e) => e.isDirectory() && e.name.startsWith("project-")).map((e) => path10__default.join(this.promptRunsDir, e.name));
        } catch {
          return [];
        }
      }
      /**
       * Finds all .jsonl files in a project's .claude folders
       */
      async findJsonlFiles(projectDir) {
        const jsonlFiles = [];
        const searchDir = async (dir) => {
          try {
            const entries = await fs14__default.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path10__default.join(dir, entry.name);
              if (entry.isDirectory()) {
                await searchDir(fullPath);
              } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
                jsonlFiles.push(fullPath);
              }
            }
          } catch {
          }
        };
        await searchDir(projectDir);
        return jsonlFiles;
      }
      /**
       * Parses a JSONL file into messages
       */
      async parseJsonlFile(filePath) {
        const messages = [];
        const fileStream = createReadStream(filePath);
        const rl = readline__default.createInterface({
          input: fileStream,
          crlfDelay: Infinity
        });
        for await (const line of rl) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              messages.push(parsed);
            } catch {
            }
          }
        }
        return messages;
      }
      /**
       * Groups messages into sessions
       */
      groupIntoSessions(messages) {
        const sessionMap = /* @__PURE__ */ new Map();
        for (const msg of messages) {
          const key = msg.agentId || msg.sessionId;
          if (!sessionMap.has(key)) {
            sessionMap.set(key, []);
          }
          sessionMap.get(key).push(msg);
        }
        const sessions = [];
        for (const [key, msgs] of sessionMap) {
          msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          const errors = [];
          for (const msg of msgs) {
            const msgErrors = this.extractErrors(msg);
            errors.push(...msgErrors);
          }
          if (msgs.length > 0) {
            sessions.push({
              sessionId: msgs[0].sessionId,
              agentId: msgs[0].agentId,
              messages: msgs,
              firstMessage: msgs[0],
              lastMessage: msgs[msgs.length - 1],
              hasErrors: errors.length > 0,
              errors
            });
          }
        }
        return sessions;
      }
      /**
       * Extracts errors from a message
       */
      extractErrors(msg) {
        const errors = [];
        if (msg.toolUseResult) {
          const resultStr = typeof msg.toolUseResult === "string" ? msg.toolUseResult : JSON.stringify(msg.toolUseResult);
          if (resultStr.toLowerCase().includes("error")) {
            errors.push({
              messageUuid: msg.uuid,
              errorMessage: resultStr,
              timestamp: msg.timestamp,
              parentUuid: msg.parentUuid || void 0
            });
          }
        }
        if (Array.isArray(msg.message?.content)) {
          for (const block of msg.message.content) {
            if (block.type === "tool_result" && block.is_error) {
              errors.push({
                messageUuid: msg.uuid,
                toolName: this.findToolNameForResult(msg, block.tool_use_id),
                errorMessage: typeof block.content === "string" ? block.content : JSON.stringify(block.content),
                timestamp: msg.timestamp,
                parentUuid: msg.parentUuid || void 0
              });
            }
          }
        }
        return errors;
      }
      /**
       * Finds the tool name for a tool_use_id by looking at parent messages
       */
      findToolNameForResult(msg, toolUseId) {
        if (!toolUseId) return void 0;
        if (Array.isArray(msg.message?.content)) {
          for (const block of msg.message.content) {
            if (block.type === "tool_use" && block.id === toolUseId) {
              return block.name;
            }
          }
        }
        return void 0;
      }
      /**
       * Extracts the initial prompt from a session
       */
      extractPrompt(session) {
        const firstUserMsg = session.messages.find((m) => m.type === "user");
        if (!firstUserMsg) return "";
        const content = firstUserMsg.message?.content;
        if (typeof content === "string") {
          return content;
        }
        if (Array.isArray(content)) {
          const textBlock = content.find((b) => b.type === "text");
          return textBlock?.text || "";
        }
        return "";
      }
      /**
       * Extracts all tool calls from a session
       */
      extractToolCalls(session) {
        const toolCalls = [];
        const toolUseMap = /* @__PURE__ */ new Map();
        for (const msg of session.messages) {
          if (Array.isArray(msg.message?.content)) {
            for (const block of msg.message.content) {
              if (block.type === "tool_use" && block.id) {
                toolUseMap.set(block.id, block);
              }
            }
          }
        }
        for (const msg of session.messages) {
          if (Array.isArray(msg.message?.content)) {
            for (const block of msg.message.content) {
              if (block.type === "tool_result" && block.tool_use_id) {
                const toolUse = toolUseMap.get(block.tool_use_id);
                if (toolUse) {
                  toolCalls.push({
                    name: toolUse.name || "unknown",
                    input: toolUse.input,
                    output: typeof block.content === "string" ? block.content : JSON.stringify(block.content),
                    error: block.is_error ? typeof block.content === "string" ? block.content : JSON.stringify(block.content) : void 0,
                    timestamp: msg.timestamp
                  });
                }
              }
            }
          }
        }
        return toolCalls;
      }
      /**
       * Extracts the final output from a session
       */
      extractOutput(session) {
        for (let i = session.messages.length - 1; i >= 0; i--) {
          const msg = session.messages[i];
          if (msg.type === "assistant") {
            const content = msg.message?.content;
            if (typeof content === "string") {
              return content;
            }
            if (Array.isArray(content)) {
              const textBlock = content.find((b) => b.type === "text");
              if (textBlock?.text) {
                return textBlock.text;
              }
            }
          }
        }
        return "";
      }
      /**
       * Converts a session with errors to a FailureInput
       */
      sessionToFailureInput(session, filePath) {
        const prompt = this.extractPrompt(session);
        const output = this.extractOutput(session);
        const toolCalls = this.extractToolCalls(session);
        const errorMessage = session.errors.map((e) => e.toolName ? `${e.toolName}: ${e.errorMessage}` : e.errorMessage).join("\n");
        return {
          id: `jsonl-${session.agentId || session.sessionId}-${Date.now()}`,
          source: "production",
          sourceId: filePath,
          prompt,
          output,
          toolCalls,
          error: errorMessage,
          timestamp: session.firstMessage.timestamp,
          metadata: {
            sessionId: session.sessionId,
            agentId: session.agentId,
            errorCount: session.errors.length,
            messageCount: session.messages.length,
            cwd: session.firstMessage.cwd,
            errors: session.errors
          }
        };
      }
      /**
       * Collects failures from production JSONL logs
       */
      async collect(options) {
        const failures = [];
        const projectFolders = await this.findProjectFolders();
        if (projectFolders.length === 0) {
          console.warn(`No project-* folders found in ${this.promptRunsDir}`);
          return [];
        }
        for (const projectDir of projectFolders) {
          const jsonlFiles = await this.findJsonlFiles(projectDir);
          for (const filePath of jsonlFiles) {
            if (options?.since || options?.until) {
              const stats = await fs14__default.stat(filePath);
              if (options.since && stats.mtime < options.since) continue;
              if (options.until && stats.mtime > options.until) continue;
            }
            const messages = await this.parseJsonlFile(filePath);
            const sessions = this.groupIntoSessions(messages);
            for (const session of sessions) {
              if (session.hasErrors) {
                const failure = this.sessionToFailureInput(session, filePath);
                failures.push(failure);
              }
            }
            if (options?.limit && failures.length >= options.limit) {
              return failures.slice(0, options.limit);
            }
          }
        }
        return failures;
      }
      /**
       * Gets statistics about available JSONL data
       */
      async getStats() {
        const projectFolders = await this.findProjectFolders();
        let jsonlFileCount = 0;
        let sessionCount = 0;
        let errorSessionCount = 0;
        for (const projectDir of projectFolders) {
          const jsonlFiles = await this.findJsonlFiles(projectDir);
          jsonlFileCount += jsonlFiles.length;
          for (const filePath of jsonlFiles) {
            const messages = await this.parseJsonlFile(filePath);
            const sessions = this.groupIntoSessions(messages);
            sessionCount += sessions.length;
            errorSessionCount += sessions.filter((s) => s.hasErrors).length;
          }
        }
        return {
          projectCount: projectFolders.length,
          jsonlFileCount,
          sessionCount,
          errorSessionCount
        };
      }
    };
  }
});

// src/learning/data-sources/types.ts
var init_types = __esm({
  "src/learning/data-sources/types.ts"() {
  }
});

// src/learning/data-sources/index.ts
function createDataSource(name, options) {
  switch (name) {
    case "eval":
      return new EvalDataSource(options?.resultsDir);
    case "jsonl":
      return new JsonlDataSource(options?.promptRunsDir);
    default:
      console.warn(`Unknown data source: ${name}`);
      return null;
  }
}
function getDataSourceRegistry() {
  return {
    eval: new EvalDataSource(),
    jsonl: new JsonlDataSource()
  };
}
async function collectFromSources(sources, options) {
  const failures = [];
  for (const sourceName of sources) {
    const source = createDataSource(sourceName);
    if (!source) {
      console.warn(`Skipping unknown source: ${sourceName}`);
      continue;
    }
    const isAvailable = await source.isAvailable?.();
    if (isAvailable === false) {
      console.warn(`Source not available: ${sourceName}`);
      continue;
    }
    const sourceFailures = await source.collect(options);
    failures.push(...sourceFailures);
  }
  return failures;
}
async function getSourceStats() {
  const registry = getDataSourceRegistry();
  const stats = {};
  for (const [name, source] of Object.entries(registry)) {
    const available = await source.isAvailable?.() ?? true;
    let failureCount;
    let details;
    if (available && name === "eval") {
      const evalSource = source;
      const evalStats = await evalSource.getStats();
      failureCount = evalStats.failuresInLatest;
    }
    if (available && name === "jsonl") {
      const jsonlSource = source;
      const jsonlStats = await jsonlSource.getStats();
      failureCount = jsonlStats.errorSessionCount;
      details = {
        projects: jsonlStats.projectCount,
        files: jsonlStats.jsonlFileCount,
        sessions: jsonlStats.sessionCount
      };
    }
    stats[name] = { available, failureCount, details };
  }
  return stats;
}
var init_data_sources = __esm({
  "src/learning/data-sources/index.ts"() {
    init_eval_source();
    init_jsonl_source();
    init_types();
    init_eval_source();
    init_jsonl_source();
  }
});
function parseExplanationResponse(text) {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonContent = jsonMatch ? jsonMatch[1] : text;
  try {
    const parsed = JSON.parse(jsonContent.trim());
    return {
      whatWentWrong: parsed.whatWentWrong || "Unknown",
      whyItFailed: parsed.whyItFailed || "Unknown",
      rootCause: parsed.rootCause || "Unknown",
      suggestedFix: parsed.suggestedFix || "No suggestion",
      patternCategory: parsed.patternCategory || "other",
      affectedComponent: parsed.affectedComponent,
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5))
    };
  } catch {
    return {
      whatWentWrong: "Failed to parse response",
      whyItFailed: text.substring(0, 500),
      rootCause: "Parse error",
      suggestedFix: "Manual review required",
      patternCategory: "other",
      confidence: 0
    };
  }
}
var ExplanationGenerator;
var init_explanation_generator = __esm({
  "src/learning/explanation-generator.ts"() {
    init_config();
    dotenv.config();
    ExplanationGenerator = class {
      anthropic = null;
      config;
      promptTemplate = null;
      constructor(config3) {
        this.config = getLearningConfig(config3);
      }
      async getAnthropicClient() {
        if (!this.anthropic) {
          const { default: Anthropic2 } = await import('@anthropic-ai/sdk');
          this.anthropic = new Anthropic2();
        }
        return this.anthropic;
      }
      /**
       * Loads the failure analysis prompt template
       */
      async loadPromptTemplate() {
        if (this.promptTemplate) {
          return this.promptTemplate;
        }
        const promptPath = path10__default.join(
          this.config.promptsDir,
          "failure-analysis.md"
        );
        try {
          this.promptTemplate = await fs14__default.readFile(promptPath, "utf-8");
          return this.promptTemplate;
        } catch (error) {
          throw new Error(
            `Failed to load failure analysis prompt from ${promptPath}: ${error}`
          );
        }
      }
      /**
       * Builds the prompt for a specific failure
       */
      async buildPrompt(failure) {
        const template = await this.loadPromptTemplate();
        const toolCallsFormatted = failure.toolCalls?.length ? failure.toolCalls.map(
          (tc) => `- ${tc.name}${tc.error ? ` (error: ${tc.error})` : ""}`
        ).join("\n") : "None";
        const judgeResultsFormatted = failure.judgeResults?.length ? failure.judgeResults.map(
          (jr) => `- ${jr.judgeId}: ${jr.passed ? "PASSED" : "FAILED"} (score: ${jr.score})
  Reasoning: ${jr.reasoning}`
        ).join("\n") : "None";
        let prompt = template.replace("{{evalName}}", failure.metadata?.evalName ?? failure.id).replace("{{category}}", failure.category ?? "unknown").replace("{{description}}", failure.metadata?.evalDescription ?? "").replace("{{prompt}}", failure.prompt).replace("{{expectedBehavior}}", failure.expectedBehavior ?? "Not specified").replace("{{toolCalls}}", toolCallsFormatted).replace("{{output}}", failure.output || "No output").replace("{{judgeResults}}", judgeResultsFormatted);
        if (failure.error) {
          prompt = prompt.replace("{{#if error}}", "").replace("{{/if}}", "");
          prompt = prompt.replace("{{error}}", failure.error);
        } else {
          prompt = prompt.replace(/{{#if error}}[\s\S]*?{{\/if}}/g, "");
        }
        return prompt;
      }
      parseResponse(text) {
        return parseExplanationResponse(text);
      }
      /**
       * Generates an explanation for a single failure
       */
      async generateExplanation(failure) {
        const prompt = await this.buildPrompt(failure);
        try {
          const client = await this.getAnthropicClient();
          const response = await client.messages.create({
            model: this.config.explanationModel,
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }]
          });
          const content = response.content[0];
          if (content.type !== "text") {
            throw new Error("Unexpected response type from LLM");
          }
          const explanation = this.parseResponse(content.text);
          return {
            id: `explanation-${failure.id}-${Date.now()}`,
            failureInput: failure,
            explanation,
            confidence: explanation.confidence,
            generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
            model: this.config.explanationModel
          };
        } catch (error) {
          console.error(`Failed to generate explanation for ${failure.id}:`, error);
          return {
            id: `explanation-${failure.id}-${Date.now()}`,
            failureInput: failure,
            explanation: {
              whatWentWrong: "Failed to generate explanation",
              whyItFailed: error instanceof Error ? error.message : "Unknown error",
              rootCause: "LLM error",
              suggestedFix: "Manual review required",
              patternCategory: "other"
            },
            confidence: 0,
            generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
            model: this.config.explanationModel
          };
        }
      }
      /**
       * Generates explanations for multiple failures
       */
      async generateExplanations(failures, options) {
        const concurrency = options?.concurrency ?? 3;
        const explanations = [];
        let completed = 0;
        for (let i = 0; i < failures.length; i += concurrency) {
          const batch = failures.slice(i, i + concurrency);
          const batchResults = await Promise.all(
            batch.map((f) => this.generateExplanation(f))
          );
          explanations.push(...batchResults);
          completed += batch.length;
          options?.onProgress?.(completed, failures.length);
        }
        return explanations;
      }
      /**
       * Filters explanations by confidence threshold
       */
      filterByConfidence(explanations, minConfidence = 0.5) {
        return explanations.filter((e) => e.confidence >= minConfidence);
      }
      /**
       * Groups explanations by pattern category
       */
      groupByCategory(explanations) {
        const grouped = {};
        for (const explanation of explanations) {
          const category = explanation.explanation.patternCategory;
          if (!grouped[category]) {
            grouped[category] = [];
          }
          grouped[category].push(explanation);
        }
        return grouped;
      }
    };
  }
});

// src/learning/pattern-detector.ts
function textSimilarity(a, b) {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) {
    return 0;
  }
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = /* @__PURE__ */ new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
}
function explanationSimilarity(a, b) {
  if (a.explanation.patternCategory !== b.explanation.patternCategory) {
    return 0.2;
  }
  const rootCauseSim = textSimilarity(
    a.explanation.rootCause,
    b.explanation.rootCause
  );
  const whatWrongSim = textSimilarity(
    a.explanation.whatWentWrong,
    b.explanation.whyItFailed
  );
  const fixSim = textSimilarity(
    a.explanation.suggestedFix,
    b.explanation.suggestedFix
  );
  return rootCauseSim * 0.5 + whatWrongSim * 0.25 + fixSim * 0.25;
}
function generatePatternId(category, explanations) {
  const allWords = explanations.flatMap((e) => e.explanation.rootCause.toLowerCase().split(/\s+/)).filter((w) => w.length > 3);
  const wordCounts = /* @__PURE__ */ new Map();
  for (const word of allWords) {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  }
  const topWords = [...wordCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([word]) => word);
  const suffix = topWords.length > 0 ? `-${topWords.join("-")}` : "";
  return `${category}${suffix}-${Date.now().toString(36)}`;
}
function generatePatternName(category, explanations) {
  const components = explanations.map((e) => e.explanation.affectedComponent).filter(Boolean);
  const componentCounts = /* @__PURE__ */ new Map();
  for (const comp of components) {
    if (comp) {
      componentCounts.set(comp, (componentCounts.get(comp) || 0) + 1);
    }
  }
  const topComponent = [...componentCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const categoryName = category.replace(/-/g, " ");
  if (topComponent) {
    return `${categoryName} in ${topComponent}`;
  }
  return `${categoryName} pattern`;
}
function extractCommonRootCauses(explanations) {
  const rootCauses = explanations.map((e) => e.explanation.rootCause);
  const uniqueCauses = [];
  for (const cause of rootCauses) {
    const isDuplicate = uniqueCauses.some(
      (existing) => textSimilarity(existing, cause) > 0.7
    );
    if (!isDuplicate) {
      uniqueCauses.push(cause);
    }
  }
  return uniqueCauses.slice(0, 5);
}
var PatternDetector;
var init_pattern_detector = __esm({
  "src/learning/pattern-detector.ts"() {
    init_config();
    PatternDetector = class {
      config;
      constructor(config3) {
        this.config = getLearningConfig(config3);
      }
      /**
       * Detects patterns in a set of failure explanations
       */
      detectPatterns(explanations) {
        if (explanations.length === 0) {
          return [];
        }
        const byCategory = /* @__PURE__ */ new Map();
        for (const exp of explanations) {
          const category = exp.explanation.patternCategory;
          if (!byCategory.has(category)) {
            byCategory.set(category, []);
          }
          byCategory.get(category).push(exp);
        }
        const patterns = [];
        for (const [category, categoryExplanations] of byCategory) {
          if (categoryExplanations.length < this.config.minFailuresForPattern) {
            continue;
          }
          const clusters = this.clusterExplanations(
            categoryExplanations,
            this.config.similarityThreshold
          );
          for (const cluster of clusters) {
            if (cluster.length >= this.config.minFailuresForPattern) {
              patterns.push(this.createPattern(category, cluster));
            }
          }
        }
        return patterns.sort((a, b) => b.frequency - a.frequency);
      }
      /**
       * Clusters explanations by similarity
       */
      clusterExplanations(explanations, threshold) {
        const clusters = [];
        const assigned = /* @__PURE__ */ new Set();
        for (const exp of explanations) {
          if (assigned.has(exp.id)) {
            continue;
          }
          const cluster = [exp];
          assigned.add(exp.id);
          for (const other of explanations) {
            if (assigned.has(other.id)) {
              continue;
            }
            const avgSimilarity = cluster.reduce(
              (sum, member) => sum + explanationSimilarity(member, other),
              0
            ) / cluster.length;
            if (avgSimilarity >= threshold) {
              cluster.push(other);
              assigned.add(other.id);
            }
          }
          clusters.push(cluster);
        }
        return clusters;
      }
      /**
       * Creates a FailurePattern from a cluster of explanations
       */
      createPattern(category, explanations) {
        let totalSim = 0;
        let pairCount = 0;
        for (let i = 0; i < explanations.length; i++) {
          for (let j = i + 1; j < explanations.length; j++) {
            totalSim += explanationSimilarity(explanations[i], explanations[j]);
            pairCount++;
          }
        }
        const avgSimilarity = pairCount > 0 ? totalSim / pairCount : 1;
        const components = /* @__PURE__ */ new Set();
        for (const exp of explanations) {
          if (exp.explanation.affectedComponent) {
            components.add(exp.explanation.affectedComponent);
          }
        }
        return {
          patternId: generatePatternId(category, explanations),
          patternName: generatePatternName(category, explanations),
          category,
          failures: explanations,
          frequency: explanations.length,
          affectedComponents: [...components],
          commonRootCauses: extractCommonRootCauses(explanations),
          similarityScore: avgSimilarity,
          detectedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
      }
      /**
       * Merges similar patterns across different runs
       */
      mergeWithExisting(newPatterns, existingPatterns) {
        const merged = [...existingPatterns];
        for (const newPattern of newPatterns) {
          const existingIndex = merged.findIndex(
            (existing) => existing.category === newPattern.category && this.patternsAreSimilar(existing, newPattern)
          );
          if (existingIndex >= 0) {
            const existing = merged[existingIndex];
            merged[existingIndex] = {
              ...existing,
              failures: [...existing.failures, ...newPattern.failures],
              frequency: existing.frequency + newPattern.frequency,
              affectedComponents: [
                .../* @__PURE__ */ new Set([
                  ...existing.affectedComponents,
                  ...newPattern.affectedComponents
                ])
              ],
              commonRootCauses: extractCommonRootCauses([
                ...existing.failures,
                ...newPattern.failures
              ])
            };
          } else {
            merged.push(newPattern);
          }
        }
        return merged;
      }
      /**
       * Checks if two patterns are similar enough to merge
       */
      patternsAreSimilar(a, b) {
        const aCauses = a.commonRootCauses.join(" ");
        const bCauses = b.commonRootCauses.join(" ");
        return textSimilarity(aCauses, bCauses) > 0.6;
      }
      /**
       * Gets pattern statistics
       */
      getStats(patterns) {
        const totalPatterns = patterns.length;
        const totalFailures = patterns.reduce((sum, p) => sum + p.frequency, 0);
        const avgPatterSize = totalPatterns > 0 ? totalFailures / totalPatterns : 0;
        const byCategory = {};
        for (const pattern of patterns) {
          byCategory[pattern.category] = (byCategory[pattern.category] || 0) + pattern.frequency;
        }
        return {
          totalPatterns,
          totalFailures,
          avgPatterSize,
          byCategory
        };
      }
    };
  }
});
function parseRuleGenerationResponse(text, defaultTargetSection, fallbackEvalIds) {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonContent = jsonMatch ? jsonMatch[1] : text;
  try {
    const parsed = JSON.parse(jsonContent.trim());
    return {
      rule: parsed.rule || "No rule generated",
      targetSection: parsed.targetSection || defaultTargetSection,
      placement: parsed.placement,
      rationale: parsed.rationale || "No rationale provided",
      expectedImpact: {
        evalIds: parsed.expectedImpact?.evalIds || fallbackEvalIds,
        confidenceScore: Math.max(
          0,
          Math.min(1, parsed.expectedImpact?.confidenceScore || 0.5)
        )
      }
    };
  } catch {
    return {
      rule: text.substring(0, 500),
      targetSection: defaultTargetSection,
      rationale: "Failed to parse structured response",
      expectedImpact: {
        evalIds: fallbackEvalIds,
        confidenceScore: 0.3
      }
    };
  }
}
function getTargetSectionForCategory(category) {
  return CATEGORY_TO_SECTION[category] || CATEGORY_TO_SECTION["other"];
}
var CATEGORY_TO_SECTION, RuleGenerator;
var init_rule_generator = __esm({
  "src/learning/rule-generator.ts"() {
    init_config();
    dotenv.config();
    CATEGORY_TO_SECTION = {
      "routing-error": "CHAT_PROMPT.delegationPrinciple",
      "delegation-error": "CHAT_PROMPT.delegationPrinciple",
      "missing-tool-call": "CHAT_PROMPT.troubleshooting",
      "incorrect-code-pattern": "CORE_INSTRUCTIONS",
      "validation-failure": "CORE_INSTRUCTIONS.coreSafetyRules",
      "context-missing": "CHAT_PROMPT.reasoningAndPlanning",
      other: "CORE_INSTRUCTIONS"
    };
    RuleGenerator = class {
      anthropic = null;
      config;
      promptTemplate = null;
      currentInstructions = /* @__PURE__ */ new Map();
      constructor(config3) {
        this.config = getLearningConfig(config3);
      }
      async getAnthropicClient() {
        if (!this.anthropic) {
          const { default: Anthropic2 } = await import('@anthropic-ai/sdk');
          this.anthropic = new Anthropic2();
        }
        return this.anthropic;
      }
      /**
       * Loads the rule generation prompt template
       */
      async loadPromptTemplate() {
        if (this.promptTemplate) {
          return this.promptTemplate;
        }
        const promptPath = path10__default.join(this.config.promptsDir, "rule-generation.md");
        try {
          this.promptTemplate = await fs14__default.readFile(promptPath, "utf-8");
          return this.promptTemplate;
        } catch (error) {
          throw new Error(
            `Failed to load rule generation prompt from ${promptPath}: ${error}`
          );
        }
      }
      /**
       * Loads current instructions from prompt-templates.ts
       * (Reads a simplified version for context)
       */
      async loadCurrentInstructions() {
        const templatePath = path10__default.join(
          this.config.learningDir,
          "..",
          "..",
          "lib",
          "ai",
          "claude-code",
          "prompt-templates.ts"
        );
        try {
          const content = await fs14__default.readFile(templatePath, "utf-8");
          const sections = [
            "CORE_INSTRUCTIONS",
            "CHAT_PROMPT",
            "delegationPrinciple",
            "coreSafetyRules",
            "troubleshooting"
          ];
          for (const section of sections) {
            const regex = new RegExp(
              `${section}[:\\s]*[\`'"](.*?)[\`'"]`,
              "gs"
            );
            const match = content.match(regex);
            if (match) {
              this.currentInstructions.set(
                section,
                match[0].substring(0, 500) + "..."
              );
            }
          }
        } catch (error) {
          console.warn("Could not load current instructions:", error);
        }
      }
      getTargetSection(pattern) {
        return getTargetSectionForCategory(pattern.category);
      }
      /**
       * Builds the prompt for rule generation
       */
      async buildPrompt(pattern) {
        const template = await this.loadPromptTemplate();
        const targetSection = this.getTargetSection(pattern);
        const sectionKey = targetSection.split(".")[0];
        const currentInstructions = this.currentInstructions.get(sectionKey) || "(Instructions not loaded)";
        const failuresFormatted = pattern.failures.slice(0, 5).map((f, i) => {
          const evalName = f.failureInput.metadata?.evalName || f.failureInput.id;
          return `#### Failure ${i + 1}
- **Eval**: ${evalName}
- **What Went Wrong**: ${f.explanation.whatWentWrong}
- **Why It Failed**: ${f.explanation.whyItFailed}
- **Suggested Fix**: ${f.explanation.suggestedFix}`;
        }).join("\n\n");
        let prompt = template.replace("{{targetSection}}", targetSection).replace("{{currentInstructions}}", currentInstructions).replace("{{patternName}}", pattern.patternName).replace("{{patternCategory}}", pattern.category).replace("{{frequency}}", pattern.frequency.toString()).replace("{{affectedComponents}}", pattern.affectedComponents.join(", ") || "None specified").replace("{{commonRootCauses}}", pattern.commonRootCauses.join("\n- ") || "None identified");
        prompt = prompt.replace(
          /{{#each failures}}[\s\S]*?{{\/each}}/g,
          failuresFormatted
        );
        return prompt;
      }
      parseResponse(text, pattern) {
        const fallbackEvalIds = pattern.failures.slice(0, 5).map((f) => f.failureInput.id);
        return parseRuleGenerationResponse(
          text,
          this.getTargetSection(pattern),
          fallbackEvalIds
        );
      }
      /**
       * Generates a rule for a single pattern
       */
      async generateRule(pattern) {
        const prompt = await this.buildPrompt(pattern);
        try {
          const client = await this.getAnthropicClient();
          const response = await client.messages.create({
            model: this.config.ruleGenerationModel,
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }]
          });
          const content = response.content[0];
          if (content.type !== "text") {
            throw new Error("Unexpected response type from LLM");
          }
          const result = this.parseResponse(content.text, pattern);
          return {
            ruleId: `rule-${pattern.patternId}`,
            ruleContent: result.rule,
            targetSection: result.targetSection,
            placement: result.placement,
            rationale: result.rationale,
            addressesPatterns: [pattern.patternId],
            expectedImpact: {
              failureIds: result.expectedImpact.evalIds,
              confidenceScore: result.expectedImpact.confidenceScore
            },
            status: "pending",
            generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
            model: this.config.ruleGenerationModel,
            source: `iteration-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}`
          };
        } catch (error) {
          console.error(`Failed to generate rule for pattern ${pattern.patternId}:`, error);
          return {
            ruleId: `rule-${pattern.patternId}`,
            ruleContent: `[Generation failed: ${error instanceof Error ? error.message : "Unknown error"}]`,
            targetSection: this.getTargetSection(pattern),
            rationale: "Rule generation failed",
            addressesPatterns: [pattern.patternId],
            expectedImpact: {
              failureIds: [],
              confidenceScore: 0
            },
            status: "pending",
            generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
            model: this.config.ruleGenerationModel,
            source: `iteration-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}`
          };
        }
      }
      /**
       * Generates rules for multiple patterns
       */
      async generateRules(patterns, options) {
        await this.loadCurrentInstructions();
        const maxRules = options?.maxRules ?? this.config.maxRulesPerIteration;
        const patternsToProcess = patterns.slice(0, maxRules);
        const rules = [];
        for (let i = 0; i < patternsToProcess.length; i++) {
          const pattern = patternsToProcess[i];
          const rule = await this.generateRule(pattern);
          rules.push(rule);
          options?.onProgress?.(i + 1, patternsToProcess.length);
        }
        return rules;
      }
      /**
       * Filters rules by confidence
       */
      filterByConfidence(rules, minConfidence) {
        const threshold = minConfidence ?? this.config.minRuleConfidence;
        return rules.filter(
          (r) => r.expectedImpact.confidenceScore >= threshold
        );
      }
      /**
       * Checks for conflicts between a new rule and existing rules
       */
      checkForConflicts(newRule, existingRules) {
        const conflicting = existingRules.filter((existing) => {
          if (existing.targetSection !== newRule.targetSection) {
            return false;
          }
          const newLower = newRule.ruleContent.toLowerCase();
          const existingLower = existing.ruleContent.toLowerCase();
          const hasAlways = newLower.includes("always");
          const hasNever = newLower.includes("never");
          const existingHasAlways = existingLower.includes("always");
          const existingHasNever = existingLower.includes("never");
          if (hasAlways && existingHasNever || hasNever && existingHasAlways) {
            const newWords = new Set(newLower.split(/\s+/).filter((w) => w.length > 4));
            const existingWords = new Set(existingLower.split(/\s+/).filter((w) => w.length > 4));
            const commonWords = [...newWords].filter((w) => existingWords.has(w));
            if (commonWords.length > 2) {
              return true;
            }
          }
          return false;
        });
        return {
          hasConflict: conflicting.length > 0,
          conflictingRules: conflicting
        };
      }
    };
  }
});
function formatRuleDisplay(rule, index, total) {
  const header = `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  PROMPT LEARNING: RULE REVIEW (${index + 1}/${total})
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`;
  const ruleBox = `
\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502 ${rule.ruleContent.split("\n").map((line) => line.padEnd(63)).join("\n\u2502 ")}
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518`;
  const evidence = `
Evidence:
  - Pattern: ${rule.addressesPatterns.join(", ")}
  - Target: ${rule.targetSection}
  - Confidence: ${(rule.expectedImpact.confidenceScore * 100).toFixed(0)}%
  - Affects: ${rule.expectedImpact.failureIds.slice(0, 3).join(", ")}${rule.expectedImpact.failureIds.length > 3 ? "..." : ""}

Rationale:
  ${rule.rationale}`;
  return header + "\n" + ruleBox + evidence;
}
var CLIReviewer;
var init_cli_reviewer = __esm({
  "src/learning/cli-reviewer.ts"() {
    CLIReviewer = class {
      rl = null;
      /**
       * Creates readline interface
       */
      createInterface() {
        return readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
      }
      /**
       * Prompts user for input
       */
      async prompt(question) {
        return new Promise((resolve) => {
          this.rl?.question(question, (answer) => {
            resolve(answer.trim().toLowerCase());
          });
        });
      }
      /**
       * Prompts for multi-line input
       */
      async promptMultiline(prompt) {
        console.log(prompt);
        console.log("(Enter an empty line to finish)");
        const lines = [];
        let line = await this.prompt("> ");
        while (line !== "") {
          lines.push(line);
          line = await this.prompt("> ");
        }
        return lines.join("\n");
      }
      /**
       * Reviews a single rule
       */
      async reviewRule(rule, index, total) {
        console.log(formatRuleDisplay(rule, index, total));
        console.log("\n[A]pprove  [R]eject  [M]odify  [S]kip  [Q]uit\n");
        const answer = await this.prompt("Your choice: ");
        switch (answer) {
          case "a":
          case "approve":
            const approveNotes = await this.prompt("Notes (optional): ");
            return {
              rule: { ...rule, status: "approved" },
              decision: "approve",
              notes: approveNotes || void 0
            };
          case "r":
          case "reject":
            const rejectReason = await this.prompt("Reason for rejection: ");
            return {
              rule: { ...rule, status: "rejected", reviewNotes: rejectReason },
              decision: "reject",
              notes: rejectReason
            };
          case "m":
          case "modify":
            console.log("\nCurrent rule:");
            console.log(rule.ruleContent);
            const modified = await this.promptMultiline("\nEnter modified rule:");
            return {
              rule: { ...rule, status: "approved", ruleContent: modified },
              decision: "modify",
              modifiedRule: modified
            };
          case "s":
          case "skip":
            return {
              rule,
              decision: "skip"
            };
          case "q":
          case "quit":
            throw new Error("Review session aborted by user");
          default:
            console.log("Invalid choice. Please try again.");
            return this.reviewRule(rule, index, total);
        }
      }
      /**
       * Starts an interactive review session
       */
      async startReviewSession(rules) {
        if (rules.length === 0) {
          console.log("No rules to review.");
          return { decisions: [], approved: [], rejected: [], skipped: [] };
        }
        this.rl = this.createInterface();
        console.log(`
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557`);
        console.log(`\u2551              PROMPT LEARNING SYSTEM                            \u2551`);
        console.log(`\u2551              Interactive Rule Review                           \u2551`);
        console.log(`\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563`);
        console.log(`\u2551  ${rules.length} rule(s) to review                                          \u2551`);
        console.log(`\u2551                                                                \u2551`);
        console.log(`\u2551  Commands:                                                     \u2551`);
        console.log(`\u2551    [A]pprove - Accept the rule as-is                          \u2551`);
        console.log(`\u2551    [R]eject  - Reject the rule with reason                    \u2551`);
        console.log(`\u2551    [M]odify  - Edit the rule before approving                 \u2551`);
        console.log(`\u2551    [S]kip    - Skip for now, review later                     \u2551`);
        console.log(`\u2551    [Q]uit    - Exit review session                            \u2551`);
        console.log(`\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D
`);
        const decisions = [];
        const approved = [];
        const rejected = [];
        const skipped = [];
        try {
          for (let i = 0; i < rules.length; i++) {
            const decision = await this.reviewRule(rules[i], i, rules.length);
            decisions.push(decision);
            switch (decision.decision) {
              case "approve":
              case "modify":
                approved.push(decision.rule);
                break;
              case "reject":
                rejected.push(decision.rule);
                break;
              case "skip":
                skipped.push(decision.rule);
                break;
            }
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes("aborted")) {
            console.log("\nReview session aborted.");
          } else {
            throw error;
          }
        } finally {
          this.rl?.close();
          this.rl = null;
        }
        console.log("\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
        console.log("  REVIEW SESSION COMPLETE");
        console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
        console.log(`  Approved: ${approved.length}`);
        console.log(`  Rejected: ${rejected.length}`);
        console.log(`  Skipped:  ${skipped.length}`);
        console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
        return { decisions, approved, rejected, skipped };
      }
      /**
       * Prints a summary of rules without interactive review
       */
      printRulesSummary(rules) {
        console.log("\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
        console.log("\u2551              PROPOSED RULES SUMMARY                            \u2551");
        console.log("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D\n");
        for (const [i, rule] of rules.entries()) {
          console.log(`[${i + 1}] ${rule.ruleId}`);
          console.log(`    Target: ${rule.targetSection}`);
          console.log(`    Confidence: ${(rule.expectedImpact.confidenceScore * 100).toFixed(0)}%`);
          console.log(`    Rule: ${rule.ruleContent.substring(0, 80)}...`);
          console.log("");
        }
      }
      /**
       * Quick approve all rules (for non-interactive mode)
       */
      autoApproveAll(rules, minConfidence = 0.8) {
        const decisions = [];
        const approved = [];
        const rejected = [];
        const skipped = [];
        for (const rule of rules) {
          if (rule.expectedImpact.confidenceScore >= minConfidence) {
            const approvedRule = { ...rule, status: "approved" };
            decisions.push({ rule: approvedRule, decision: "approve" });
            approved.push(approvedRule);
          } else {
            decisions.push({ rule, decision: "skip" });
            skipped.push(rule);
          }
        }
        return { decisions, approved, rejected, skipped };
      }
    };
  }
});
var RuleWriter;
var init_rule_writer = __esm({
  "src/learning/rule-writer.ts"() {
    init_config();
    RuleWriter = class {
      config;
      constructor(config3) {
        this.config = getLearningConfig(config3);
      }
      /**
       * Ensures rules directories exist
       */
      async ensureDirectories() {
        await fs14__default.mkdir(this.config.rulesDir, { recursive: true });
        await fs14__default.mkdir(this.config.pendingDir, { recursive: true });
        await fs14__default.mkdir(this.config.approvedDir, { recursive: true });
        await fs14__default.mkdir(this.config.rejectedDir, { recursive: true });
      }
      /**
       * Reads the current learned rules file
       */
      async readLearnedRules() {
        try {
          const content = await fs14__default.readFile(this.config.learnedRulesPath, "utf-8");
          return JSON.parse(content);
        } catch {
          return {
            rules: [],
            lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
            iterations: []
          };
        }
      }
      /**
       * Writes rules to the learned rules file
       */
      async writeLearnedRules(rules) {
        await this.ensureDirectories();
        const content = JSON.stringify(rules, null, 2);
        await fs14__default.writeFile(this.config.learnedRulesPath, content, "utf-8");
      }
      /**
       * Adds approved rules to the learned rules file
       */
      async addApprovedRules(rules, iterationId) {
        const current = await this.readLearnedRules();
        for (const rule of rules) {
          const existingIndex = current.rules.findIndex(
            (r) => r.ruleId === rule.ruleId
          );
          if (existingIndex >= 0) {
            current.rules[existingIndex] = { ...rule, status: "approved" };
          } else {
            current.rules.push({ ...rule, status: "approved" });
          }
        }
        current.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
        if (!current.iterations.includes(iterationId)) {
          current.iterations.push(iterationId);
        }
        await this.writeLearnedRules(current);
      }
      /**
       * Saves a rule to the pending directory for later review
       */
      async savePendingRule(rule) {
        await this.ensureDirectories();
        const filename = `${rule.ruleId}.json`;
        const filepath = path10__default.join(this.config.pendingDir, filename);
        await fs14__default.writeFile(filepath, JSON.stringify(rule, null, 2), "utf-8");
        return filepath;
      }
      /**
       * Saves multiple pending rules
       */
      async savePendingRules(rules) {
        const paths = [];
        for (const rule of rules) {
          const filepath = await this.savePendingRule(rule);
          paths.push(filepath);
        }
        return paths;
      }
      /**
       * Loads pending rules from the pending directory
       */
      async loadPendingRules() {
        try {
          const files = await fs14__default.readdir(this.config.pendingDir);
          const jsonFiles = files.filter((f) => f.endsWith(".json"));
          const rules = [];
          for (const file of jsonFiles) {
            const filepath = path10__default.join(this.config.pendingDir, file);
            const content = await fs14__default.readFile(filepath, "utf-8");
            rules.push(JSON.parse(content));
          }
          return rules;
        } catch {
          return [];
        }
      }
      /**
       * Moves a pending rule to approved
       */
      async approvePendingRule(ruleId) {
        const pendingPath = path10__default.join(this.config.pendingDir, `${ruleId}.json`);
        const approvedPath = path10__default.join(this.config.approvedDir, `${ruleId}.json`);
        try {
          const content = await fs14__default.readFile(pendingPath, "utf-8");
          const rule = JSON.parse(content);
          rule.status = "approved";
          await fs14__default.writeFile(approvedPath, JSON.stringify(rule, null, 2), "utf-8");
          await fs14__default.unlink(pendingPath);
          await this.addApprovedRules([rule], `manual-${Date.now()}`);
        } catch (error) {
          throw new Error(`Failed to approve rule ${ruleId}: ${error}`);
        }
      }
      /**
       * Moves a pending rule to rejected
       */
      async rejectPendingRule(ruleId, reason) {
        const pendingPath = path10__default.join(this.config.pendingDir, `${ruleId}.json`);
        const rejectedPath = path10__default.join(this.config.rejectedDir, `${ruleId}.json`);
        try {
          const content = await fs14__default.readFile(pendingPath, "utf-8");
          const rule = JSON.parse(content);
          rule.status = "rejected";
          rule.reviewNotes = reason;
          await fs14__default.writeFile(rejectedPath, JSON.stringify(rule, null, 2), "utf-8");
          await fs14__default.unlink(pendingPath);
        } catch (error) {
          throw new Error(`Failed to reject rule ${ruleId}: ${error}`);
        }
      }
      /**
       * Clears all pending rules
       */
      async clearPendingRules() {
        try {
          const files = await fs14__default.readdir(this.config.pendingDir);
          for (const file of files) {
            await fs14__default.unlink(path10__default.join(this.config.pendingDir, file));
          }
          return files.length;
        } catch {
          return 0;
        }
      }
      /**
       * Reads the learning history
       */
      async readHistory() {
        try {
          const content = await fs14__default.readFile(this.config.historyPath, "utf-8");
          return JSON.parse(content);
        } catch {
          return {
            iterations: [],
            totalRulesGenerated: 0,
            totalRulesApproved: 0,
            totalRulesRejected: 0,
            lastRunAt: (/* @__PURE__ */ new Date()).toISOString()
          };
        }
      }
      /**
       * Writes the learning history
       */
      async writeHistory(history) {
        await this.ensureDirectories();
        await fs14__default.writeFile(
          this.config.historyPath,
          JSON.stringify(history, null, 2),
          "utf-8"
        );
      }
      /**
       * Adds a learning iteration to the history
       */
      async addIterationToHistory(iteration) {
        const history = await this.readHistory();
        history.iterations.push(iteration);
        history.totalRulesGenerated += iteration.rulesProposed.length;
        history.totalRulesApproved += iteration.rulesApproved.length;
        history.totalRulesRejected += iteration.rulesRejected.length;
        history.lastRunAt = iteration.timestamp;
        await this.writeHistory(history);
      }
      /**
       * Gets statistics about stored rules
       */
      async getStats() {
        const rules = await this.readLearnedRules();
        const pending = await this.loadPendingRules();
        const history = await this.readHistory();
        let approvedCount = 0;
        let rejectedCount = 0;
        try {
          approvedCount = (await fs14__default.readdir(this.config.approvedDir)).length;
        } catch {
        }
        try {
          rejectedCount = (await fs14__default.readdir(this.config.rejectedDir)).length;
        } catch {
        }
        return {
          totalRules: rules.rules.length,
          pendingCount: pending.length,
          approvedCount,
          rejectedCount,
          iterationsCount: history.iterations.length
        };
      }
    };
  }
});

// src/learning/learning-runner.ts
var learning_runner_exports = {};
__export(learning_runner_exports, {
  LearningRunner: () => LearningRunner,
  default: () => learning_runner_default
});
var LearningRunner, learning_runner_default;
var init_learning_runner = __esm({
  "src/learning/learning-runner.ts"() {
    init_data_sources();
    init_explanation_generator();
    init_pattern_detector();
    init_rule_generator();
    init_cli_reviewer();
    init_rule_writer();
    init_config();
    LearningRunner = class {
      config;
      explanationGenerator;
      patternDetector;
      ruleGenerator;
      cliReviewer;
      ruleWriter;
      constructor(config3) {
        this.config = getLearningConfig({ ...getConfigFromEnv(), ...config3 });
        this.explanationGenerator = new ExplanationGenerator(this.config);
        this.patternDetector = new PatternDetector(this.config);
        this.ruleGenerator = new RuleGenerator(this.config);
        this.cliReviewer = new CLIReviewer();
        this.ruleWriter = new RuleWriter(this.config);
      }
      /**
       * Runs a full learning iteration
       */
      async runIteration(options = {}) {
        const startTime = Date.now();
        const iterationId = `iteration-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}`;
        console.log("\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
        console.log("\u2551              PROMPT LEARNING SYSTEM                            \u2551");
        console.log("\u2551              Starting Learning Iteration                       \u2551");
        console.log("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D\n");
        console.log("\u{1F4E5} Phase 1: Collecting failures...");
        const sources = options.sources || ["eval", "jsonl"];
        const collectOptions = {
          ...options.collectOptions,
          projectId: options.projectId,
          taskId: options.taskId
        };
        const failures = await collectFromSources(sources, collectOptions);
        console.log(`   Found ${failures.length} failures from ${sources.join(", ")}`);
        if (failures.length === 0) {
          console.log("\n\u2705 No failures to analyze. System is performing well!\n");
          return this.createEmptyResult(iterationId, startTime, sources);
        }
        console.log("\n\u{1F50D} Phase 2: Generating failure explanations...");
        const explanations = await this.explanationGenerator.generateExplanations(
          failures,
          {
            concurrency: 3,
            onProgress: (completed, total) => {
              process.stdout.write(`\r   Progress: ${completed}/${total}`);
              options.onProgress?.("explanations", completed, total);
            }
          }
        );
        console.log(`
   Generated ${explanations.length} explanations`);
        console.log("\n\u{1F517} Phase 3: Detecting patterns...");
        const patterns = this.patternDetector.detectPatterns(explanations);
        console.log(`   Detected ${patterns.length} patterns`);
        if (patterns.length === 0) {
          console.log("\n\u26A0\uFE0F  No patterns detected. Failures may be too diverse.\n");
          return this.createResult(
            iterationId,
            startTime,
            sources,
            failures.length,
            explanations.length,
            [],
            [],
            [],
            []
          );
        }
        this.printPatternSummary(patterns);
        console.log("\n\u{1F4DD} Phase 4: Generating rules...");
        const proposedRules = await this.ruleGenerator.generateRules(patterns, {
          maxRules: this.config.maxRulesPerIteration,
          onProgress: (completed, total) => {
            process.stdout.write(`\r   Progress: ${completed}/${total}`);
            options.onProgress?.("rules", completed, total);
          }
        });
        console.log(`
   Generated ${proposedRules.length} proposed rules`);
        const filteredRules = this.ruleGenerator.filterByConfidence(proposedRules);
        console.log(`   ${filteredRules.length} rules pass confidence threshold`);
        if (filteredRules.length === 0) {
          console.log("\n\u26A0\uFE0F  No rules passed confidence threshold.\n");
          return this.createResult(
            iterationId,
            startTime,
            sources,
            failures.length,
            explanations.length,
            patterns,
            proposedRules,
            [],
            []
          );
        }
        let approvedRules = [];
        let rejectedRules = [];
        if (options.autoApprove) {
          console.log("\n\u2705 Phase 5: Auto-approving rules...");
          const session = this.cliReviewer.autoApproveAll(
            filteredRules,
            options.autoApproveThreshold || 0.8
          );
          approvedRules = session.approved;
          rejectedRules = session.rejected;
          console.log(`   Auto-approved: ${approvedRules.length}, Skipped: ${session.skipped.length}`);
        } else if (options.savePending) {
          console.log("\n\u{1F4BE} Phase 5: Saving rules for later review...");
          await this.ruleWriter.savePendingRules(filteredRules);
          console.log(`   Saved ${filteredRules.length} rules to pending/`);
          console.log('   Run "npm run learn:review" to review them');
        } else {
          console.log("\n\u{1F464} Phase 5: Interactive review...");
          const session = await this.cliReviewer.startReviewSession(filteredRules);
          approvedRules = session.approved;
          rejectedRules = session.rejected;
        }
        if (approvedRules.length > 0) {
          console.log("\n\u{1F4BE} Phase 6: Saving approved rules...");
          await this.ruleWriter.addApprovedRules(approvedRules, iterationId);
          console.log(`   Saved ${approvedRules.length} rules to learned-rules.json`);
        }
        const result = this.createResult(
          iterationId,
          startTime,
          sources,
          failures.length,
          explanations.length,
          patterns,
          proposedRules,
          approvedRules,
          rejectedRules
        );
        await this.ruleWriter.addIterationToHistory(result);
        this.printIterationSummary(result);
        return result;
      }
      /**
       * Analyzes failures without generating rules
       */
      async analyze(options = {}) {
        console.log("\n\u{1F4CA} ANALYZE MODE: Collecting and analyzing failures...\n");
        const sources = options.sources || ["eval", "jsonl"];
        const collectOptions = {
          ...options.collectOptions,
          projectId: options.projectId,
          taskId: options.taskId
        };
        const failures = await collectFromSources(sources, collectOptions);
        console.log(`Found ${failures.length} failures`);
        if (failures.length === 0) {
          return { failures: [], explanations: [], patterns: [] };
        }
        const explanations = await this.explanationGenerator.generateExplanations(
          failures,
          { concurrency: 3 }
        );
        console.log(`Generated ${explanations.length} explanations`);
        const patterns = this.patternDetector.detectPatterns(explanations);
        console.log(`Detected ${patterns.length} patterns`);
        this.printPatternSummary(patterns);
        return { failures, explanations, patterns };
      }
      /**
       * Reviews pending rules
       */
      async reviewPending() {
        const pending = await this.ruleWriter.loadPendingRules();
        if (pending.length === 0) {
          console.log("No pending rules to review.");
          return;
        }
        const session = await this.cliReviewer.startReviewSession(pending);
        for (const decision of session.decisions) {
          if (decision.decision === "approve" || decision.decision === "modify") {
            await this.ruleWriter.approvePendingRule(decision.rule.ruleId);
          } else if (decision.decision === "reject") {
            await this.ruleWriter.rejectPendingRule(
              decision.rule.ruleId,
              decision.notes || "Rejected"
            );
          }
        }
        console.log(`
Approved: ${session.approved.length}`);
        console.log(`Rejected: ${session.rejected.length}`);
        console.log(`Remaining pending: ${session.skipped.length}`);
      }
      /**
       * Shows current stats
       */
      async showStats() {
        console.log("\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
        console.log("\u2551              PROMPT LEARNING SYSTEM STATUS                     \u2551");
        console.log("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D\n");
        const sourceStats = await getSourceStats();
        console.log("Data Sources:");
        for (const [name, stats] of Object.entries(sourceStats)) {
          const status = stats.available ? "\u2705" : "\u274C";
          const count = stats.failureCount !== void 0 ? ` (${stats.failureCount} failures)` : "";
          console.log(`  ${status} ${name}${count}`);
          if (stats.details) {
            console.log(`      Projects: ${stats.details.projects}`);
            console.log(`      Files: ${stats.details.files}`);
            console.log(`      Sessions: ${stats.details.sessions}`);
          }
        }
        const ruleStats = await this.ruleWriter.getStats();
        console.log("\nRules:");
        console.log(`  Total learned: ${ruleStats.totalRules}`);
        console.log(`  Pending review: ${ruleStats.pendingCount}`);
        console.log(`  Approved: ${ruleStats.approvedCount}`);
        console.log(`  Rejected: ${ruleStats.rejectedCount}`);
        console.log(`  Iterations: ${ruleStats.iterationsCount}`);
        console.log("");
      }
      /**
       * Creates an empty result for no-failures case
       */
      createEmptyResult(iterationId, startTime, sources) {
        return {
          iterationId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          sources,
          failuresCollected: 0,
          explanationsGenerated: 0,
          patternsDetected: [],
          rulesProposed: [],
          rulesApproved: [],
          rulesRejected: [],
          durationMs: Date.now() - startTime
        };
      }
      /**
       * Creates a full result
       */
      createResult(iterationId, startTime, sources, failuresCollected, explanationsGenerated, patterns, proposed, approved, rejected) {
        return {
          iterationId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          sources,
          failuresCollected,
          explanationsGenerated,
          patternsDetected: patterns,
          rulesProposed: proposed,
          rulesApproved: approved,
          rulesRejected: rejected,
          durationMs: Date.now() - startTime
        };
      }
      /**
       * Prints pattern summary
       */
      printPatternSummary(patterns) {
        console.log("\n   Patterns detected:");
        for (const pattern of patterns.slice(0, 5)) {
          console.log(`     - ${pattern.patternName} (${pattern.frequency} failures)`);
        }
        if (patterns.length > 5) {
          console.log(`     ... and ${patterns.length - 5} more`);
        }
      }
      /**
       * Prints iteration summary
       */
      printIterationSummary(result) {
        console.log("\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
        console.log("  LEARNING ITERATION COMPLETE");
        console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
        console.log(`  Iteration ID: ${result.iterationId}`);
        console.log(`  Duration: ${(result.durationMs / 1e3).toFixed(1)}s`);
        console.log("");
        console.log(`  Failures analyzed: ${result.failuresCollected}`);
        console.log(`  Explanations generated: ${result.explanationsGenerated}`);
        console.log(`  Patterns detected: ${result.patternsDetected.length}`);
        console.log(`  Rules proposed: ${result.rulesProposed.length}`);
        console.log(`  Rules approved: ${result.rulesApproved.length}`);
        console.log(`  Rules rejected: ${result.rulesRejected.length}`);
        console.log("");
        console.log("  Next steps:");
        console.log("    1. Review learned-rules.json");
        console.log("    2. Manually integrate approved rules into prompt-templates.ts");
        console.log("    3. Run evals to validate improvements");
        console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
      }
    };
    learning_runner_default = LearningRunner;
  }
});

// src/config/types.ts
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

// src/config/config-loader.ts
var CONFIG_FILE_NAMES = [
  "vibe-check.config.ts",
  "vibe-check.config.js",
  "vibe-check.config.mjs"
];
async function loadConfig(configPath) {
  const cwd = process.cwd();
  let configFile;
  if (configPath) {
    configFile = path10.isAbsolute(configPath) ? configPath : path10.join(cwd, configPath);
  } else {
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = path10.join(cwd, name);
      try {
        await fs14.access(candidate);
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

// src/runner/eval-runner.ts
init_schemas();

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
    const workspacePath = path10.join(baseDir, id);
    await fs14.mkdir(workspacePath, { recursive: true });
    await fs14.mkdir(path10.join(workspacePath, "src"), { recursive: true });
    await fs14.writeFile(
      path10.join(workspacePath, "package.json"),
      JSON.stringify({ name: "eval-workspace", version: "1.0.0", type: "module" }, null, 2)
    );
    return { id, path: workspacePath };
  }
  getWorkspaceBaseDir() {
    const cwd = process.cwd();
    const evalsResultsDir = path10.join(cwd, "__evals__", "results", "workspaces");
    try {
      fsSync.mkdirSync(evalsResultsDir, { recursive: true });
      const testFile = path10.join(evalsResultsDir, ".write-test");
      fsSync.writeFileSync(testFile, "");
      fsSync.unlinkSync(testFile);
      return evalsResultsDir;
    } catch {
      const tmpDir = fsSync.realpathSync(os.tmpdir());
      return path10.join(tmpDir, "vibe-check-evals");
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
          await fs14.rm(workspace.path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
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
      const claudeDir = path10.join(workspacePath, ".claude", "projects");
      try {
        await fs14.access(claudeDir);
      } catch {
        return toolCalls;
      }
      const projectDirs = await fs14.readdir(claudeDir);
      for (const projectDir of projectDirs) {
        const projectPath = path10.join(claudeDir, projectDir);
        const stat4 = await fs14.stat(projectPath);
        if (!stat4.isDirectory()) continue;
        const files = await fs14.readdir(projectPath);
        const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
        for (const jsonlFile of jsonlFiles) {
          const filePath = path10.join(projectPath, jsonlFile);
          const content = await fs14.readFile(filePath, "utf-8");
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
init_schemas();
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
      const fullPath = path10.join(baseDir, file);
      try {
        await fs14.access(fullPath);
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
init_schemas();
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
init_schemas();
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
      const fullPath = path10.join(baseDir, file);
      let content = "";
      try {
        content = await fs14.readFile(fullPath, "utf-8");
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
init_schemas();
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
      const claudeDir = path10.join(workspacePath, ".claude", "projects");
      try {
        await fs14.access(claudeDir);
      } catch {
        return agents;
      }
      const projectDirs = await fs14.readdir(claudeDir);
      for (const projectDir of projectDirs) {
        const projectPath = path10.join(claudeDir, projectDir);
        const stat4 = await fs14.stat(projectPath);
        if (!stat4.isDirectory()) continue;
        const files = await fs14.readdir(projectPath);
        const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
        for (const jsonlFile of jsonlFiles) {
          const filePath = path10.join(projectPath, jsonlFile);
          const content = await fs14.readFile(filePath, "utf-8");
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
init_schemas();
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
      const claudeDir = path10.join(workspacePath, ".claude", "projects");
      try {
        await fs14.access(claudeDir);
      } catch {
        return skillCalls;
      }
      const projectDirs = await fs14.readdir(claudeDir);
      for (const projectDir of projectDirs) {
        const projectPath = path10.join(claudeDir, projectDir);
        const stat4 = await fs14.stat(projectPath);
        if (!stat4.isDirectory()) continue;
        const files = await fs14.readdir(projectPath);
        const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
        for (const jsonlFile of jsonlFiles) {
          const filePath = path10.join(projectPath, jsonlFile);
          const content = await fs14.readFile(filePath, "utf-8");
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
init_schemas();
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
      const fullPath = path10.join(workingDirectory || executionResult.workingDirectory || "", file);
      try {
        const content = await fs14.readFile(fullPath, "utf-8");
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
  const fullPath = path10.isAbsolute(rubricPath) ? rubricPath : path10.join(process.cwd(), baseDir, rubricPath);
  const content = await fs14.readFile(fullPath, "utf-8");
  const id = path10.basename(rubricPath, path10.extname(rubricPath));
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
        const fullPath = path10.isAbsolute(filePath) ? filePath : path10.join(workingDirectory, filePath);
        try {
          const content = await fs14.readFile(fullPath, "utf-8");
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
      const fullPath = path10.join(workingDirectory, filePath);
      try {
        const content = await fs14.readFile(fullPath, "utf-8");
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

// src/runner/eval-runner.ts
init_eval_loader();
var EvalRunner = class {
  config;
  harness;
  constructor(config3) {
    this.config = config3;
    this.harness = new TestHarness({ config: config3 });
    if (config3.judges && config3.judges.length > 0) {
      const registry = getJudgeRegistry();
      for (const judge of config3.judges) {
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

// src/bin/cli.ts
var program = new Command();
program.name("vibe-check").description("AI agent evaluation framework").version("0.1.0");
program.command("run").description("Run eval suite").option("-c, --config <path>", "Path to config file").option("--category <categories...>", "Filter by category (tool, code-gen, routing, multi-turn, basic)").option("--tag <tags...>", "Filter by tag").option("--id <ids...>", "Filter by eval ID").option("-v, --verbose", "Verbose output").action(async (options) => {
  try {
    const config3 = await loadConfig(options.config);
    if (options.verbose) {
      config3.verbose = true;
    }
    console.log(chalk.blue("\u{1F3AF} Running vibe-check evals...\n"));
    const runner = new EvalRunner(config3);
    const result = await runner.run({
      categories: options.category,
      tags: options.tag,
      ids: options.id
    });
    console.log();
    printSummary(result);
    process.exit(result.failed + result.errors > 0 ? 1 : 0);
  } catch (error) {
    console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
    process.exit(1);
  }
});
program.command("list").description("List all eval cases").option("-c, --config <path>", "Path to config file").option("--category <categories...>", "Filter by category").option("--tag <tags...>", "Filter by tag").option("--json", "Output as JSON").action(async (options) => {
  try {
    const config3 = await loadConfig(options.config);
    const { loadEvalCases: loadEvalCases2 } = await Promise.resolve().then(() => (init_eval_loader(), eval_loader_exports));
    const evalCases = await loadEvalCases2({
      testDir: config3.testDir,
      testMatch: config3.testMatch,
      categories: options.category,
      tags: options.tag,
      enabledOnly: true
    });
    if (options.json) {
      console.log(JSON.stringify(evalCases, null, 2));
    } else {
      console.log(chalk.blue(`Found ${evalCases.length} eval cases:
`));
      for (const evalCase of evalCases) {
        const tags = evalCase.tags?.length ? chalk.gray(`[${evalCase.tags.join(", ")}]`) : "";
        console.log(`  ${chalk.cyan(evalCase.id)} - ${evalCase.name} ${tags}`);
        console.log(`    Category: ${evalCase.category}`);
        if (evalCase.description) {
          console.log(`    ${chalk.gray(evalCase.description)}`);
        }
        console.log();
      }
    }
  } catch (error) {
    console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
    process.exit(1);
  }
});
program.command("init").description("Initialize vibe-check in current project").option("--typescript", "Create TypeScript config (default)").action(async () => {
  const fs15 = await import('fs/promises');
  const path16 = await import('path');
  const configContent = `import { defineConfig } from '@pooflabs/vibe-check';

// TODO: Import your AI agent SDK
// import { query } from '@anthropic-ai/claude-agent-sdk';

export default defineConfig({
  testDir: './__evals__',

  // Implement your agent function
  agent: async (prompt, context) => {
    // TODO: Replace with your agent implementation
    // For Claude Agent SDK:
    // for await (const msg of query({ prompt, options: { cwd: context.workingDirectory } })) {
    //   if (msg.type === 'result') {
    //     return { output: msg.result || '', success: msg.subtype === 'success' };
    //   }
    // }

    throw new Error('Agent not implemented - update vibe-check.config.ts');
  },
});
`;
  const evalExampleContent = `{
  "id": "example-eval",
  "name": "Example Evaluation",
  "description": "An example eval case",
  "category": "basic",
  "prompt": "Say hello world",
  "judges": []
}
`;
  try {
    const cwd = process.cwd();
    await fs15.writeFile(path16.join(cwd, "vibe-check.config.ts"), configContent);
    console.log(chalk.green("\u2713"), "Created vibe-check.config.ts");
    await fs15.mkdir(path16.join(cwd, "__evals__"), { recursive: true });
    await fs15.writeFile(path16.join(cwd, "__evals__", "example.eval.json"), evalExampleContent);
    console.log(chalk.green("\u2713"), "Created __evals__/example.eval.json");
    console.log();
    console.log(chalk.blue("Next steps:"));
    console.log("  1. Update vibe-check.config.ts with your agent function");
    console.log("  2. Create eval cases in __evals__/*.eval.json");
    console.log("  3. Run: bunx vibe-check run");
  } catch (error) {
    console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
    process.exit(1);
  }
});
var learn = program.command("learn").description("Learning loop commands");
learn.command("run").description("Run full learning iteration").option("--source <source>", "Data source to use (eval, jsonl, both)", "eval").option("--auto-approve", "Auto-approve high-confidence rules").option("--save-pending", "Save rules for later review").action(async (options) => {
  try {
    const { LearningRunner: LearningRunner2 } = await Promise.resolve().then(() => (init_learning_runner(), learning_runner_exports));
    const runner = new LearningRunner2();
    const sources = options.source === "both" ? ["eval", "jsonl"] : [options.source];
    await runner.runIteration({
      sources,
      autoApprove: options.autoApprove,
      savePending: options.savePending
    });
  } catch (error) {
    console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
    process.exit(1);
  }
});
learn.command("analyze").description("Analyze failures without generating rules").option("--source <source>", "Data source to use (eval, jsonl, both)", "eval").action(async (options) => {
  try {
    const { LearningRunner: LearningRunner2 } = await Promise.resolve().then(() => (init_learning_runner(), learning_runner_exports));
    const runner = new LearningRunner2();
    const sources = options.source === "both" ? ["eval", "jsonl"] : [options.source];
    await runner.analyze({ sources });
  } catch (error) {
    console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
    process.exit(1);
  }
});
learn.command("review").description("Review pending rules").action(async () => {
  try {
    const { LearningRunner: LearningRunner2 } = await Promise.resolve().then(() => (init_learning_runner(), learning_runner_exports));
    const runner = new LearningRunner2();
    await runner.reviewPending();
  } catch (error) {
    console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
    process.exit(1);
  }
});
learn.command("stats").description("Show learning system statistics").action(async () => {
  try {
    const { LearningRunner: LearningRunner2 } = await Promise.resolve().then(() => (init_learning_runner(), learning_runner_exports));
    const runner = new LearningRunner2();
    await runner.showStats();
  } catch (error) {
    console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
    process.exit(1);
  }
});
function printSummary(result) {
  const { total, passed, failed, errors, passRate, duration } = result;
  console.log(chalk.bold("Results:"));
  console.log(`  Total:  ${total}`);
  console.log(`  ${chalk.green("Passed:")} ${passed}`);
  if (failed > 0) {
    console.log(`  ${chalk.red("Failed:")} ${failed}`);
  }
  if (errors > 0) {
    console.log(`  ${chalk.yellow("Errors:")} ${errors}`);
  }
  console.log();
  console.log(`  Pass rate: ${chalk.bold((passRate * 100).toFixed(1) + "%")}`);
  console.log(`  Duration:  ${(duration / 1e3).toFixed(2)}s`);
  if (result.results.length > 0 && (failed > 0 || errors > 0)) {
    console.log();
    console.log(chalk.bold("Failed cases:"));
    for (const r of result.results) {
      if (!r.success) {
        console.log(`  ${chalk.red("\u2717")} ${r.evalCase.name}`);
        if (r.error) {
          console.log(`    ${chalk.gray(r.error.message)}`);
        }
        for (const judge of r.judgeResults) {
          if (!judge.passed) {
            console.log(`    ${chalk.gray(`[${judge.judgeId}] ${judge.reasoning}`)}`);
          }
        }
      }
    }
  }
}
var shuttingDown = false;
var handleShutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`
${chalk.yellow(`Received ${signal}, shutting down gracefully...`)}`);
  process.exit(1);
};
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));
program.parse();
//# sourceMappingURL=cli.js.map
//# sourceMappingURL=cli.js.map