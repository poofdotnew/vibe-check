import fs from 'fs/promises';
import path from 'path';
import type { EvalSuiteResult } from '../runner/eval-runner.js';

export interface HistoryEntry {
  result: EvalSuiteResult;
  filename: string;
  timestamp: Date;
}

function getResultsDir(testDir: string): string {
  return path.join(testDir, 'results');
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export async function saveRunToHistory(result: EvalSuiteResult, testDir: string): Promise<string> {
  const resultsDir = getResultsDir(testDir);
  await fs.mkdir(resultsDir, { recursive: true });

  const timestamp = formatTimestamp(new Date(result.timestamp));
  const filename = `run-${timestamp}.json`;
  const filepath = path.join(resultsDir, filename);

  await fs.writeFile(filepath, JSON.stringify(result, null, 2));
  return filepath;
}

export async function loadHistory(testDir: string): Promise<HistoryEntry[]> {
  const resultsDir = getResultsDir(testDir);

  try {
    const files = await fs.readdir(resultsDir);
    const runFiles = files
      .filter((f) => f.startsWith('run-') && f.endsWith('.json'))
      .sort()
      .reverse();

    const entries: HistoryEntry[] = [];
    for (const filename of runFiles) {
      try {
        const content = await fs.readFile(path.join(resultsDir, filename), 'utf-8');
        const result = JSON.parse(content) as EvalSuiteResult;
        entries.push({
          result,
          filename,
          timestamp: new Date(result.timestamp),
        });
      } catch {
        // Skip invalid files
      }
    }

    return entries;
  } catch {
    return [];
  }
}

export async function getLastRun(testDir: string): Promise<EvalSuiteResult | null> {
  const history = await loadHistory(testDir);
  return history.length > 0 ? history[0].result : null;
}

export interface RunComparison {
  passRateDelta: number;
  newlyPassing: string[];
  newlyFailing: string[];
  durationDelta: number;
}

export function compareRuns(current: EvalSuiteResult, previous: EvalSuiteResult): RunComparison {
  const currentPassingIds = new Set(
    current.results.filter((r) => r.success).map((r) => r.evalCase.id)
  );
  const previousPassingIds = new Set(
    previous.results.filter((r) => r.success).map((r) => r.evalCase.id)
  );

  const newlyPassing: string[] = [];
  const newlyFailing: string[] = [];

  for (const id of currentPassingIds) {
    if (!previousPassingIds.has(id)) {
      newlyPassing.push(id);
    }
  }

  for (const id of previousPassingIds) {
    if (!currentPassingIds.has(id)) {
      newlyFailing.push(id);
    }
  }

  return {
    passRateDelta: current.passRate - previous.passRate,
    newlyPassing,
    newlyFailing,
    durationDelta: current.duration - previous.duration,
  };
}
