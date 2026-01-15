/**
 * Generates LLM-powered explanations for why failures occurred.
 * This is the critical component - quality of explanations drives learning quality.
 */

import fs from 'fs/promises';
import path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();
import type { FailureInput } from './data-sources/types.js';
import type { FailureExplanation } from './types.js';
import { getLearningConfig, type LearningConfig } from './config.js';

interface ExplanationResult {
  whatWentWrong: string;
  whyItFailed: string;
  rootCause: string;
  suggestedFix: string;
  patternCategory: string;
  affectedComponent?: string;
  confidence: number;
}

type AnthropicClient = import('@anthropic-ai/sdk').default;

export class ExplanationGenerator {
  private anthropic: AnthropicClient | null = null;
  private config: LearningConfig;
  private promptTemplate: string | null = null;

  constructor(config?: Partial<LearningConfig>) {
    this.config = getLearningConfig(config);
  }

  private async getAnthropicClient(): Promise<AnthropicClient> {
    if (!this.anthropic) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      this.anthropic = new Anthropic();
    }
    return this.anthropic;
  }

  /**
   * Loads the failure analysis prompt template
   */
  private async loadPromptTemplate(): Promise<string> {
    if (this.promptTemplate) {
      return this.promptTemplate;
    }

    const promptPath = path.join(
      this.config.promptsDir,
      'failure-analysis.md'
    );

    try {
      this.promptTemplate = await fs.readFile(promptPath, 'utf-8');
      return this.promptTemplate;
    } catch (error) {
      throw new Error(
        `Failed to load failure analysis prompt from ${promptPath}: ${error}`
      );
    }
  }

  /**
   * Builds the prompt for a specific failure
   */
  private async buildPrompt(failure: FailureInput): Promise<string> {
    const template = await this.loadPromptTemplate();

    // Format tool calls
    const toolCallsFormatted = failure.toolCalls?.length
      ? failure.toolCalls
          .map(
            (tc) =>
              `- ${tc.name}${tc.error ? ` (error: ${tc.error})` : ''}`
          )
          .join('\n')
      : 'None';

    // Format judge results
    const judgeResultsFormatted = failure.judgeResults?.length
      ? failure.judgeResults
          .map(
            (jr) =>
              `- ${jr.judgeId}: ${jr.passed ? 'PASSED' : 'FAILED'} (score: ${jr.score})\n  Reasoning: ${jr.reasoning}`
          )
          .join('\n')
      : 'None';

    // Replace template variables
    let prompt = template
      .replace('{{evalName}}', failure.metadata?.evalName as string ?? failure.id)
      .replace('{{category}}', failure.category ?? 'unknown')
      .replace('{{description}}', failure.metadata?.evalDescription as string ?? '')
      .replace('{{prompt}}', failure.prompt)
      .replace('{{expectedBehavior}}', failure.expectedBehavior ?? 'Not specified')
      .replace('{{toolCalls}}', toolCallsFormatted)
      .replace('{{output}}', failure.output || 'No output')
      .replace('{{judgeResults}}', judgeResultsFormatted);

    // Handle conditional error section
    if (failure.error) {
      prompt = prompt.replace('{{#if error}}', '').replace('{{/if}}', '');
      prompt = prompt.replace('{{error}}', failure.error);
    } else {
      // Remove the error section if no error
      prompt = prompt.replace(/{{#if error}}[\s\S]*?{{\/if}}/g, '');
    }

    return prompt;
  }

  /**
   * Parses the LLM response into a structured explanation
   */
  private parseResponse(text: string): ExplanationResult {
    // Try to extract JSON from markdown code block
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonContent = jsonMatch ? jsonMatch[1] : text;

    try {
      const parsed = JSON.parse(jsonContent.trim());

      return {
        whatWentWrong: parsed.whatWentWrong || 'Unknown',
        whyItFailed: parsed.whyItFailed || 'Unknown',
        rootCause: parsed.rootCause || 'Unknown',
        suggestedFix: parsed.suggestedFix || 'No suggestion',
        patternCategory: parsed.patternCategory || 'other',
        affectedComponent: parsed.affectedComponent,
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
      };
    } catch (error) {
      console.warn('Failed to parse LLM response:', text.substring(0, 200));
      return {
        whatWentWrong: 'Failed to parse response',
        whyItFailed: text.substring(0, 500),
        rootCause: 'Parse error',
        suggestedFix: 'Manual review required',
        patternCategory: 'other',
        confidence: 0,
      };
    }
  }

  /**
   * Generates an explanation for a single failure
   */
  async generateExplanation(failure: FailureInput): Promise<FailureExplanation> {
    const prompt = await this.buildPrompt(failure);

    try {
      const client = await this.getAnthropicClient();
      const response = await client.messages.create({
        model: this.config.explanationModel,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from LLM');
      }

      const explanation = this.parseResponse(content.text);

      return {
        id: `explanation-${failure.id}-${Date.now()}`,
        failureInput: failure,
        explanation,
        confidence: explanation.confidence,
        generatedAt: new Date().toISOString(),
        model: this.config.explanationModel,
      };
    } catch (error) {
      console.error(`Failed to generate explanation for ${failure.id}:`, error);

      return {
        id: `explanation-${failure.id}-${Date.now()}`,
        failureInput: failure,
        explanation: {
          whatWentWrong: 'Failed to generate explanation',
          whyItFailed: error instanceof Error ? error.message : 'Unknown error',
          rootCause: 'LLM error',
          suggestedFix: 'Manual review required',
          patternCategory: 'other',
        },
        confidence: 0,
        generatedAt: new Date().toISOString(),
        model: this.config.explanationModel,
      };
    }
  }

  /**
   * Generates explanations for multiple failures
   */
  async generateExplanations(
    failures: FailureInput[],
    options?: {
      concurrency?: number;
      onProgress?: (completed: number, total: number) => void;
    }
  ): Promise<FailureExplanation[]> {
    const concurrency = options?.concurrency ?? 3;
    const explanations: FailureExplanation[] = [];
    let completed = 0;

    // Process in batches
    for (let i = 0; i < failures.length; i += concurrency) {
      const batch = failures.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((f) => this.generateExplanation(f))
      );
      explanations.push(...batchResults);

      completed += batch.length;
      options?.onProgress?.(completed, failures.length);
    }

    return explanations;
  }

  /**
   * Filters explanations by confidence threshold
   */
  filterByConfidence(
    explanations: FailureExplanation[],
    minConfidence: number = 0.5
  ): FailureExplanation[] {
    return explanations.filter((e) => e.confidence >= minConfidence);
  }

  /**
   * Groups explanations by pattern category
   */
  groupByCategory(
    explanations: FailureExplanation[]
  ): Record<string, FailureExplanation[]> {
    const grouped: Record<string, FailureExplanation[]> = {};

    for (const explanation of explanations) {
      const category = explanation.explanation.patternCategory;
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(explanation);
    }

    return grouped;
  }
}

export default ExplanationGenerator;
