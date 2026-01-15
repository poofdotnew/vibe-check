import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseJudge } from '../judge-interface.js';
import type { JudgeContext, JudgeResult, JudgeType } from '../judge-interface.js';
import { isCodeGenEval } from '../../config/schemas.js';

interface FileCheckResult {
  file: string;
  exists: boolean;
}

export class FileExistenceJudge extends BaseJudge {
  id = 'file-existence';
  name = 'File Existence Judge';
  type: JudgeType = 'code';

  async evaluate(context: JudgeContext): Promise<JudgeResult> {
    const { evalCase, workingDirectory } = context;

    if (!isCodeGenEval(evalCase)) {
      return this.notApplicable('Only applicable for code-gen evals');
    }

    const targetFiles = evalCase.targetFiles || [];
    if (targetFiles.length === 0) {
      return this.notApplicable('No target files specified');
    }

    const baseDir = workingDirectory || process.cwd();
    const results: FileCheckResult[] = [];

    for (const file of targetFiles) {
      const fullPath = path.join(baseDir, file);
      try {
        await fs.access(fullPath);
        results.push({ file, exists: true });
      } catch {
        results.push({ file, exists: false });
      }
    }

    const existingCount = results.filter((r) => r.exists).length;
    const score = (existingCount / targetFiles.length) * 100;
    const passed = score >= 80;

    const missingFiles = results.filter((r) => !r.exists).map((r) => r.file);

    return this.createResult({
      passed,
      score,
      reasoning:
        missingFiles.length > 0
          ? `${existingCount}/${targetFiles.length} expected files exist. Missing: ${missingFiles.join(', ')}`
          : `All ${targetFiles.length} expected files exist`,
      details: { results, missingFiles },
    });
  }
}
