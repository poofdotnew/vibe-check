/**
 * Learning Loop Runner
 * Orchestrates the full prompt learning pipeline.
 */

import { collectFromSources, getSourceStats } from './data-sources/index.js';
import { ExplanationGenerator } from './explanation-generator.js';
import { PatternDetector } from './pattern-detector.js';
import { RuleGenerator } from './rule-generator.js';
import { CLIReviewer } from './cli-reviewer.js';
import { RuleWriter } from './rule-writer.js';
import type {
  FailureInput,
  FailureExplanation,
  FailurePattern,
  ProposedRule,
  LearningIterationResult,
  CollectOptions,
} from './types.js';
import { getLearningConfig, getConfigFromEnv, type LearningConfig } from './config';

export interface LearningOptions {
  /** Data sources to use */
  sources?: string[];

  /** Options for collecting failures */
  collectOptions?: CollectOptions;

  /** Project ID for production data source (fetches from S3) */
  projectId?: string;

  /** Task ID for production data source (optional) */
  taskId?: string;

  /** Skip interactive review (use auto-approve) */
  autoApprove?: boolean;

  /** Minimum confidence for auto-approve */
  autoApproveThreshold?: number;

  /** Save pending rules for later review */
  savePending?: boolean;

  /** Run validation after applying rules */
  validate?: boolean;

  /** Progress callback */
  onProgress?: (stage: string, progress: number, total: number) => void;
}

export class LearningRunner {
  private config: LearningConfig;
  private explanationGenerator: ExplanationGenerator;
  private patternDetector: PatternDetector;
  private ruleGenerator: RuleGenerator;
  private cliReviewer: CLIReviewer;
  private ruleWriter: RuleWriter;

  constructor(config?: Partial<LearningConfig>) {
    this.config = getLearningConfig({ ...getConfigFromEnv(), ...config });
    this.explanationGenerator = new ExplanationGenerator(this.config);
    this.patternDetector = new PatternDetector(this.config);
    this.ruleGenerator = new RuleGenerator(this.config);
    this.cliReviewer = new CLIReviewer();
    this.ruleWriter = new RuleWriter(this.config);
  }

