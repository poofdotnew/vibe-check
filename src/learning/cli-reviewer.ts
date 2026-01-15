/**
 * Interactive CLI for reviewing proposed rules.
 * Provides a human-in-the-loop interface for approving/rejecting rules.
 */

import * as readline from 'readline';
import type { ProposedRule, FailurePattern } from './types.js';

export interface ReviewDecision {
  rule: ProposedRule;
  decision: 'approve' | 'reject' | 'modify' | 'skip';
  notes?: string;
  modifiedRule?: string;
}

export interface ReviewSession {
  decisions: ReviewDecision[];
  approved: ProposedRule[];
  rejected: ProposedRule[];
  skipped: ProposedRule[];
}

/**
 * Formats a rule for display
 */
function formatRuleDisplay(rule: ProposedRule, index: number, total: number): string {
  const header = `
════════════════════════════════════════════════════════════════════
  PROMPT LEARNING: RULE REVIEW (${index + 1}/${total})
════════════════════════════════════════════════════════════════════`;

  const ruleBox = `
┌─────────────────────────────────────────────────────────────────┐
│ ${rule.ruleContent.split('\n').map(line => line.padEnd(63)).join('\n│ ')}
└─────────────────────────────────────────────────────────────────┘`;

  const evidence = `
Evidence:
  - Pattern: ${rule.addressesPatterns.join(', ')}
  - Target: ${rule.targetSection}
  - Confidence: ${(rule.expectedImpact.confidenceScore * 100).toFixed(0)}%
  - Affects: ${rule.expectedImpact.failureIds.slice(0, 3).join(', ')}${rule.expectedImpact.failureIds.length > 3 ? '...' : ''}

Rationale:
  ${rule.rationale}`;

  return header + '\n' + ruleBox + evidence;
}

/**
 * Interactive CLI reviewer for proposed rules
 */
export class CLIReviewer {
  private rl: readline.Interface | null = null;

  /**
   * Creates readline interface
   */
  private createInterface(): readline.Interface {
    return readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * Prompts user for input
   */
  private async prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl?.question(question, (answer) => {
        resolve(answer.trim().toLowerCase());
      });
    });
  }

  /**
   * Prompts for multi-line input
   */
  private async promptMultiline(prompt: string): Promise<string> {
    console.log(prompt);
    console.log('(Enter an empty line to finish)');

    const lines: string[] = [];
    let line = await this.prompt('> ');

    while (line !== '') {
      lines.push(line);
      line = await this.prompt('> ');
    }

    return lines.join('\n');
  }

  /**
   * Reviews a single rule
   */
  private async reviewRule(
    rule: ProposedRule,
    index: number,
    total: number
  ): Promise<ReviewDecision> {
    console.log(formatRuleDisplay(rule, index, total));
    console.log('\n[A]pprove  [R]eject  [M]odify  [S]kip  [Q]uit\n');

    const answer = await this.prompt('Your choice: ');

    switch (answer) {
      case 'a':
      case 'approve':
        const approveNotes = await this.prompt('Notes (optional): ');
        return {
          rule: { ...rule, status: 'approved' },
          decision: 'approve',
          notes: approveNotes || undefined,
        };

      case 'r':
      case 'reject':
        const rejectReason = await this.prompt('Reason for rejection: ');
        return {
          rule: { ...rule, status: 'rejected', reviewNotes: rejectReason },
          decision: 'reject',
          notes: rejectReason,
        };

      case 'm':
      case 'modify':
        console.log('\nCurrent rule:');
        console.log(rule.ruleContent);
        const modified = await this.promptMultiline('\nEnter modified rule:');
        return {
          rule: { ...rule, status: 'approved', ruleContent: modified },
          decision: 'modify',
          modifiedRule: modified,
        };

      case 's':
      case 'skip':
        return {
          rule,
          decision: 'skip',
        };

      case 'q':
      case 'quit':
        throw new Error('Review session aborted by user');

      default:
        console.log('Invalid choice. Please try again.');
        return this.reviewRule(rule, index, total);
    }
  }

  /**
   * Starts an interactive review session
   */
  async startReviewSession(rules: ProposedRule[]): Promise<ReviewSession> {
    if (rules.length === 0) {
      console.log('No rules to review.');
      return { decisions: [], approved: [], rejected: [], skipped: [] };
    }

    this.rl = this.createInterface();

    console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
    console.log(`║              PROMPT LEARNING SYSTEM                            ║`);
    console.log(`║              Interactive Rule Review                           ║`);
    console.log(`╠════════════════════════════════════════════════════════════════╣`);
    console.log(`║  ${rules.length} rule(s) to review                                          ║`);
    console.log(`║                                                                ║`);
    console.log(`║  Commands:                                                     ║`);
    console.log(`║    [A]pprove - Accept the rule as-is                          ║`);
    console.log(`║    [R]eject  - Reject the rule with reason                    ║`);
    console.log(`║    [M]odify  - Edit the rule before approving                 ║`);
    console.log(`║    [S]kip    - Skip for now, review later                     ║`);
    console.log(`║    [Q]uit    - Exit review session                            ║`);
    console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

    const decisions: ReviewDecision[] = [];
    const approved: ProposedRule[] = [];
    const rejected: ProposedRule[] = [];
    const skipped: ProposedRule[] = [];

    try {
      for (let i = 0; i < rules.length; i++) {
        const decision = await this.reviewRule(rules[i], i, rules.length);
        decisions.push(decision);

        switch (decision.decision) {
          case 'approve':
          case 'modify':
            approved.push(decision.rule);
            break;
          case 'reject':
            rejected.push(decision.rule);
            break;
          case 'skip':
            skipped.push(decision.rule);
            break;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('aborted')) {
        console.log('\nReview session aborted.');
      } else {
        throw error;
      }
    } finally {
      this.rl?.close();
      this.rl = null;
    }

    // Print summary
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('  REVIEW SESSION COMPLETE');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`  Approved: ${approved.length}`);
    console.log(`  Rejected: ${rejected.length}`);
    console.log(`  Skipped:  ${skipped.length}`);
    console.log('════════════════════════════════════════════════════════════════\n');

    return { decisions, approved, rejected, skipped };
  }

  /**
   * Prints a summary of rules without interactive review
   */
  printRulesSummary(rules: ProposedRule[]): void {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              PROPOSED RULES SUMMARY                            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    for (const [i, rule] of rules.entries()) {
      console.log(`[${i + 1}] ${rule.ruleId}`);
      console.log(`    Target: ${rule.targetSection}`);
      console.log(`    Confidence: ${(rule.expectedImpact.confidenceScore * 100).toFixed(0)}%`);
      console.log(`    Rule: ${rule.ruleContent.substring(0, 80)}...`);
      console.log('');
    }
  }

  /**
   * Quick approve all rules (for non-interactive mode)
   */
  autoApproveAll(
    rules: ProposedRule[],
    minConfidence: number = 0.8
  ): ReviewSession {
    const decisions: ReviewDecision[] = [];
    const approved: ProposedRule[] = [];
    const rejected: ProposedRule[] = [];
    const skipped: ProposedRule[] = [];

    for (const rule of rules) {
      if (rule.expectedImpact.confidenceScore >= minConfidence) {
        const approvedRule = { ...rule, status: 'approved' as const };
        decisions.push({ rule: approvedRule, decision: 'approve' });
        approved.push(approvedRule);
      } else {
        decisions.push({ rule, decision: 'skip' });
        skipped.push(rule);
      }
    }

    return { decisions, approved, rejected, skipped };
  }
}

export default CLIReviewer;
