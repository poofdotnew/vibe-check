import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseJudge } from '../judge-interface.js';
import type { JudgeContext, JudgeResult, JudgeType } from '../judge-interface.js';
import { isCodeGenEval } from '../../config/schemas.js';

interface PatternCheckResult {
  file: string;
  patterns: Array<{
    pattern: string;
    found: boolean;
  }>;
  allFound: boolean;
}

export class PatternMatchJudge extends BaseJudge {
  id = 'pattern-match';
  name = 'Pattern Match Judge';
  type: JudgeType = 'code';

  async evaluate(context: JudgeContext): Promise<JudgeResult> {
    const { evalCase, workingDirectory } = context;

    if (!isCodeGenEval(evalCase)) {
      return this.notApplicable('Only applicable for code-gen evals');
    }

    const expectedPatterns = evalCase.expectedPatterns || [];
    if (expectedPatterns.length === 0) {
      return this.notApplicable('No expected patterns specified');
    }

    const baseDir = workingDirectory || process.cwd();
    const results: PatternCheckResult[] = [];

    for (const { file, patterns } of expectedPatterns) {
      const fullPath = path.join(baseDir, file);
      let content = '';

      try {
        content = await fs.readFile(fullPath, 'utf-8');
      } catch {
        results.push({
          file,
          patterns: patterns.map((p) => ({ pattern: p, found: false })),
          allFound: false,
        });
        continue;
      }

      const patternResults = patterns.map((pattern) => {
        const regex = new RegExp(pattern, 'gm');
        return {
          pattern,
          found: regex.test(content),
        };
      });

      results.push({
        file,
        patterns: patternResults,
        allFound: patternResults.every((p) => p.found),
      });
    }

    const totalPatterns = results.reduce((sum, r) => sum + r.patterns.length, 0);
    const foundPatterns = results.reduce(
      (sum, r) => sum + r.patterns.filter((p) => p.found).length,
      0
    );
    const score = totalPatterns > 0 ? (foundPatterns / totalPatterns) * 100 : 100;
    const passed = score >= 80;

    const failedFiles = results.filter((r) => !r.allFound);
    const reasoning =
      failedFiles.length > 0
        ? `${foundPatterns}/${totalPatterns} patterns found. Missing patterns in: ${failedFiles.map((r) => r.file).join(', ')}`
        : `All ${totalPatterns} expected patterns found`;

    return this.createResult({
      passed,
      score,
      reasoning,
      details: { results },
    });
  }
}
