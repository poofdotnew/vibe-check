/**
 * Generates new prompt rules based on detected failure patterns.
 * Uses LLM to synthesize rules from pattern analysis.
 */

import fs from 'fs/promises';
import path from 'path';
import type { FailurePattern, ProposedRule } from './types.js';
import { getLearningConfig, type LearningConfig } from './config.js';

export interface RuleGenerationResult {
  rule: string;
  targetSection: string;
  placement?: string;
  rationale: string;
  expectedImpact: {
    evalIds: string[];
    confidenceScore: number;
  };
}

export function parseRuleGenerationResponse(
  text: string,
  defaultTargetSection: string,
  fallbackEvalIds: string[]
): RuleGenerationResult {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonContent = jsonMatch ? jsonMatch[1] : text;

  try {
    const parsed = JSON.parse(jsonContent.trim());

    return {
      rule: parsed.rule || 'No rule generated',
      targetSection: parsed.targetSection || defaultTargetSection,
      placement: parsed.placement,
      rationale: parsed.rationale || 'No rationale provided',
      expectedImpact: {
        evalIds: parsed.expectedImpact?.evalIds || fallbackEvalIds,
        confidenceScore: Math.max(0, Math.min(1, parsed.expectedImpact?.confidenceScore || 0.5)),
      },
    };
  } catch {
    return {
      rule: text.substring(0, 500),
      targetSection: defaultTargetSection,
      rationale: 'Failed to parse structured response',
      expectedImpact: {
        evalIds: fallbackEvalIds,
        confidenceScore: 0.3,
      },
    };
  }
}

export function getTargetSectionForCategory(category: string): string {
  return CATEGORY_TO_SECTION[category] || CATEGORY_TO_SECTION['other'];
}

/**
 * Maps pattern categories to prompt sections
 */
const CATEGORY_TO_SECTION: Record<string, string> = {
  'routing-error': 'CHAT_PROMPT.delegationPrinciple',
  'delegation-error': 'CHAT_PROMPT.delegationPrinciple',
  'missing-tool-call': 'CHAT_PROMPT.troubleshooting',
  'incorrect-code-pattern': 'CORE_INSTRUCTIONS',
  'validation-failure': 'CORE_INSTRUCTIONS.coreSafetyRules',
  'context-missing': 'CHAT_PROMPT.reasoningAndPlanning',
  other: 'CORE_INSTRUCTIONS',
};

type AnthropicClient = import('@anthropic-ai/sdk').default;

export class RuleGenerator {
  private anthropic: AnthropicClient | null = null;
  private config: LearningConfig;
  private promptTemplate: string | null = null;
  private currentInstructions: Map<string, string> = new Map();

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
   * Loads the rule generation prompt template
   */
  private async loadPromptTemplate(): Promise<string> {
    if (this.promptTemplate) {
      return this.promptTemplate;
    }

    const promptPath = path.join(this.config.promptsDir, 'rule-generation.md');

    try {
      this.promptTemplate = await fs.readFile(promptPath, 'utf-8');
      return this.promptTemplate;
    } catch (error) {
      throw new Error(`Failed to load rule generation prompt from ${promptPath}: ${error}`);
    }
  }

  /**
   * Loads current instructions from prompt-templates.ts
   * (Reads a simplified version for context)
   */
  async loadCurrentInstructions(): Promise<void> {
    const templatePath = path.join(
      this.config.learningDir,
      '..',
      '..',
      'lib',
      'ai',
      'claude-code',
      'prompt-templates.ts'
    );

    try {
      const content = await fs.readFile(templatePath, 'utf-8');

      // Extract major sections (simplified parsing)
      const sections = [
        'CORE_INSTRUCTIONS',
        'CHAT_PROMPT',
        'delegationPrinciple',
        'coreSafetyRules',
        'troubleshooting',
      ];

      for (const section of sections) {
        const regex = new RegExp(`${section}[:\\s]*[\`'"](.*?)[\`'"]`, 'gs');
        const match = content.match(regex);
        if (match) {
          this.currentInstructions.set(section, match[0].substring(0, 500) + '...');
        }
      }
    } catch (error) {
      console.warn('Could not load current instructions:', error);
    }
  }

  private getTargetSection(pattern: FailurePattern): string {
    return getTargetSectionForCategory(pattern.category);
  }

