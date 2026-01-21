import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseJudge } from '../judge-interface.js';
import type { JudgeContext, JudgeResult, JudgeType } from '../judge-interface.js';
import { isToolEval } from '../../config/schemas.js';

interface SkillCheckResult {
  skillName: string;
  found: boolean;
  callCount: number;
  meetsMin: boolean;
}

export class SkillInvocationJudge extends BaseJudge {
  id = 'skill-invocation';
  name = 'Skill Invocation Judge';
  type: JudgeType = 'code';

  async evaluate(context: JudgeContext): Promise<JudgeResult> {
    const { evalCase, executionResult, workingDirectory } = context;

    if (!isToolEval(evalCase)) {
      return this.notApplicable('Only applicable for tool evals');
    }

    const expectedSkills = evalCase.expectedSkills || [];
    if (expectedSkills.length === 0) {
      return this.notApplicable('No expected skills specified');
    }

    const jsonlSkillCalls = await this.extractSkillCallsFromJsonl(workingDirectory);
    const mainAgentSkillCalls = this.extractSkillCallsFromToolCalls(executionResult.toolCalls || []);
    const skillCalls = [...jsonlSkillCalls, ...mainAgentSkillCalls];

    const results: SkillCheckResult[] = [];

    for (const expected of expectedSkills) {
      const matchCount = skillCalls.filter(
        (call) => call.skillName === expected.skillName
      ).length;

      const meetsMin = matchCount >= (expected.minCalls ?? 1);

      results.push({
        skillName: expected.skillName,
        found: matchCount > 0,
        callCount: matchCount,
        meetsMin,
      });
    }

    const passedCount = results.filter((r) => r.found && r.meetsMin).length;
    const score = (passedCount / expectedSkills.length) * 100;
    const passed = score >= 80;

    const failedChecks = results.filter((r) => !r.found || !r.meetsMin);
    const allSkillNames = Array.from(new Set(skillCalls.map((c) => c.skillName)));

    return this.createResult({
      passed,
      score,
      reasoning:
        failedChecks.length > 0
          ? `${passedCount}/${expectedSkills.length} expected skills invoked. Failed: ${failedChecks.map((f) => `${f.skillName} (found ${f.callCount}x)`).join(', ')}`
          : `All ${expectedSkills.length} expected skills were invoked`,
      details: {
        results,
        actualSkillNames: allSkillNames,
        totalSkillCalls: skillCalls.length,
      },
    });
  }

  private extractSkillCallsFromToolCalls(toolCalls: Array<{ toolName: string; input: unknown }>): Array<{ skillName: string; input: unknown }> {
    const skillCalls: Array<{ skillName: string; input: unknown }> = [];

    for (const call of toolCalls) {
      if (call.toolName === 'Skill') {
        const input = call.input as Record<string, unknown> | undefined;
        const skillName = input?.skill as string || input?.command as string;
        if (skillName) {
          skillCalls.push({
            skillName: skillName.replace(/^\//, ''),
            input: input || {},
          });
        }
      }
    }

    return skillCalls;
  }

  private async extractSkillCallsFromJsonl(workspacePath: string): Promise<Array<{ skillName: string; input: unknown }>> {
    const skillCalls: Array<{ skillName: string; input: unknown }> = [];

    try {
      const claudeDir = path.join(workspacePath, '.claude', 'projects');

      try {
        await fs.access(claudeDir);
      } catch {
        return skillCalls;
      }

      const projectDirs = await fs.readdir(claudeDir);

      for (const projectDir of projectDirs) {
        const projectPath = path.join(claudeDir, projectDir);
        const stat = await fs.stat(projectPath);

        if (!stat.isDirectory()) continue;

        const files = await fs.readdir(projectPath);
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

        for (const jsonlFile of jsonlFiles) {
          const filePath = path.join(projectPath, jsonlFile);
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              const message = entry.message;

              if (!message?.content || !Array.isArray(message.content)) continue;

              for (const block of message.content) {
                if (block.type === 'tool_use' && block.name === 'Skill') {
                  const input = block.input as Record<string, unknown> | undefined;
                  const skillName = input?.skill as string || input?.command as string;
                  if (skillName) {
                    skillCalls.push({
                      skillName: skillName.replace(/^\//, ''),
                      input: input || {},
                    });
                  }
                }
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } catch {
      // Ignore errors
    }

    return skillCalls;
  }
}
