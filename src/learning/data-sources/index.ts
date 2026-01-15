/**
 * Data source registry and factory for the learning system.
 */

import type { DataSource, DataSourceRegistry, CollectOptions, FailureInput } from './types.js';
import { EvalDataSource } from './eval-source.js';
import { JsonlDataSource } from './jsonl-source.js';

// Export types
export * from './types.js';

// Export data sources
export { EvalDataSource } from './eval-source.js';
export { JsonlDataSource } from './jsonl-source.js';

/**
 * Creates a data source by name
 */
export function createDataSource(
  name: string,
  options?: Record<string, unknown>
): DataSource | null {
  switch (name) {
    case 'eval':
      return new EvalDataSource(options?.resultsDir as string | undefined);

    case 'jsonl':
      return new JsonlDataSource(options?.promptRunsDir as string | undefined);

    default:
      console.warn(`Unknown data source: ${name}`);
      return null;
  }
}

/**
 * Registry of all available data sources
 */
export function getDataSourceRegistry(): DataSourceRegistry {
  return {
    eval: new EvalDataSource(),
    jsonl: new JsonlDataSource(),
  };
}

/**
 * Collects failures from multiple data sources
 */
export async function collectFromSources(
  sources: string[],
  options?: CollectOptions
): Promise<FailureInput[]> {
  const failures: FailureInput[] = [];

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

/**
 * Gets statistics about available data sources
 */
export async function getSourceStats(): Promise<
  Record<string, { available: boolean; failureCount?: number; details?: Record<string, number> }>
> {
  const registry = getDataSourceRegistry();
  const stats: Record<string, { available: boolean; failureCount?: number; details?: Record<string, number> }> = {};

  for (const [name, source] of Object.entries(registry)) {
    const available = (await source.isAvailable?.()) ?? true;
    let failureCount: number | undefined;
    let details: Record<string, number> | undefined;

    if (available && name === 'eval') {
      const evalSource = source as EvalDataSource;
      const evalStats = await evalSource.getStats();
      failureCount = evalStats.failuresInLatest;
    }

    if (available && name === 'jsonl') {
      const jsonlSource = source as JsonlDataSource;
      const jsonlStats = await jsonlSource.getStats();
      failureCount = jsonlStats.errorSessionCount;
      details = {
        projects: jsonlStats.projectCount,
        files: jsonlStats.jsonlFileCount,
        sessions: jsonlStats.sessionCount,
      };
    }

    stats[name] = { available, failureCount, details };
  }

  return stats;
}
