import type { EvalSuiteResult } from '../runner/eval-runner.js';

export interface AggregatedResult {
  evalId: string;
  evalName: string;
  runs: number;
  passes: number;
  failures: number;
  errors: number;
  passRate: number;
  avgDuration: number;
  flaky: boolean;
  flakinessScore: number;
}

export interface AggregatedSummary {
  totalRuns: number;
  totalEvals: number;
  overallPassRate: number;
  avgPassRate: number;
  flakyEvals: number;
  results: AggregatedResult[];
}

export function aggregateResults(suiteResults: EvalSuiteResult[]): AggregatedSummary {
  const evalMap = new Map<
    string,
    {
      evalId: string;
      evalName: string;
      results: { success: boolean; duration: number; hasError: boolean }[];
    }
  >();

  for (const suite of suiteResults) {
    for (const result of suite.results) {
      const id = result.evalCase.id;
      if (!evalMap.has(id)) {
        evalMap.set(id, {
          evalId: id,
          evalName: result.evalCase.name,
          results: [],
        });
      }
      evalMap.get(id)!.results.push({
        success: result.success,
        duration: result.duration,
        hasError: !!result.error,
      });
    }
  }

  const aggregatedResults: AggregatedResult[] = Array.from(evalMap.values()).map((data) => {
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
      flakinessScore,
    };
  });

  const totalRuns = suiteResults.length;
  const totalEvals = aggregatedResults.length;
  const overallPassRate =
    totalEvals > 0 ? aggregatedResults.reduce((sum, r) => sum + r.passRate, 0) / totalEvals : 0;
  const avgPassRate =
    totalEvals > 0 ? aggregatedResults.reduce((sum, r) => sum + r.passRate, 0) / totalEvals : 0;
  const flakyEvals = aggregatedResults.filter((r) => r.flaky).length;

  return {
    totalRuns,
    totalEvals,
    overallPassRate,
    avgPassRate,
    flakyEvals,
    results: aggregatedResults,
  };
}

function calculateFlakinessScore(results: boolean[]): number {
  if (results.length < 2) return 0;

  let transitions = 0;
  for (let i = 1; i < results.length; i++) {
    if (results[i] !== results[i - 1]) {
      transitions++;
    }
  }

  return transitions / (results.length - 1);
}

export function detectRegressions(
  current: EvalSuiteResult,
  baseline: EvalSuiteResult
): { evalId: string; evalName: string; wasSuccess: boolean; isSuccess: boolean }[] {
  const regressions: {
    evalId: string;
    evalName: string;
    wasSuccess: boolean;
    isSuccess: boolean;
  }[] = [];

  const baselineMap = new Map<string, boolean>();
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
        isSuccess: false,
      });
    }
  }

  return regressions;
}

export function calculateNonDeterminismMetrics(suiteResults: EvalSuiteResult[]): {
  totalEvals: number;
  deterministicEvals: number;
  nonDeterministicEvals: number;
  avgConsistency: number;
} {
  const evalMap = new Map<string, boolean[]>();

  for (const suite of suiteResults) {
    for (const result of suite.results) {
      const id = result.evalCase.id;
      if (!evalMap.has(id)) {
        evalMap.set(id, []);
      }
      evalMap.get(id)!.push(result.success);
    }
  }

  let deterministicCount = 0;
  let totalConsistency = 0;

  for (const [_id, results] of evalMap) {
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
      const modeCount = Math.max(results.filter((r) => r).length, results.filter((r) => !r).length);
      totalConsistency += modeCount / results.length;
    }
  }

  const totalEvals = evalMap.size;

  return {
    totalEvals,
    deterministicEvals: deterministicCount,
    nonDeterministicEvals: totalEvals - deterministicCount,
    avgConsistency: totalEvals > 0 ? totalConsistency / totalEvals : 1,
  };
}
