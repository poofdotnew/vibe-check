import * as path from 'path';
import * as fs from 'fs/promises';
import { pathToFileURL } from 'url';
import type { VibeCheckConfig, ResolvedConfig } from './types.js';
import { defaultConfig } from './types.js';

const CONFIG_FILE_NAMES = [
  'vibe-check.config.ts',
  'vibe-check.config.js',
  'vibe-check.config.mjs',
];

export async function loadConfig(configPath?: string): Promise<ResolvedConfig> {
  const cwd = process.cwd();

  let configFile: string | undefined;

  if (configPath) {
    configFile = path.isAbsolute(configPath) ? configPath : path.join(cwd, configPath);
  } else {
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = path.join(cwd, name);
      try {
        await fs.access(candidate);
        configFile = candidate;
        break;
      } catch {
        // Continue to next candidate
      }
    }
  }

  if (!configFile) {
    throw new Error(
      `No config file found. Create one of: ${CONFIG_FILE_NAMES.join(', ')}`
    );
  }

  const userConfig = await importConfig(configFile);

  if (!userConfig.agent) {
    throw new Error('Config must specify an "agent" function');
  }

  return resolveConfig(userConfig);
}

async function importConfig(configPath: string): Promise<VibeCheckConfig> {
  const fileUrl = pathToFileURL(configPath).href;

  try {
    const module = await import(fileUrl);
    return module.default || module;
  } catch (error) {
    if (configPath.endsWith('.ts')) {
      throw new Error(
        `Failed to import TypeScript config. Run with tsx: npx vibe-check\n${error}`
      );
    }
    throw error;
  }
}

function resolveConfig(userConfig: VibeCheckConfig): ResolvedConfig {
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
      autoApproveThreshold: userConfig.learning?.autoApproveThreshold ?? defaultConfig.learning.autoApproveThreshold,
    },
    setup: userConfig.setup,
    teardown: userConfig.teardown,
    beforeEach: userConfig.beforeEach,
    afterEach: userConfig.afterEach,
  };
}
