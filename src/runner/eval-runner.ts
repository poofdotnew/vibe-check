import type { EvalCase, EvalCaseResult, EvalCategory, JudgeResult } from '../config/schemas.js';
import type { ResolvedConfig } from '../config/types.js';
import { isMultiTurnEval } from '../config/schemas.js';
import { TestHarness } from '../harness/test-harness.js';
import { getJudgeRegistry } from '../judges/judge-registry.js';
import type { JudgeContext, ExecutionResult } from '../judges/judge-interface.js';
import { loadEvalCases } from '../utils/eval-loader.js';

export interface RunnerOptions {
  categories?: EvalCategory[];
  tags?: string[];
  ids?: string[];
}

export interface EvalSuiteResult {
  runId: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
  passRate: number;
  results: EvalCaseResult[];
  duration: number;
  timestamp: string;
}

export class EvalRunner {
  private config: ResolvedConfig;
  private harness: TestHarness;

  constructor(config: ResolvedConfig) {
    this.config = config;
    this.harness = new TestHarness({ config });
  }

  async run(options: RunnerOptions = {}): Promise<EvalSuiteResult> {
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
      enabledOnly: true,
    });

    if (this.config.verbose) {
      console.log(`Found ${evalCases.length} eval cases to run`);
    }

    const results: EvalCaseResult[] = [];

    if (this.config.parallel && evalCases.length > 1) {
      results.push(...await this.runParallel(evalCases));
    } else {
      results.push(...await this.runSequential(evalCases));
    }

    if (this.config.teardown) {
      await this.config.teardown();
    }

    await this.harness.cleanup();

    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success && !r.error).length;
    const errors = results.filter(r => r.error).length;

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
      timestamp: new Date().toISOString(),
    };
  }

  private async runParallel(evalCases: EvalCase[]): Promise<EvalCaseResult[]> {
    const results: EvalCaseResult[] = [];
    const { maxConcurrency } = this.config;

    for (let i = 0; i < evalCases.length; i += maxConcurrency) {
      const batch = evalCases.slice(i, i + maxConcurrency);
      const batchResults = await Promise.all(
        batch.map(evalCase => this.runSingle(evalCase))
      );
      results.push(...batchResults);
    }

    return results;
  }

  private async runSequential(evalCases: EvalCase[]): Promise<EvalCaseResult[]> {
    const results: EvalCaseResult[] = [];

    for (const evalCase of evalCases) {
      const result = await this.runSingle(evalCase);
      results.push(result);
    }

    return results;
  }

  private async runSingle(evalCase: EvalCase): Promise<EvalCaseResult> {
    const startTime = Date.now();

    if (this.config.beforeEach) {
      await this.config.beforeEach(evalCase);
    }

    let result: EvalCaseResult;

    try {
      result = await this.runWithRetries(evalCase);
    } catch (error) {
      result = {
        evalCase,
        success: false,
        output: '',
        duration: Date.now() - startTime,
        judgeResults: [],
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }

    if (this.config.afterEach) {
      await this.config.afterEach(result);
    }

    if (this.config.verbose) {
      const status = result.success ? '✓' : '✗';
      console.log(`${status} ${evalCase.name} (${result.duration}ms)`);
    }

    return result;
  }

  private async runWithRetries(evalCase: EvalCase): Promise<EvalCaseResult> {
    let lastError: Error | undefined;
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
      output: '',
      duration: 0,
      judgeResults: [],
      error: lastError,
      retryCount,
    };
  }

  private async executeAndJudge(evalCase: EvalCase): Promise<EvalCaseResult> {
    let executionResult: ExecutionResult;
    let turnResults: ExecutionResult[] | undefined;

    if (isMultiTurnEval(evalCase)) {
      turnResults = await this.harness.executeMultiTurn(evalCase);
      executionResult = turnResults[turnResults.length - 1];
    } else {
      executionResult = await this.harness.execute(evalCase);
    }

    const judgeResults = await this.runJudges(evalCase, executionResult);
    const allPassed = judgeResults.every(r => r.passed);

    return {
      evalCase,
      success: executionResult.success && allPassed,
      output: executionResult.output,
      duration: executionResult.duration,
      judgeResults,
      toolCalls: executionResult.toolCalls,
      error: executionResult.error,
    };
  }

  private async runJudges(evalCase: EvalCase, executionResult: ExecutionResult): Promise<JudgeResult[]> {
    const judgeIds = this.getJudgeIds(evalCase);
    const registry = getJudgeRegistry();
    const results: JudgeResult[] = [];

    for (const judgeId of judgeIds) {
      const judge = registry.get(judgeId);

      if (!judge) {
        if (this.config.verbose) {
          console.warn(`Judge not found: ${judgeId}`);
        }
        continue;
      }

      const context: JudgeContext = {
        evalCase,
        executionResult,
        workingDirectory: executionResult.workingDirectory || '',
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
          reasoning: `Judge error: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    return results;
  }

  private getJudgeIds(evalCase: EvalCase): string[] {
    if ('judges' in evalCase && evalCase.judges) {
      return evalCase.judges;
    }
    return [];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
