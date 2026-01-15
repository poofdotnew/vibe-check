import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { EvalCase, parseEvalCase, EvalCategory } from '../config/schemas.js';

export interface LoadOptions {
  testDir: string;
  testMatch: string[];
  categories?: EvalCategory[];
  tags?: string[];
  ids?: string[];
  enabledOnly?: boolean;
}

export async function loadEvalCases(options: LoadOptions): Promise<EvalCase[]> {
  const { testDir, testMatch } = options;

  const patterns = testMatch.map(pattern => path.join(testDir, pattern));
  const files = await glob(patterns, { absolute: true });

  const evalCases: EvalCase[] = [];

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const data = JSON.parse(content);
      const evalCase = parseEvalCase(data);
      evalCases.push(evalCase);
    } catch (error) {
      console.warn(`Failed to load eval case from ${file}:`, error);
    }
  }

  return filterEvalCases(evalCases, options);
}

export async function loadEvalCase(id: string, options: LoadOptions): Promise<EvalCase | null> {
  const cases = await loadEvalCases({ ...options, ids: [id] });
  return cases[0] || null;
}

function filterEvalCases(cases: EvalCase[], options: LoadOptions): EvalCase[] {
  let filtered = cases;

  if (options.enabledOnly !== false) {
    filtered = filtered.filter((c) => c.enabled !== false);
  }

  if (options.categories && options.categories.length > 0) {
    filtered = filtered.filter((c) => options.categories!.includes(c.category));
  }

  if (options.tags && options.tags.length > 0) {
    filtered = filtered.filter((c) => c.tags?.some((t) => options.tags!.includes(t)));
  }

  if (options.ids && options.ids.length > 0) {
    filtered = filtered.filter((c) => options.ids!.includes(c.id));
  }

  return filtered;
}

export function groupByCategory(cases: EvalCase[]): Record<EvalCategory, EvalCase[]> {
  const grouped: Record<EvalCategory, EvalCase[]> = {
    tool: [],
    'code-gen': [],
    'multi-turn': [],
    routing: [],
    basic: [],
  };

  for (const evalCase of cases) {
    grouped[evalCase.category].push(evalCase);
  }

  return grouped;
}
