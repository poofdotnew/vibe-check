import * as fs from 'fs/promises';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { BaseJudge } from '../judge-interface.js';
import type { JudgeContext, JudgeResult, JudgeType } from '../judge-interface.js';
import type { ReferenceSolution } from '../../config/schemas.js';

export interface Rubric {
  id: string;
  content: string;
}

export interface LLMJudgeOptions {
  rubricsDir?: string;
  model?: string;
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_RUBRICS_DIR = './__evals__/rubrics';

export async function loadRubric(rubricPath: string, rubricsDir?: string): Promise<Rubric> {
  const baseDir = rubricsDir || DEFAULT_RUBRICS_DIR;
  const fullPath = path.isAbsolute(rubricPath)
    ? rubricPath
    : path.join(process.cwd(), baseDir, rubricPath);

  const content = await fs.readFile(fullPath, 'utf-8');
  const id = path.basename(rubricPath, path.extname(rubricPath));

  return { id, content };
}

export class LLMJudge extends BaseJudge {
  id: string;
  name: string;
  type: JudgeType = 'llm';

  private rubricPath: string;
  private anthropic: Anthropic;
  private rubricsDir: string;
  private model: string;

  constructor(id: string, rubricPath: string, options: LLMJudgeOptions = {}) {
    super();
    this.id = id;
    this.name = `LLM Judge: ${id}`;
    this.rubricPath = rubricPath;
    this.rubricsDir = options.rubricsDir || DEFAULT_RUBRICS_DIR;
    this.model = options.model || DEFAULT_MODEL;
    this.anthropic = new Anthropic();
  }

  async evaluate(context: JudgeContext): Promise<JudgeResult> {
    const { evalCase, executionResult, workingDirectory } = context;

    let rubric: Rubric;
    try {
      rubric = await loadRubric(this.rubricPath, this.rubricsDir);
    } catch (error) {
      return this.createResult({
        passed: false,
        score: 0,
        reasoning: `Failed to load rubric: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 0,
      });
    }

    const generatedFiles = await this.readTargetFiles(evalCase, workingDirectory);

    const referenceSolution = evalCase.referenceSolution as ReferenceSolution | undefined;
    let referenceFiles: Map<string, string> | undefined;
    if (referenceSolution) {
      referenceFiles = await this.readReferenceFiles(referenceSolution, workingDirectory);
    }

    const prompt = referenceFiles && referenceFiles.size > 0
      ? this.buildPairwisePrompt(evalCase, executionResult, rubric, generatedFiles, referenceFiles)
      : this.buildPrompt(evalCase, executionResult, rubric, generatedFiles);

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from LLM');
      }

      return this.parseResponse(content.text);
    } catch (error) {
      return this.createResult({
        passed: false,
        score: 0,
        reasoning: `LLM evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 0,
      });
    }
  }

  private async readReferenceFiles(
    referenceSolution: ReferenceSolution,
    workingDirectory: string
  ): Promise<Map<string, string>> {
    const files = new Map<string, string>();

    if (referenceSolution.code) {
      files.set('reference_code', referenceSolution.code);
    }

    if (referenceSolution.files && referenceSolution.files.length > 0) {
      for (const filePath of referenceSolution.files) {
        const fullPath = path.isAbsolute(filePath)
          ? filePath
          : path.join(workingDirectory, filePath);
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          files.set(filePath, content);
        } catch {
          files.set(filePath, '[REFERENCE FILE NOT FOUND]');
        }
      }
    }

    return files;
  }

  private buildPairwisePrompt(
    evalCase: any,
    result: any,
    rubric: Rubric,
    generatedFiles: Map<string, string>,
    referenceFiles: Map<string, string>
  ): string {
    const toolCallSummary = this.formatToolCalls(result.toolCalls);

    let generatedFilesSection = '';
    if (generatedFiles && generatedFiles.size > 0) {
      const fileContents = Array.from(generatedFiles.entries())
        .map(([filePath, content]) => `### ${filePath}\n\`\`\`\n${content}\n\`\`\``)
        .join('\n\n');
      generatedFilesSection = `\n## Generated Output (Candidate)\n${fileContents}\n`;
    }

    let referenceFilesSection = '';
    if (referenceFiles && referenceFiles.size > 0) {
      const fileContents = Array.from(referenceFiles.entries())
        .map(([filePath, content]) => `### ${filePath}\n\`\`\`\n${content}\n\`\`\``)
        .join('\n\n');
      referenceFilesSection = `\n## Reference Solution (Gold Standard)\n${fileContents}\n`;
    }

    return `You are an AI evaluation judge performing PAIRWISE COMPARISON. Compare the candidate output against the reference solution.

## Evaluation Case
ID: ${evalCase.id}
Name: ${evalCase.name}
Description: ${evalCase.description}
Category: ${evalCase.category}
Original Prompt: ${evalCase.prompt || 'N/A'}
Expected Behavior: ${evalCase.expectedBehavior || 'N/A'}

## Rubric
${rubric.content}
${referenceFilesSection}
${generatedFilesSection}
## Execution Result
Success: ${result.success}
AI Response: ${result.output || 'N/A'}
Duration: ${result.duration}ms
Tool Calls: ${toolCallSummary}
Error: ${result.error?.message || 'None'}

## Pairwise Comparison Instructions
1. Compare the candidate output against the reference solution
2. Evaluate how closely the candidate matches the reference in terms of:
   - Functional correctness
   - Code quality and style
   - Completeness of implementation
3. Award scores based on how well the candidate achieves the same goals as the reference
4. A candidate that fully matches or exceeds the reference should score 90-100
5. Output your evaluation in the following JSON format:

\`\`\`json
{
  "score": <number 0-100>,
  "passed": <boolean - true if score >= 70>,
  "confidence": <number 0-1 indicating how confident you are in this evaluation>,
  "reasoning": "<your detailed reasoning comparing candidate to reference, 2-4 sentences>"
}
\`\`\`

Output only the JSON block, no other text.`;
  }

