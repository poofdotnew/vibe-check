import type { EvalCaseResult, EvalCategory, ErrorType } from '../config/schemas.js';
import type { EvalSuiteResult } from '../runner/eval-runner.js';
import { compareRuns } from './history.js';

export interface EvalReportOptions {
  verbose?: boolean;
  showDetails?: boolean;
  format?: 'text' | 'json';
  previousRun?: EvalSuiteResult | null;
}

/** @deprecated Use EvalReportOptions instead */
export type ReportOptions = EvalReportOptions;

export interface CategorySummary {
  category: EvalCategory;
  total: number;
  passed: number;
  failed: number;
  errors: number;
  passRate: number;
}

export interface ErrorSummary {
  type: ErrorType;
  count: number;
  examples: string[];
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function formatPassRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function getStatusSymbol(success: boolean): string {
  return success ? '✓' : '✗';
}

export function summarizeByCategory(results: EvalCaseResult[]): CategorySummary[] {
  const categoryMap = new Map<EvalCategory, EvalCaseResult[]>();

  for (const result of results) {
    const category = result.evalCase.category;
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)!.push(result);
  }

  return Array.from(categoryMap.entries()).map(([category, categoryResults]) => ({
    category,
    total: categoryResults.length,
    passed: categoryResults.filter((r) => r.success).length,
    failed: categoryResults.filter((r) => !r.success && !r.error).length,
    errors: categoryResults.filter((r) => r.error).length,
    passRate: categoryResults.filter((r) => r.success).length / categoryResults.length,
  }));
}

export function summarizeErrors(results: EvalCaseResult[]): ErrorSummary[] {
  const errorMap = new Map<ErrorType, { count: number; examples: string[] }>();

  for (const result of results) {
    if (result.error && result.errorType) {
      if (!errorMap.has(result.errorType)) {
        errorMap.set(result.errorType, { count: 0, examples: [] });
      }
      const entry = errorMap.get(result.errorType)!;
      entry.count++;
      if (entry.examples.length < 3) {
        entry.examples.push(`${result.evalCase.name}: ${result.error.message.substring(0, 100)}`);
      }
    }
  }

  return Array.from(errorMap.entries()).map(([type, data]) => ({
    type,
    count: data.count,
    examples: data.examples,
  }));
}

function formatDelta(delta: number, suffix = ''): string {
  if (delta === 0) return '';
  const sign = delta > 0 ? '+' : '';
  return ` (${sign}${delta.toFixed(1)}${suffix})`;
}

function formatPassRateDelta(delta: number): string {
  if (delta === 0) return ' (no change)';
  const sign = delta > 0 ? '+' : '';
  const percent = (delta * 100).toFixed(1);
  const arrow = delta > 0 ? '↑' : '↓';
  return ` ${arrow} ${sign}${percent}% from last run`;
}

export function printSummary(suiteResult: EvalSuiteResult, options: EvalReportOptions = {}): void {
  const { verbose = false, previousRun } = options;

  const comparison = previousRun ? compareRuns(suiteResult, previousRun) : null;

  console.log('\n' + '='.repeat(60));
  console.log('EVAL RESULTS SUMMARY');
  console.log('='.repeat(60));

  console.log(`\nRun ID: ${suiteResult.runId}`);
  console.log(`Duration: ${formatDuration(suiteResult.duration)}`);
  console.log(`Timestamp: ${suiteResult.timestamp}`);

  console.log('\n--- Overall ---');
  console.log(`Total: ${suiteResult.total}`);
  const passRateDelta = comparison ? formatPassRateDelta(comparison.passRateDelta) : '';
  console.log(
    `Passed: ${suiteResult.passed} (${formatPassRate(suiteResult.passRate)})${passRateDelta}`
  );
  console.log(`Failed: ${suiteResult.failed}`);
  console.log(`Errors: ${suiteResult.errors}`);

  if (comparison) {
    console.log('\n--- vs Previous Run ---');
    if (
      comparison.newlyPassing.length === 0 &&
      comparison.newlyFailing.length === 0 &&
      comparison.passRateDelta === 0
    ) {
      console.log('No changes from previous run');
    } else {
      console.log(
        `Pass rate: ${formatPassRate(suiteResult.passRate)}${formatDelta(comparison.passRateDelta * 100, '%')}`
      );
      if (comparison.newlyPassing.length > 0) {
        console.log(`Newly passing: ${comparison.newlyPassing.join(', ')}`);
      }
      if (comparison.newlyFailing.length > 0) {
        console.log(`Newly failing: ${comparison.newlyFailing.join(', ')}`);
      }
    }
  }

  const categorySummaries = summarizeByCategory(suiteResult.results);
  if (categorySummaries.length > 1) {
    console.log('\n--- By Category ---');
    for (const summary of categorySummaries) {
      console.log(
        `  ${summary.category}: ${summary.passed}/${summary.total} (${formatPassRate(summary.passRate)})`
      );
    }
  }

  const errorSummaries = summarizeErrors(suiteResult.results);
  if (errorSummaries.length > 0) {
    console.log('\n--- Errors by Type ---');
    for (const summary of errorSummaries) {
      console.log(`  ${summary.type}: ${summary.count}`);
      for (const example of summary.examples) {
        console.log(`    - ${example}`);
      }
    }
  }

  console.log('\n--- Individual Results ---');
  for (const result of suiteResult.results) {
    const status = getStatusSymbol(result.success);
    const trialInfo = result.trialResults
      ? ` [${result.trialResults.filter((t) => t).length}/${result.trialResults.length}]`
      : '';
    console.log(
      `${status} ${result.evalCase.name}${trialInfo} (${formatDuration(result.duration)})`
    );

    if (verbose && result.judgeResults.length > 0) {
      for (const judge of result.judgeResults) {
        const judgeStatus = getStatusSymbol(judge.passed);
        console.log(
          `    ${judgeStatus} ${judge.judgeId}: ${judge.score}/100 - ${judge.reasoning.substring(0, 80)}`
        );
      }
    }

    if (result.error) {
      console.log(`    Error: ${result.error.message.substring(0, 100)}`);
    }
  }

  console.log('\n' + '='.repeat(60));
}

export function generateJsonReport(suiteResult: EvalSuiteResult): object {
  return {
    runId: suiteResult.runId,
    timestamp: suiteResult.timestamp,
    duration: suiteResult.duration,
    summary: {
      total: suiteResult.total,
      passed: suiteResult.passed,
      failed: suiteResult.failed,
      errors: suiteResult.errors,
      passRate: suiteResult.passRate,
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
        reasoning: j.reasoning,
      })),
    })),
  };
}
