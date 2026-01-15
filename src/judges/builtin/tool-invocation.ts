import { BaseJudge } from '../judge-interface.js';
import type { JudgeContext, JudgeResult, JudgeType } from '../judge-interface.js';
import { isToolEval } from '../../config/schemas.js';
import type { ExpectedToolCall } from '../../config/schemas.js';

interface ToolCallStats {
  toolName: string;
  expected: ExpectedToolCall;
  actualCount: number;
  passed: boolean;
  reason: string;
}

export class ToolInvocationJudge extends BaseJudge {
  id = 'tool-invocation';
  name = 'Tool Invocation Judge';
  type: JudgeType = 'code';

  async evaluate(context: JudgeContext): Promise<JudgeResult> {
    const { executionResult, evalCase } = context;

    if (!isToolEval(evalCase)) {
      return this.notApplicable('Only applicable for tool evals');
    }

    const expectedCalls = evalCase.expectedToolCalls || [];
    if (expectedCalls.length === 0) {
      return this.notApplicable('No expected tool calls specified');
    }

    const actualCalls = executionResult.toolCalls || [];
    const toolCallCounts = new Map<string, number>();

    for (const call of actualCalls) {
      const count = toolCallCounts.get(call.toolName) || 0;
      toolCallCounts.set(call.toolName, count + 1);
    }

    const stats: ToolCallStats[] = [];

    for (const expected of expectedCalls) {
      const actualCount = toolCallCounts.get(expected.toolName) || 0;
      const minCalls = expected.minCalls ?? 1;
      const maxCalls = expected.maxCalls ?? Infinity;

      let passed = true;
      let reason = '';

      if (actualCount < minCalls) {
        passed = false;
        reason = `Expected at least ${minCalls} call(s), got ${actualCount}`;
      } else if (actualCount > maxCalls) {
        passed = false;
        reason = `Expected at most ${maxCalls} call(s), got ${actualCount}`;
      } else {
        reason = `Called ${actualCount} time(s)`;
      }

      stats.push({
        toolName: expected.toolName,
        expected,
        actualCount,
        passed,
        reason,
      });
    }

    const passedCount = stats.filter((s) => s.passed).length;
    const score = (passedCount / stats.length) * 100;
    const passed = passedCount === stats.length;

    const failedTools = stats.filter((s) => !s.passed);
    const reasoning =
      failedTools.length > 0
        ? `${passedCount}/${stats.length} expected tool invocations satisfied. Failed: ${failedTools.map((s) => `${s.toolName} (${s.reason})`).join(', ')}`
        : `All ${stats.length} expected tool invocations satisfied`;

    return this.createResult({
      passed,
      score,
      reasoning,
      details: {
        stats,
        actualToolCalls: actualCalls.map((c) => c.toolName),
        toolCallCounts: Object.fromEntries(toolCallCounts),
      },
    });
  }
}