  /**
   * Runs a full learning iteration
   */
  async runIteration(options: LearningOptions = {}): Promise<LearningIterationResult> {
    const startTime = Date.now();
    const iterationId = `iteration-${new Date().toISOString().replace(/[:.]/g, '-')}`;

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              PROMPT LEARNING SYSTEM                            ║');
    console.log('║              Starting Learning Iteration                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // Phase 1: Collect failures
    console.log('📥 Phase 1: Collecting failures...');
    const sources = options.sources || ['eval', 'jsonl'];

    // Merge projectId and taskId into collectOptions for production source
    const collectOptions: CollectOptions = {
      ...options.collectOptions,
      projectId: options.projectId,
      taskId: options.taskId,
    };

    const failures = await collectFromSources(sources, collectOptions);
    console.log(`   Found ${failures.length} failures from ${sources.join(', ')}`);

    if (failures.length === 0) {
      console.log('\n✅ No failures to analyze. System is performing well!\n');
      return this.createEmptyResult(iterationId, startTime, sources);
    }

    // Phase 2: Generate explanations
    console.log('\n🔍 Phase 2: Generating failure explanations...');
    const explanations = await this.explanationGenerator.generateExplanations(
      failures,
      {
        concurrency: 3,
        onProgress: (completed, total) => {
          process.stdout.write(`\r   Progress: ${completed}/${total}`);
          options.onProgress?.('explanations', completed, total);
        },
      }
    );
    console.log(`\n   Generated ${explanations.length} explanations`);

    // Phase 3: Detect patterns
    console.log('\n🔗 Phase 3: Detecting patterns...');
    const patterns = this.patternDetector.detectPatterns(explanations);
    console.log(`   Detected ${patterns.length} patterns`);

    if (patterns.length === 0) {
      console.log('\n⚠️  No patterns detected. Failures may be too diverse.\n');
      return this.createResult(
        iterationId,
        startTime,
        sources,
        failures.length,
        explanations.length,
        [],
        [],
        [],
        []
      );
    }

    // Print pattern summary
    this.printPatternSummary(patterns);

    // Phase 4: Generate rules
    console.log('\n📝 Phase 4: Generating rules...');
    const proposedRules = await this.ruleGenerator.generateRules(patterns, {
      maxRules: this.config.maxRulesPerIteration,
      onProgress: (completed, total) => {
        process.stdout.write(`\r   Progress: ${completed}/${total}`);
        options.onProgress?.('rules', completed, total);
      },
    });
    console.log(`\n   Generated ${proposedRules.length} proposed rules`);

    // Filter low-confidence rules
    const filteredRules = this.ruleGenerator.filterByConfidence(proposedRules);
    console.log(`   ${filteredRules.length} rules pass confidence threshold`);

    if (filteredRules.length === 0) {
      console.log('\n⚠️  No rules passed confidence threshold.\n');
      return this.createResult(
        iterationId,
        startTime,
        sources,
        failures.length,
        explanations.length,
        patterns,
        proposedRules,
        [],
        []
      );
    }

    // Phase 5: Human review or auto-approve
    let approvedRules: ProposedRule[] = [];
    let rejectedRules: ProposedRule[] = [];

    if (options.autoApprove) {
      console.log('\n✅ Phase 5: Auto-approving rules...');
      const session = this.cliReviewer.autoApproveAll(
        filteredRules,
        options.autoApproveThreshold || 0.8
      );
      approvedRules = session.approved;
      rejectedRules = session.rejected;
      console.log(`   Auto-approved: ${approvedRules.length}, Skipped: ${session.skipped.length}`);
    } else if (options.savePending) {
      console.log('\n💾 Phase 5: Saving rules for later review...');
      await this.ruleWriter.savePendingRules(filteredRules);
      console.log(`   Saved ${filteredRules.length} rules to pending/`);
      console.log('   Run "npm run learn:review" to review them');
    } else {
      console.log('\n👤 Phase 5: Interactive review...');
      const session = await this.cliReviewer.startReviewSession(filteredRules);
      approvedRules = session.approved;
      rejectedRules = session.rejected;
    }

    // Phase 6: Save approved rules
    if (approvedRules.length > 0) {
      console.log('\n💾 Phase 6: Saving approved rules...');
      await this.ruleWriter.addApprovedRules(approvedRules, iterationId);
      console.log(`   Saved ${approvedRules.length} rules to learned-rules.json`);
    }

    // Create and save iteration result
    const result = this.createResult(
      iterationId,
      startTime,
      sources,
      failures.length,
      explanations.length,
      patterns,
      proposedRules,
      approvedRules,
      rejectedRules
    );

    await this.ruleWriter.addIterationToHistory(result);

    // Print summary
    this.printIterationSummary(result);

    return result;
  }

  /**
   * Analyzes failures without generating rules
   */
  async analyze(options: LearningOptions = {}): Promise<{
    failures: FailureInput[];
    explanations: FailureExplanation[];
    patterns: FailurePattern[];
  }> {
    console.log('\n📊 ANALYZE MODE: Collecting and analyzing failures...\n');

    const sources = options.sources || ['eval', 'jsonl'];

    // Merge projectId and taskId into collectOptions for production source
    const collectOptions: CollectOptions = {
      ...options.collectOptions,
      projectId: options.projectId,
      taskId: options.taskId,
    };

    const failures = await collectFromSources(sources, collectOptions);
    console.log(`Found ${failures.length} failures`);

    if (failures.length === 0) {
      return { failures: [], explanations: [], patterns: [] };
    }

    const explanations = await this.explanationGenerator.generateExplanations(
      failures,
      { concurrency: 3 }
    );
    console.log(`Generated ${explanations.length} explanations`);

    const patterns = this.patternDetector.detectPatterns(explanations);
    console.log(`Detected ${patterns.length} patterns`);

    this.printPatternSummary(patterns);

    return { failures, explanations, patterns };
  }

  /**
   * Reviews pending rules
   */
  async reviewPending(): Promise<void> {
    const pending = await this.ruleWriter.loadPendingRules();

    if (pending.length === 0) {
      console.log('No pending rules to review.');
      return;
    }

    const session = await this.cliReviewer.startReviewSession(pending);

    // Process decisions
    for (const decision of session.decisions) {
      if (decision.decision === 'approve' || decision.decision === 'modify') {
        await this.ruleWriter.approvePendingRule(decision.rule.ruleId);
      } else if (decision.decision === 'reject') {
        await this.ruleWriter.rejectPendingRule(
          decision.rule.ruleId,
          decision.notes || 'Rejected'
        );
      }
      // Skip leaves the rule in pending
    }

    console.log(`\nApproved: ${session.approved.length}`);
    console.log(`Rejected: ${session.rejected.length}`);
    console.log(`Remaining pending: ${session.skipped.length}`);
  }

  /**
   * Shows current stats
   */
  async showStats(): Promise<void> {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              PROMPT LEARNING SYSTEM STATUS                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // Source stats
    const sourceStats = await getSourceStats();
    console.log('Data Sources:');
    for (const [name, stats] of Object.entries(sourceStats)) {
      const status = stats.available ? '✅' : '❌';
      const count = stats.failureCount !== undefined ? ` (${stats.failureCount} failures)` : '';
      console.log(`  ${status} ${name}${count}`);

      // Show JSONL details if available
      if (stats.details) {
        console.log(`      Projects: ${stats.details.projects}`);
        console.log(`      Files: ${stats.details.files}`);
        console.log(`      Sessions: ${stats.details.sessions}`);
      }
    }

    // Rule stats
    const ruleStats = await this.ruleWriter.getStats();
    console.log('\nRules:');
    console.log(`  Total learned: ${ruleStats.totalRules}`);
    console.log(`  Pending review: ${ruleStats.pendingCount}`);
    console.log(`  Approved: ${ruleStats.approvedCount}`);
    console.log(`  Rejected: ${ruleStats.rejectedCount}`);
    console.log(`  Iterations: ${ruleStats.iterationsCount}`);

    console.log('');
  }

  /**
   * Creates an empty result for no-failures case
   */
  private createEmptyResult(
    iterationId: string,
    startTime: number,
    sources: string[]
  ): LearningIterationResult {
    return {
      iterationId,
      timestamp: new Date().toISOString(),
      sources,
      failuresCollected: 0,
      explanationsGenerated: 0,
      patternsDetected: [],
      rulesProposed: [],
      rulesApproved: [],
      rulesRejected: [],
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Creates a full result
   */
  private createResult(
    iterationId: string,
    startTime: number,
    sources: string[],
    failuresCollected: number,
    explanationsGenerated: number,
    patterns: FailurePattern[],
    proposed: ProposedRule[],
    approved: ProposedRule[],
    rejected: ProposedRule[]
  ): LearningIterationResult {
    return {
      iterationId,
      timestamp: new Date().toISOString(),
      sources,
      failuresCollected,
      explanationsGenerated,
      patternsDetected: patterns,
      rulesProposed: proposed,
      rulesApproved: approved,
      rulesRejected: rejected,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Prints pattern summary
   */
  private printPatternSummary(patterns: FailurePattern[]): void {
    console.log('\n   Patterns detected:');
    for (const pattern of patterns.slice(0, 5)) {
      console.log(`     - ${pattern.patternName} (${pattern.frequency} failures)`);
    }
    if (patterns.length > 5) {
      console.log(`     ... and ${patterns.length - 5} more`);
    }
  }

  /**
   * Prints iteration summary
   */
  private printIterationSummary(result: LearningIterationResult): void {
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('  LEARNING ITERATION COMPLETE');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`  Iteration ID: ${result.iterationId}`);
    console.log(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
    console.log('');
    console.log(`  Failures analyzed: ${result.failuresCollected}`);
    console.log(`  Explanations generated: ${result.explanationsGenerated}`);
    console.log(`  Patterns detected: ${result.patternsDetected.length}`);
    console.log(`  Rules proposed: ${result.rulesProposed.length}`);
    console.log(`  Rules approved: ${result.rulesApproved.length}`);
    console.log(`  Rules rejected: ${result.rulesRejected.length}`);
    console.log('');
    console.log('  Next steps:');
    console.log('    1. Review learned-rules.json');
    console.log('    2. Manually integrate approved rules into prompt-templates.ts');
    console.log('    3. Run evals to validate improvements');
    console.log('════════════════════════════════════════════════════════════════\n');
  }
}

export default LearningRunner;
