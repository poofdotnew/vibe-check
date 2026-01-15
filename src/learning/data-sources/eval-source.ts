/**
 * Data source for extracting failures from eval results.
 * Reads from __evals__/results/ directory.
 */

import fs from 'fs/promises';
import path from 'path';
import type { DataSource, FailureInput, CollectOptions, ToolCall } from './types.js';
import type { EvalSuiteResult, EvalCaseResult } from '../../runner/eval-runner.js';
import type { EvalCase } from '../../config/schemas.js';
import { getLearningConfig } from '../config.js';

/**
 * Extracts the prompt from an eval case based on its category
 */
function getPromptFromEvalCase(evalCase: EvalCase): string {
  if ('prompt' in evalCase) {
    return evalCase.prompt;
  }
  if ('turns' in evalCase && evalCase.turns.length > 0) {
    return evalCase.turns.map((t) => t.prompt).join('\n---\n');
  }
  return '';
}

/**
 * Extracts expected behavior from an eval case
 */
function getExpectedBehavior(evalCase: EvalCase): string | undefined {
  if ('expectedBehavior' in evalCase) {
    return evalCase.expectedBehavior;
  }
  if ('expectedToolCalls' in evalCase) {
    return `Expected tool calls: ${evalCase.expectedToolCalls.map((t) => t.toolName).join(', ')}`;
  }
  if ('expectedAgent' in evalCase) {
    return `Expected to route to: ${evalCase.expectedAgent}`;
  }
  if ('targetFiles' in evalCase) {
    return `Expected to create/modify files: ${evalCase.targetFiles.join(', ')}`;
  }
  return undefined;
}

/**
 * Converts an EvalCaseResult to a FailureInput
 */
function evalResultToFailureInput(result: EvalCaseResult): FailureInput {
  const toolCalls: ToolCall[] =
    result.toolCalls?.map((tc) => ({
      name: tc.toolName,
      input: tc.input as Record<string, unknown>,
      output: typeof tc.output === 'string' ? tc.output : JSON.stringify(tc.output),
    })) ?? [];

  return {
    id: result.evalCase.id,
    source: 'eval',
    sourceId: result.evalCase.id,
    prompt: getPromptFromEvalCase(result.evalCase),
    expectedBehavior: getExpectedBehavior(result.evalCase),
    category: result.evalCase.category,
    output: result.output ?? '',
    toolCalls,
    error: result.error?.message,
    judgeResults: result.judgeResults,
    timestamp: new Date().toISOString(),
    metadata: {
      evalName: result.evalCase.name,
      evalDescription: result.evalCase.description,
      evalTags: result.evalCase.tags,
      duration: result.duration,
      retryCount: result.retryCount,
    },
  };
}

export class EvalDataSource implements DataSource {
  name = 'eval';
  private resultsDir: string;

  constructor(resultsDir?: string) {
    const config = getLearningConfig();
    this.resultsDir = resultsDir ?? config.evalResultsDir;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await fs.access(this.resultsDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the path to the latest results file
   */
  private async getLatestResultsPath(): Promise<string | null> {
    try {
      // First check for latest.json symlink/file
      const latestPath = path.join(this.resultsDir, 'latest.json');
      try {
        await fs.access(latestPath);
        return latestPath;
      } catch {
        // No latest.json, look for most recent eval-results file
      }

      const files = await fs.readdir(this.resultsDir);
      const resultFiles = files
        .filter((f) => f.startsWith('eval-results-') && f.endsWith('.json'))
        .sort()
        .reverse();

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
  private async readResults(filePath: string): Promise<EvalSuiteResult | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as EvalSuiteResult;
    } catch {
      return null;
    }
  }

  /**
   * Collects failed evals from the results directory
   */
  async collect(options?: CollectOptions): Promise<FailureInput[]> {
    const resultsPath = await this.getLatestResultsPath();
    if (!resultsPath) {
      console.warn('No eval results found in', this.resultsDir);
      return [];
    }

    const suiteResult = await this.readResults(resultsPath);
    if (!suiteResult) {
      console.warn('Could not parse eval results from', resultsPath);
      return [];
    }

    // Filter to only failed results
    let failures = suiteResult.results.filter((r) => !r.success);

    // Apply category filter
    if (options?.categories && options.categories.length > 0) {
      failures = failures.filter((r) =>
        options.categories!.includes(r.evalCase.category)
      );
    }

    // Apply ID filter
    if (options?.ids && options.ids.length > 0) {
      failures = failures.filter((r) => options.ids!.includes(r.evalCase.id));
    }

    // Apply limit
    if (options?.limit && options.limit > 0) {
      failures = failures.slice(0, options.limit);
    }

    // Convert to FailureInput format
    return failures.map(evalResultToFailureInput);
  }

  /**
   * Gets summary statistics about available results
   */
  async getStats(): Promise<{
    totalRuns: number;
    latestRun: EvalSuiteResult | null;
    failuresInLatest: number;
  }> {
    const files = await fs.readdir(this.resultsDir).catch(() => []);
    const resultFiles = files.filter(
      (f) => f.startsWith('eval-results-') && f.endsWith('.json')
    );

    const latestPath = await this.getLatestResultsPath();
    const latestRun = latestPath ? await this.readResults(latestPath) : null;
    const failuresInLatest = latestRun
      ? latestRun.results.filter((r) => !r.success).length
      : 0;

    return {
      totalRuns: resultFiles.length,
      latestRun,
      failuresInLatest,
    };
  }
}

export default EvalDataSource;