  private async readTargetFiles(
    evalCase: any,
    workingDirectory: string
  ): Promise<Map<string, string>> {
    const files = new Map<string, string>();

    const targetFiles = evalCase.targetFiles as string[] | undefined;
    if (!targetFiles || targetFiles.length === 0) {
      return files;
    }

    for (const filePath of targetFiles) {
      const fullPath = path.join(workingDirectory, filePath);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        files.set(filePath, content);
      } catch {
        files.set(filePath, '[FILE NOT FOUND]');
      }
    }

    return files;
  }

  private buildPrompt(
    evalCase: any,
    result: any,
    rubric: Rubric,
    generatedFiles?: Map<string, string>
  ): string {
    const toolCallSummary = this.formatToolCalls(result.toolCalls);

    let generatedFilesSection = '';
    if (generatedFiles && generatedFiles.size > 0) {
      const fileContents = Array.from(generatedFiles.entries())
        .map(([filePath, content]) => `### ${filePath}\n\`\`\`\n${content}\n\`\`\``)
        .join('\n\n');
      generatedFilesSection = `\n## Generated Files\n${fileContents}\n`;
    }

    return `You are an AI evaluation judge. Evaluate the following AI execution result against the rubric.

## Evaluation Case
ID: ${evalCase.id}
Name: ${evalCase.name}
Description: ${evalCase.description}
Category: ${evalCase.category}
Original Prompt: ${evalCase.prompt || 'N/A'}
Expected Behavior: ${evalCase.expectedBehavior || 'N/A'}

## Rubric
${rubric.content}

## Execution Result
Success: ${result.success}
AI Response: ${result.output || 'N/A'}
Duration: ${result.duration}ms
Tool Calls: ${toolCallSummary}
Error: ${result.error?.message || 'None'}
${generatedFilesSection}
## Instructions
1. Carefully evaluate the result against each criterion in the rubric
2. Consider both what the AI did correctly and what it failed to do
3. For code-gen evals, focus on the Generated Files section to evaluate the actual code quality
4. Provide a score from 0-100 based on the rubric criteria
5. Be specific in your reasoning - cite specific behaviors observed
6. Output your evaluation in the following JSON format:

\`\`\`json
{
  "score": <number 0-100>,
  "passed": <boolean - true if score >= 70>,
  "confidence": <number 0-1 indicating how confident you are in this evaluation>,
  "reasoning": "<your detailed reasoning, 2-4 sentences>"
}
\`\`\`

Output only the JSON block, no other text.`;
  }

  private parseResponse(text: string): JudgeResult {
    const parsed = parseLLMJudgeResponse(text);
    return this.createResult(parsed);
  }

  private formatToolCalls(toolCalls: any[] | undefined): string {
    return formatToolCallsSummary(toolCalls);
  }
}

export function createLLMCodeQualityJudge(options: LLMJudgeOptions = {}): LLMJudge {
  return new LLMJudge('llm-code-quality', 'code-quality.md', options);
}

export function createLLMRoutingQualityJudge(options: LLMJudgeOptions = {}): LLMJudge {
  return new LLMJudge('llm-routing-quality', 'routing-quality.md', options);
}

export function createLLMResponseQualityJudge(options: LLMJudgeOptions = {}): LLMJudge {
  return new LLMJudge('llm-response-quality', 'response-quality.md', options);
}

export function createLLMConversationQualityJudge(options: LLMJudgeOptions = {}): LLMJudge {
  return new LLMJudge('llm-conversation-quality', 'conversation-quality.md', options);
}

export interface ParsedLLMResponse {
  passed: boolean;
  score: number;
  confidence: number;
  reasoning: string;
}

export function parseLLMJudgeResponse(text: string): ParsedLLMResponse {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonContent = jsonMatch ? jsonMatch[1] : text;

  try {
    const parsed = JSON.parse(jsonContent.trim());

    return {
      passed: parsed.passed ?? parsed.score >= 70,
      score: Math.max(0, Math.min(100, parsed.score || 0)),
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
      reasoning: parsed.reasoning || 'No reasoning provided',
    };
  } catch {
    return {
      passed: false,
      score: 0,
      reasoning: `Failed to parse LLM response: ${text.substring(0, 200)}...`,
      confidence: 0,
    };
  }
}

export function formatToolCallsSummary(toolCalls: any[] | undefined): string {
  if (!toolCalls || toolCalls.length === 0) {
    return 'None';
  }

  if (toolCalls.length <= 10) {
    return toolCalls.map((t: any) => t.toolName).join(', ');
  }

  const toolCounts = new Map<string, number>();
  for (const call of toolCalls) {
    const name = call.toolName || 'unknown';
    toolCounts.set(name, (toolCounts.get(name) || 0) + 1);
  }

  return Array.from(toolCounts.entries())
    .map(([name, count]) => count > 1 ? `${name} (x${count})` : name)
    .join(', ');
}