  /**
   * Builds the prompt for rule generation
   */
  private async buildPrompt(pattern: FailurePattern): Promise<string> {
    const template = await this.loadPromptTemplate();
    const targetSection = this.getTargetSection(pattern);

    // Get current instructions for the target section
    const sectionKey = targetSection.split('.')[0];
    const currentInstructions =
      this.currentInstructions.get(sectionKey) || '(Instructions not loaded)';

    // Format failures
    const failuresFormatted = pattern.failures
      .slice(0, 5) // Limit to 5 examples
      .map((f, i) => {
        const evalName = (f.failureInput.metadata?.evalName as string) || f.failureInput.id;
        return `#### Failure ${i + 1}
- **Eval**: ${evalName}
- **What Went Wrong**: ${f.explanation.whatWentWrong}
- **Why It Failed**: ${f.explanation.whyItFailed}
- **Suggested Fix**: ${f.explanation.suggestedFix}`;
      })
      .join('\n\n');

    // Replace template variables
    let prompt = template
      .replace('{{targetSection}}', targetSection)
      .replace('{{currentInstructions}}', currentInstructions)
      .replace('{{patternName}}', pattern.patternName)
      .replace('{{patternCategory}}', pattern.category)
      .replace('{{frequency}}', pattern.frequency.toString())
      .replace('{{affectedComponents}}', pattern.affectedComponents.join(', ') || 'None specified')
      .replace('{{commonRootCauses}}', pattern.commonRootCauses.join('\n- ') || 'None identified');

    // Handle the failures loop
    prompt = prompt.replace(/{{#each failures}}[\s\S]*?{{\/each}}/g, failuresFormatted);

    return prompt;
  }

  private parseResponse(text: string, pattern: FailurePattern): RuleGenerationResult {
    const fallbackEvalIds = pattern.failures.slice(0, 5).map((f) => f.failureInput.id);
    return parseRuleGenerationResponse(text, this.getTargetSection(pattern), fallbackEvalIds);
  }

  /**
   * Generates a rule for a single pattern
   */
  async generateRule(pattern: FailurePattern): Promise<ProposedRule> {
    const prompt = await this.buildPrompt(pattern);

    try {
      const client = await this.getAnthropicClient();
      const response = await client.messages.create({
        model: this.config.ruleGenerationModel,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from LLM');
      }

      const result = this.parseResponse(content.text, pattern);

      return {
        ruleId: `rule-${pattern.patternId}`,
        ruleContent: result.rule,
        targetSection: result.targetSection,
        placement: result.placement,
        rationale: result.rationale,
        addressesPatterns: [pattern.patternId],
        expectedImpact: {
          failureIds: result.expectedImpact.evalIds,
          confidenceScore: result.expectedImpact.confidenceScore,
        },
        status: 'pending',
        generatedAt: new Date().toISOString(),
        model: this.config.ruleGenerationModel,
        source: `iteration-${new Date().toISOString().split('T')[0]}`,
      };
    } catch (error) {
      console.error(`Failed to generate rule for pattern ${pattern.patternId}:`, error);

      return {
        ruleId: `rule-${pattern.patternId}`,
        ruleContent: `[Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}]`,
        targetSection: this.getTargetSection(pattern),
        rationale: 'Rule generation failed',
        addressesPatterns: [pattern.patternId],
        expectedImpact: {
          failureIds: [],
          confidenceScore: 0,
        },
        status: 'pending',
        generatedAt: new Date().toISOString(),
        model: this.config.ruleGenerationModel,
        source: `iteration-${new Date().toISOString().split('T')[0]}`,
      };
    }
  }

  /**
   * Generates rules for multiple patterns
   */
  async generateRules(
    patterns: FailurePattern[],
    options?: {
      maxRules?: number;
      onProgress?: (completed: number, total: number) => void;
    }
  ): Promise<ProposedRule[]> {
    // Load current instructions first
    await this.loadCurrentInstructions();

    // Limit patterns to process
    const maxRules = options?.maxRules ?? this.config.maxRulesPerIteration;
    const patternsToProcess = patterns.slice(0, maxRules);

    const rules: ProposedRule[] = [];

    for (let i = 0; i < patternsToProcess.length; i++) {
      const pattern = patternsToProcess[i];
      const rule = await this.generateRule(pattern);
      rules.push(rule);

      options?.onProgress?.(i + 1, patternsToProcess.length);
    }

    return rules;
  }

  /**
   * Filters rules by confidence
   */
  filterByConfidence(rules: ProposedRule[], minConfidence?: number): ProposedRule[] {
    const threshold = minConfidence ?? this.config.minRuleConfidence;
    return rules.filter((r) => r.expectedImpact.confidenceScore >= threshold);
  }

  /**
   * Checks for conflicts between a new rule and existing rules
   */
  checkForConflicts(
    newRule: ProposedRule,
    existingRules: ProposedRule[]
  ): { hasConflict: boolean; conflictingRules: ProposedRule[] } {
    const conflicting = existingRules.filter((existing) => {
      // Same target section
      if (existing.targetSection !== newRule.targetSection) {
        return false;
      }

      // Check for contradictory keywords
      const newLower = newRule.ruleContent.toLowerCase();
      const existingLower = existing.ruleContent.toLowerCase();

      // Simple conflict detection: opposite instructions
      const hasAlways = newLower.includes('always');
      const hasNever = newLower.includes('never');
      const existingHasAlways = existingLower.includes('always');
      const existingHasNever = existingLower.includes('never');

      if ((hasAlways && existingHasNever) || (hasNever && existingHasAlways)) {
        // Check if they're about the same topic (rough heuristic)
        const newWords = new Set(newLower.split(/\s+/).filter((w) => w.length > 4));
        const existingWords = new Set(existingLower.split(/\s+/).filter((w) => w.length > 4));
        const commonWords = [...newWords].filter((w) => existingWords.has(w));

        if (commonWords.length > 2) {
          return true;
        }
      }

      return false;
    });

    return {
      hasConflict: conflicting.length > 0,
      conflictingRules: conflicting,
    };
  }
}

export default RuleGenerator;
