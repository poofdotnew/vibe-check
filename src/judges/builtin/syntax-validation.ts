import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseJudge } from '../judge-interface.js';
import type { JudgeContext, JudgeResult, JudgeType } from '../judge-interface.js';
import { isCodeGenEval } from '../../config/schemas.js';

interface SyntaxCheckResult {
  file: string;
  valid: boolean;
  error?: string;
}

export class SyntaxValidationJudge extends BaseJudge {
  id = 'syntax-validation';
  name = 'Syntax Validation Judge';
  type: JudgeType = 'code';

  async evaluate(context: JudgeContext): Promise<JudgeResult> {
    const { executionResult, evalCase, workingDirectory } = context;

    if (!isCodeGenEval(evalCase)) {
      return this.notApplicable('Only applicable for code-gen evals');
    }

    if (!evalCase.syntaxValidation) {
      return this.notApplicable('Syntax validation disabled for this eval');
    }

    const targetFiles = evalCase.targetFiles || [];
    const codeFiles = targetFiles.filter(
      (f) => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')
    );

    if (codeFiles.length === 0) {
      return this.notApplicable('No code files to validate');
    }

    const results: SyntaxCheckResult[] = [];

    for (const file of codeFiles) {
      const fullPath = path.join(workingDirectory || executionResult.workingDirectory || '', file);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const isValid = await this.validateSyntax(content, file);
        results.push({ file, valid: isValid.valid, error: isValid.error });
      } catch (error) {
        results.push({
          file,
          valid: false,
          error: error instanceof Error ? error.message : 'File not found',
        });
      }
    }

    const validCount = results.filter((r) => r.valid).length;
    const score = (validCount / codeFiles.length) * 100;
    const passed = score >= 90;

    const invalidFiles = results.filter((r) => !r.valid);

    return this.createResult({
      passed,
      score,
      reasoning:
        invalidFiles.length > 0
          ? `${validCount}/${codeFiles.length} files have valid syntax. Invalid: ${invalidFiles.map((f) => `${f.file} (${f.error})`).join(', ')}`
          : `All ${codeFiles.length} files have valid syntax`,
      details: { results },
    });
  }

  private async validateSyntax(
    content: string,
    filename: string
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const { parse } = await import('@babel/parser');

      const isTypeScript = filename.endsWith('.ts') || filename.endsWith('.tsx');
      const isJSX = filename.endsWith('.tsx') || filename.endsWith('.jsx');

      const plugins: string[] = [];
      if (isTypeScript) plugins.push('typescript');
      if (isJSX) plugins.push('jsx');

      parse(content, {
        sourceType: 'module',
        plugins: plugins as any[],
      });

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Parse error',
      };
    }
  }
}
