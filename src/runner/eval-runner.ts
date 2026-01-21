import type {
  EvalCase,
  EvalCaseResult,
  EvalCategory,
  JudgeResult,
  ErrorType,
} from '../config/schemas.js';
import type { ResolvedConfig } from '../config/types.js';
import { isMultiTurnEval } from '../config/schemas.js';
import { TestHarness } from '../harness/test-harness.js';
import { getJudgeRegistry } from '../judges/judge-registry.js';
import type { JudgeContext, ExecutionResult } from '../judges/judge-interface.js';
import { loadEvalCases } from '../utils/eval-loader.js';

export interface EvalRunnerOptions {
  categories?: EvalCategory[];
  tags?: string[];
  ids?: string[];
}

/** @deprecated Use EvalRunnerOptions instead */
export type RunnerOptions = EvalRunnerOptions;

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

    // Register custom judges from config with the global registry
    if (config.judges && config.judges.length > 0) {
      const registry = getJudgeRegistry();
      for (const judge of config.judges) {
        registry.register(judge);
      }
    }
  }

  private verbose(message: string): void {
    if (this.config.verbose) {
      console.log(message);
    }
  }

  async run(options: EvalRunnerOptions = {}): Promise<EvalSuiteResult> {
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
      enabledOnly: true,
    });

    const mode = this.config.parallel
      ? `parallel (${this.config.maxConcurrency} concurrent)`
      : 'sequential';
    console.log(`Running ${evalCases.length} evals (${mode})...`);
    console.log();

    const results: EvalCaseResult[] = [];

    if (this.config.parallel && evalCases.length > 1) {
      results.push(...(await this.runParallel(evalCases)));
    } else {
      results.push(...(await this.runSequential(evalCases)));
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
    console.log(
      `Completed: ${passed}/${results.length} passed (${Math.round((passed / results.length) * 100)}%) in ${(duration / 1000).toFixed(1)}s`
    );

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
      timestamp: new Date().toISOString(),
    };
  }

  private async runParallel(evalCases: EvalCase[]): Promise<EvalCaseResult[]> {
    const results: EvalCaseResult[] = new Array(evalCases.length);
    const { maxConcurrency } = this.config;
    let nextIndex = 0;

    return new Promise((resolve) => {
      const runNext = async (): Promise<void> => {
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
              output: '',
              duration: 0,
              judgeResults: [],
              error: error instanceof Error ? error : new Error(errorMessage),
              errorType: this.classifyError(error),
            };
          }
        }
      };

      // Start maxConcurrency workers
      const workers = Array(Math.min(maxConcurrency, evalCases.length))
        .fill(null)
        .map(() => runNext());

      Promise.all(workers).then(() => resolve(results));
    });
  }

  private async runSequential(evalCases: EvalCase[]): Promise<EvalCaseResult[]> {
    const results: EvalCaseResult[] = [];

    for (let i = 0; i < evalCases.length; i++) {
      const evalCase = evalCases[i];
      console.log(`[${evalCase.id}] Starting (${i + 1}/${evalCases.length})`);
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
      const trialConfig = evalCase.trials || {
        count: this.config.trials,
        passThreshold: this.config.trialPassThreshold,
      };
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
        output: '',
        duration: Date.now() - startTime,
        judgeResults: [],
        error: error instanceof Error ? error : new Error(String(error)),
        errorType: this.classifyError(error),
      };
    }

    if (this.config.afterEach) {
      await this.config.afterEach(result);
    }

    const status = result.success ? '✓' : '✗';
    const trialInfo = result.trialResults
      ? ` [${result.trialResults.filter((t) => t).length}/${result.trialResults.length} trials]`
      : '';
    const retryInfo = result.retryCount ? ` (${result.retryCount} retries)` : '';
    console.log(
      `[${evalCase.id}] ${status} ${(result.duration / 1000).toFixed(1)}s${trialInfo}${retryInfo}`
    );

    return result;
  }

  private async runWithTrials(
    evalCase: EvalCase,
    trialCount: number,
    passThreshold: number
  ): Promise<EvalCaseResult> {
    const trialResults: boolean[] = [];
    let lastResult: EvalCaseResult | undefined;
    let totalDuration = 0;

    for (let trial = 0; trial < trialCount; trial++) {
      this.verbose(`[${evalCase.id}] Trial ${trial + 1}/${trialCount}...`);

      try {
        const result = await this.runWithRetries(evalCase);
        trialResults.push(result.success);
        totalDuration += result.duration;
        lastResult = result;

        this.verbose(`[${evalCase.id}] Trial ${trial + 1} ${result.success ? 'passed' : 'failed'}`);
      } catch (error) {
        trialResults.push(false);
        lastResult = {
          evalCase,
          success: false,
          output: '',
          duration: 0,
          judgeResults: [],
          error: error instanceof Error ? error : new Error(String(error)),
          errorType: this.classifyError(error),
        };
        this.verbose(`[${evalCase.id}] Trial ${trial + 1} errored: ${(error as Error).message}`);
      }
    }

    const passCount = trialResults.filter((t) => t).length;
    const passRate = passCount / trialCount;
    const overallSuccess = passRate >= passThreshold;

    this.verbose(
      `[${evalCase.id}] Trials complete: ${passCount}/${trialCount} passed (${(passRate * 100).toFixed(0)}%)`
    );

    return {
      ...lastResult!,
      success: overallSuccess,
      trialResults,
      duration: totalDuration,
    };
  }

  private async runWithRetries(evalCase: EvalCase): Promise<EvalCaseResult> {
    let lastError: Error | undefined;
    let lastErrorType: ErrorType | undefined;
    let retryCount = 0;
    const retryErrors: string[] = [];

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      const isRetry = attempt > 0;

      try {
        const result = await this.executeAndJudge(evalCase);

        if (result.success) {
          // Test passed - check if it was flaky (passed on retry)
          return {
            ...result,
            retryCount,
            flaky: isRetry,
            retryErrors: isRetry ? retryErrors : undefined,
          };
        }

        if (attempt === this.config.maxRetries) {
          return {
            ...result,
            retryCount,
            retryErrors: retryErrors.length > 0 ? retryErrors : undefined,
          };
        }

        // Record failure reason
        const failReason = result.errorType || 'judge failure';
        retryErrors.push(`Attempt ${attempt + 1}: ${failReason}`);

        retryCount++;
        const delay = this.getRetryDelay(attempt, result.errorType);
        this.verbose(
          `[${evalCase.id}] Attempt ${attempt + 1} failed (${failReason}), retrying in ${delay}ms... (${retryCount}/${this.config.maxRetries})`
        );
        await this.sleep(delay);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        lastErrorType = this.classifyError(error);

        // Record error reason
        retryErrors.push(
          `Attempt ${attempt + 1}: ${lastErrorType} - ${lastError.message.substring(0, 100)}`
        );
        retryCount++;

        if (attempt < this.config.maxRetries) {
          const delay = this.getRetryDelay(attempt, lastErrorType);
          this.verbose(
            `[${evalCase.id}] Attempt ${attempt + 1} errored (${lastErrorType}): ${lastError.message}, retrying in ${delay}ms...`
          );
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
      errorType: lastErrorType,
      retryCount,
      flaky: false,
      retryErrors: retryErrors.length > 0 ? retryErrors : undefined,
    };
  }

  private getRetryDelay(attempt: number, errorType?: ErrorType): number {
    const baseDelay = this.config.retryDelayMs;
    const multiplier = this.config.retryBackoffMultiplier;

    let delay = baseDelay * Math.pow(multiplier, attempt);

    // Use longer delays for API overload to allow recovery
    if (errorType === 'api') {
      delay *= 3;
    } else if (errorType === 'timeout') {
      delay *= 1.5;
    }

    return delay;
  }

  private classifyError(error: unknown, output?: string): ErrorType {
    if (!error) return 'unknown';

    const errorMessage =
      error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    // Check both error message and output for API errors
    const combinedText = output ? `${errorMessage} ${output.toLowerCase()}` : errorMessage;

    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return 'timeout';
    }

    // Check for API errors including Anthropic overload (529) and Cloudflare errors
    if (
      combinedText.includes('api') ||
      combinedText.includes('rate limit') ||
      combinedText.includes('429') ||
      combinedText.includes('529') ||
      combinedText.includes('500') ||
      combinedText.includes('502') ||
      combinedText.includes('503') ||
      combinedText.includes('overloaded') ||
      combinedText.includes('api error')
    ) {
      return 'api';
    }

    if (errorMessage.includes('judge')) {
      return 'judge';
    }

    return 'unknown';
  }

  private async executeAndJudge(evalCase: EvalCase): Promise<EvalCaseResult> {
    let executionResult: ExecutionResult;
    let turnResults: ExecutionResult[] | undefined;
    let judgeResults: JudgeResult[];

    if (isMultiTurnEval(evalCase)) {
      turnResults = await this.harness.executeMultiTurn(evalCase);
      executionResult = turnResults[turnResults.length - 1];
      // Use multi-turn judging which supports per-turn judges
      judgeResults = await this.runJudgesForMultiTurn(evalCase, turnResults);
    } else {
      executionResult = await this.harness.execute(evalCase);
      judgeResults = await this.runJudgesParallel(evalCase, executionResult);
    }

    const allPassed = judgeResults.every((r) => r.passed);

    if (this.config.verbose && judgeResults.length > 0) {
      for (const result of judgeResults) {
        const status = result.passed ? '✓' : '✗';
        this.verbose(
          `[${evalCase.id}] Judge ${result.judgeId}: ${status} (score: ${result.score})`
        );
        if (!result.passed && result.reasoning) {
          this.verbose(`[${evalCase.id}]   └─ ${result.reasoning}`);
        }
      }
    }

    // Cleanup workspace after judging completes
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
      errorType: executionResult.error
        ? this.classifyError(executionResult.error, executionResult.output)
        : undefined,
    };
  }

  private async runJudgesParallel(
    evalCase: EvalCase,
    executionResult: ExecutionResult,
    maxRetries: number = 2
  ): Promise<JudgeResult[]> {
    const judgeIds = this.getJudgeIds(evalCase);
    const registry = getJudgeRegistry();

    // Run all judges in parallel
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
          workingDirectory: executionResult.workingDirectory || '',
        },
        maxRetries,
        judgeId
      );
    });

    const results = await Promise.all(judgePromises);
    return results.filter((r): r is JudgeResult => r !== null);
  }

  private async runJudgesForMultiTurn(
    evalCase: EvalCase & { category: 'multi-turn' },
    turnResults: ExecutionResult[],
    maxRetries: number = 2
  ): Promise<JudgeResult[]> {
    const registry = getJudgeRegistry();
    const allJudgePromises: Promise<JudgeResult | null>[] = [];

    // Turn-level judges (all in parallel)
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
                workingDirectory: turnResult.workingDirectory || '',
                turnIndex,
              },
              maxRetries,
              `${judgeId}[turn-${turnIndex + 1}]`
            );
          })()
        );
      }
    }

    // Global judges (all in parallel)
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
              workingDirectory: lastResult.workingDirectory || '',
            },
            maxRetries,
            judgeId
          );
        })()
      );
    }

    const results = await Promise.all(allJudgePromises);
    return results.filter((r): r is JudgeResult => r !== null);
  }

  private async evaluateJudgeWithRetry(
    judge: { id: string; evaluate: (context: JudgeContext) => Promise<JudgeResult> },
    context: JudgeContext,
    maxRetries: number,
    judgeIdOverride?: string
  ): Promise<JudgeResult> {
    const judgeId = judgeIdOverride || judge.id;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await judge.evaluate(context);
        // Log success on retry
        if (attempt > 0) {
          this.verbose(
            `[${context.evalCase.id}] Judge ${judgeId} succeeded on attempt ${attempt + 1}`
          );
        }
        // Apply override judgeId if provided
        if (judgeIdOverride) {
          return { ...result, judgeId: judgeIdOverride };
        }
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) {
          const delay = 500 * (attempt + 1);
          this.verbose(
            `[${context.evalCase.id}] Judge ${judgeId} failed (attempt ${attempt + 1}), retrying in ${delay}ms...`
          );
          await this.sleep(delay);
        }
      }
    }

    return {
      judgeId,
      passed: false,
      score: 0,
      confidence: 1,
      reasoning: `Judge error after ${maxRetries + 1} attempts: ${lastError?.message || 'Unknown'}`,
    };
  }

  private getJudgeIds(evalCase: EvalCase): string[] {
    if ('judges' in evalCase && evalCase.judges) {
      return evalCase.judges;
    }
    return [];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
