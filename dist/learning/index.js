import path from 'path';
import { fileURLToPath } from 'url';
import fs5 from 'fs/promises';
import { createReadStream } from 'fs';
import * as readline from 'readline';
import readline__default from 'readline';
import * as dotenv from 'dotenv';

// src/learning/config.ts
var __filename$1 = fileURLToPath(import.meta.url);
var __dirname$1 = path.dirname(__filename$1);
var LEARNING_DIR = path.join(__dirname$1);
var RULES_DIR = path.join(LEARNING_DIR, "rules");
var EVAL_RESULTS_DIR = path.join(__dirname$1, "..", "results");
var DEFAULT_LEARNING_CONFIG = {
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
  promptsDir: path.join(LEARNING_DIR, "prompts"),
  rulesDir: RULES_DIR,
  pendingDir: path.join(RULES_DIR, "pending"),
  approvedDir: path.join(RULES_DIR, "approved"),
  rejectedDir: path.join(RULES_DIR, "rejected"),
  learnedRulesPath: path.join(RULES_DIR, "learned-rules.json"),
  historyPath: path.join(RULES_DIR, "history.json"),
  evalResultsDir: EVAL_RESULTS_DIR
};
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
var EvalDataSource = class {
  name = "eval";
  resultsDir;
  constructor(resultsDir) {
    const config3 = getLearningConfig();
    this.resultsDir = resultsDir ?? config3.evalResultsDir;
  }
  async isAvailable() {
    try {
      await fs5.access(this.resultsDir);
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
      const latestPath = path.join(this.resultsDir, "latest.json");
      try {
        await fs5.access(latestPath);
        return latestPath;
      } catch {
      }
      const files = await fs5.readdir(this.resultsDir);
      const resultFiles = files.filter((f) => f.startsWith("eval-results-") && f.endsWith(".json")).sort().reverse();
      if (resultFiles.length === 0) {
        return null;
      }
      return path.join(this.resultsDir, resultFiles[0]);
    } catch {
      return null;
    }
  }
  /**
   * Reads eval results from a file
   */
  async readResults(filePath) {
    try {
      const content = await fs5.readFile(filePath, "utf-8");
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
    const files = await fs5.readdir(this.resultsDir).catch(() => []);
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
var __filename2 = fileURLToPath(import.meta.url);
var __dirname2 = path.dirname(__filename2);
var JsonlDataSource = class {
  name = "jsonl";
  promptRunsDir;
  constructor(promptRunsDir) {
    this.promptRunsDir = promptRunsDir || path.join(__dirname2, "..", "..", "..", "cdk", "dev-server-manager", "prompt-runs");
  }
  async isAvailable() {
    try {
      await fs5.access(this.promptRunsDir);
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
      const entries = await fs5.readdir(this.promptRunsDir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory() && e.name.startsWith("project-")).map((e) => path.join(this.promptRunsDir, e.name));
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
        const entries = await fs5.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
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
          const stats = await fs5.stat(filePath);
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
dotenv.config();
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
var ExplanationGenerator = class {
  anthropic = null;
  config;
  promptTemplate = null;
  constructor(config3) {
    this.config = getLearningConfig(config3);
  }
  async getAnthropicClient() {
    if (!this.anthropic) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      this.anthropic = new Anthropic();
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
    const promptPath = path.join(
      this.config.promptsDir,
      "failure-analysis.md"
    );
    try {
      this.promptTemplate = await fs5.readFile(promptPath, "utf-8");
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
var PatternDetector = class {
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
dotenv.config();
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
var CATEGORY_TO_SECTION = {
  "routing-error": "CHAT_PROMPT.delegationPrinciple",
  "delegation-error": "CHAT_PROMPT.delegationPrinciple",
  "missing-tool-call": "CHAT_PROMPT.troubleshooting",
  "incorrect-code-pattern": "CORE_INSTRUCTIONS",
  "validation-failure": "CORE_INSTRUCTIONS.coreSafetyRules",
  "context-missing": "CHAT_PROMPT.reasoningAndPlanning",
  other: "CORE_INSTRUCTIONS"
};
var RuleGenerator = class {
  anthropic = null;
  config;
  promptTemplate = null;
  currentInstructions = /* @__PURE__ */ new Map();
  constructor(config3) {
    this.config = getLearningConfig(config3);
  }
  async getAnthropicClient() {
    if (!this.anthropic) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      this.anthropic = new Anthropic();
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
    const promptPath = path.join(this.config.promptsDir, "rule-generation.md");
    try {
      this.promptTemplate = await fs5.readFile(promptPath, "utf-8");
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
    const templatePath = path.join(
      this.config.learningDir,
      "..",
      "..",
      "lib",
      "ai",
      "claude-code",
      "prompt-templates.ts"
    );
    try {
      const content = await fs5.readFile(templatePath, "utf-8");
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
var CLIReviewer = class {
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
var RuleWriter = class {
  config;
  constructor(config3) {
    this.config = getLearningConfig(config3);
  }
  /**
   * Ensures rules directories exist
   */
  async ensureDirectories() {
    await fs5.mkdir(this.config.rulesDir, { recursive: true });
    await fs5.mkdir(this.config.pendingDir, { recursive: true });
    await fs5.mkdir(this.config.approvedDir, { recursive: true });
    await fs5.mkdir(this.config.rejectedDir, { recursive: true });
  }
  /**
   * Reads the current learned rules file
   */
  async readLearnedRules() {
    try {
      const content = await fs5.readFile(this.config.learnedRulesPath, "utf-8");
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
    await fs5.writeFile(this.config.learnedRulesPath, content, "utf-8");
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
    const filepath = path.join(this.config.pendingDir, filename);
    await fs5.writeFile(filepath, JSON.stringify(rule, null, 2), "utf-8");
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
      const files = await fs5.readdir(this.config.pendingDir);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));
      const rules = [];
      for (const file of jsonFiles) {
        const filepath = path.join(this.config.pendingDir, file);
        const content = await fs5.readFile(filepath, "utf-8");
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
    const pendingPath = path.join(this.config.pendingDir, `${ruleId}.json`);
    const approvedPath = path.join(this.config.approvedDir, `${ruleId}.json`);
    try {
      const content = await fs5.readFile(pendingPath, "utf-8");
      const rule = JSON.parse(content);
      rule.status = "approved";
      await fs5.writeFile(approvedPath, JSON.stringify(rule, null, 2), "utf-8");
      await fs5.unlink(pendingPath);
      await this.addApprovedRules([rule], `manual-${Date.now()}`);
    } catch (error) {
      throw new Error(`Failed to approve rule ${ruleId}: ${error}`);
    }
  }
  /**
   * Moves a pending rule to rejected
   */
  async rejectPendingRule(ruleId, reason) {
    const pendingPath = path.join(this.config.pendingDir, `${ruleId}.json`);
    const rejectedPath = path.join(this.config.rejectedDir, `${ruleId}.json`);
    try {
      const content = await fs5.readFile(pendingPath, "utf-8");
      const rule = JSON.parse(content);
      rule.status = "rejected";
      rule.reviewNotes = reason;
      await fs5.writeFile(rejectedPath, JSON.stringify(rule, null, 2), "utf-8");
      await fs5.unlink(pendingPath);
    } catch (error) {
      throw new Error(`Failed to reject rule ${ruleId}: ${error}`);
    }
  }
  /**
   * Clears all pending rules
   */
  async clearPendingRules() {
    try {
      const files = await fs5.readdir(this.config.pendingDir);
      for (const file of files) {
        await fs5.unlink(path.join(this.config.pendingDir, file));
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
      const content = await fs5.readFile(this.config.historyPath, "utf-8");
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
    await fs5.writeFile(
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
      approvedCount = (await fs5.readdir(this.config.approvedDir)).length;
    } catch {
    }
    try {
      rejectedCount = (await fs5.readdir(this.config.rejectedDir)).length;
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

// src/learning/learning-runner.ts
var LearningRunner = class {
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

export { CLIReviewer, EvalDataSource, ExplanationGenerator, JsonlDataSource, LearningRunner, PatternDetector, RuleGenerator, RuleWriter, collectFromSources, createDataSource, getConfigFromEnv, getDataSourceRegistry, getLearningConfig, getSourceStats };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map