/**
 * Writes approved rules to the learned-rules.json file.
 * Manages the rules storage lifecycle.
 */

import fs from 'fs/promises';
import path from 'path';
import type { ProposedRule, LearnedRulesFile, LearningHistory, LearningIterationResult } from './types.js';
import { getLearningConfig, type LearningConfig } from './config.js';

export class RuleWriter {
  private config: LearningConfig;

  constructor(config?: Partial<LearningConfig>) {
    this.config = getLearningConfig(config);
  }

  /**
   * Ensures rules directories exist
   */
  async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.config.rulesDir, { recursive: true });
    await fs.mkdir(this.config.pendingDir, { recursive: true });
    await fs.mkdir(this.config.approvedDir, { recursive: true });
    await fs.mkdir(this.config.rejectedDir, { recursive: true });
  }

  /**
   * Reads the current learned rules file
   */
  async readLearnedRules(): Promise<LearnedRulesFile> {
    try {
      const content = await fs.readFile(this.config.learnedRulesPath, 'utf-8');
      return JSON.parse(content) as LearnedRulesFile;
    } catch {
      // File doesn't exist or is invalid, return empty
      return {
        rules: [],
        lastUpdated: new Date().toISOString(),
        iterations: [],
      };
    }
  }

  /**
   * Writes rules to the learned rules file
   */
  async writeLearnedRules(rules: LearnedRulesFile): Promise<void> {
    await this.ensureDirectories();

    const content = JSON.stringify(rules, null, 2);
    await fs.writeFile(this.config.learnedRulesPath, content, 'utf-8');
  }

  /**
   * Adds approved rules to the learned rules file
   */
  async addApprovedRules(
    rules: ProposedRule[],
    iterationId: string
  ): Promise<void> {
    const current = await this.readLearnedRules();

    // Add new rules
    for (const rule of rules) {
      // Check if rule already exists (by ID)
      const existingIndex = current.rules.findIndex(
        (r) => r.ruleId === rule.ruleId
      );

      if (existingIndex >= 0) {
        // Update existing rule
        current.rules[existingIndex] = { ...rule, status: 'approved' };
      } else {
        // Add new rule
        current.rules.push({ ...rule, status: 'approved' });
      }
    }

    // Update metadata
    current.lastUpdated = new Date().toISOString();
    if (!current.iterations.includes(iterationId)) {
      current.iterations.push(iterationId);
    }

    await this.writeLearnedRules(current);
  }

  /**
   * Saves a rule to the pending directory for later review
   */
  async savePendingRule(rule: ProposedRule): Promise<string> {
    await this.ensureDirectories();

    const filename = `${rule.ruleId}.json`;
    const filepath = path.join(this.config.pendingDir, filename);

    await fs.writeFile(filepath, JSON.stringify(rule, null, 2), 'utf-8');

    return filepath;
  }

  /**
   * Saves multiple pending rules
   */
  async savePendingRules(rules: ProposedRule[]): Promise<string[]> {
    const paths: string[] = [];
    for (const rule of rules) {
      const filepath = await this.savePendingRule(rule);
      paths.push(filepath);
    }
    return paths;
  }

  /**
   * Loads pending rules from the pending directory
   */
  async loadPendingRules(): Promise<ProposedRule[]> {
    try {
      const files = await fs.readdir(this.config.pendingDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      const rules: ProposedRule[] = [];
      for (const file of jsonFiles) {
        const filepath = path.join(this.config.pendingDir, file);
        const content = await fs.readFile(filepath, 'utf-8');
        rules.push(JSON.parse(content) as ProposedRule);
      }

      return rules;
    } catch {
      return [];
    }
  }

  /**
   * Moves a pending rule to approved
   */
  async approvePendingRule(ruleId: string): Promise<void> {
    const pendingPath = path.join(this.config.pendingDir, `${ruleId}.json`);
    const approvedPath = path.join(this.config.approvedDir, `${ruleId}.json`);

    try {
      const content = await fs.readFile(pendingPath, 'utf-8');
      const rule = JSON.parse(content) as ProposedRule;
      rule.status = 'approved';

      await fs.writeFile(approvedPath, JSON.stringify(rule, null, 2), 'utf-8');
      await fs.unlink(pendingPath);

      // Also add to learned rules
      await this.addApprovedRules([rule], `manual-${Date.now()}`);
    } catch (error) {
      throw new Error(`Failed to approve rule ${ruleId}: ${error}`);
    }
  }

  /**
   * Moves a pending rule to rejected
   */
  async rejectPendingRule(ruleId: string, reason: string): Promise<void> {
    const pendingPath = path.join(this.config.pendingDir, `${ruleId}.json`);
    const rejectedPath = path.join(this.config.rejectedDir, `${ruleId}.json`);

    try {
      const content = await fs.readFile(pendingPath, 'utf-8');
      const rule = JSON.parse(content) as ProposedRule;
      rule.status = 'rejected';
      rule.reviewNotes = reason;

      await fs.writeFile(rejectedPath, JSON.stringify(rule, null, 2), 'utf-8');
      await fs.unlink(pendingPath);
    } catch (error) {
      throw new Error(`Failed to reject rule ${ruleId}: ${error}`);
    }
  }

  /**
   * Clears all pending rules
   */
  async clearPendingRules(): Promise<number> {
    try {
      const files = await fs.readdir(this.config.pendingDir);
      for (const file of files) {
        await fs.unlink(path.join(this.config.pendingDir, file));
      }
      return files.length;
    } catch {
      return 0;
    }
  }

  /**
   * Reads the learning history
   */
  async readHistory(): Promise<LearningHistory> {
    try {
      const content = await fs.readFile(this.config.historyPath, 'utf-8');
      return JSON.parse(content) as LearningHistory;
    } catch {
      return {
        iterations: [],
        totalRulesGenerated: 0,
        totalRulesApproved: 0,
        totalRulesRejected: 0,
        lastRunAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Writes the learning history
   */
  async writeHistory(history: LearningHistory): Promise<void> {
    await this.ensureDirectories();
    await fs.writeFile(
      this.config.historyPath,
      JSON.stringify(history, null, 2),
      'utf-8'
    );
  }

  /**
   * Adds a learning iteration to the history
   */
  async addIterationToHistory(
    iteration: LearningIterationResult
  ): Promise<void> {
    const history = await this.readHistory();

    history.iterations.push(iteration);
    history.totalRulesGenerated += iteration.rulesProposed.length;
    history.totalRulesApproved += iteration.rulesApproved.length;
    history.totalRulesRejected += iteration.rulesRejected.length;
    history.lastRunAt = iteration.timestamp;

    await this.writeHistory(history);
  }

  /**
   * Gets statistics about stored rules
   */
  async getStats(): Promise<{
    totalRules: number;
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    iterationsCount: number;
  }> {
    const rules = await this.readLearnedRules();
    const pending = await this.loadPendingRules();
    const history = await this.readHistory();

    let approvedCount = 0;
    let rejectedCount = 0;

    try {
      approvedCount = (await fs.readdir(this.config.approvedDir)).length;
    } catch {
      // Directory doesn't exist
    }

    try {
      rejectedCount = (await fs.readdir(this.config.rejectedDir)).length;
    } catch {
      // Directory doesn't exist
    }

    return {
      totalRules: rules.rules.length,
      pendingCount: pending.length,
      approvedCount,
      rejectedCount,
      iterationsCount: history.iterations.length,
    };
  }
}

export default RuleWriter;
