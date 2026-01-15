import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { RuleWriter } from '../../learning/rule-writer.js';
import type { ProposedRule, LearningIterationResult } from '../../learning/types.js';

function createProposedRule(overrides: Partial<ProposedRule> = {}): ProposedRule {
  return {
    ruleId: overrides.ruleId || `rule-${Date.now()}`,
    ruleContent: overrides.ruleContent || 'Test rule content',
    targetSection: overrides.targetSection || 'CORE_INSTRUCTIONS',
    rationale: overrides.rationale || 'Test rationale',
    addressesPatterns: overrides.addressesPatterns || ['pattern-1'],
    expectedImpact: overrides.expectedImpact || {
      failureIds: ['failure-1'],
      confidenceScore: 0.8,
    },
    status: overrides.status || 'pending',
    generatedAt: overrides.generatedAt || new Date().toISOString(),
    model: overrides.model || 'claude-sonnet-4-20250514',
    source: overrides.source || 'test-iteration',
    ...overrides,
  };
}

describe('RuleWriter', () => {
  let testDir: string;
  let writer: RuleWriter;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `rule-writer-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    writer = new RuleWriter({
      rulesDir: testDir,
      pendingDir: path.join(testDir, 'pending'),
      approvedDir: path.join(testDir, 'approved'),
      rejectedDir: path.join(testDir, 'rejected'),
      learnedRulesPath: path.join(testDir, 'learned-rules.json'),
      historyPath: path.join(testDir, 'history.json'),
    });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('ensureDirectories', () => {
    test('creates all required directories', async () => {
      await writer.ensureDirectories();

      const rulesExists = await fs.access(testDir).then(() => true).catch(() => false);
      const pendingExists = await fs.access(path.join(testDir, 'pending')).then(() => true).catch(() => false);
      const approvedExists = await fs.access(path.join(testDir, 'approved')).then(() => true).catch(() => false);
      const rejectedExists = await fs.access(path.join(testDir, 'rejected')).then(() => true).catch(() => false);

      expect(rulesExists).toBe(true);
      expect(pendingExists).toBe(true);
      expect(approvedExists).toBe(true);
      expect(rejectedExists).toBe(true);
    });
  });

  describe('readLearnedRules', () => {
    test('returns empty structure when file does not exist', async () => {
      const rules = await writer.readLearnedRules();

      expect(rules.rules).toEqual([]);
      expect(rules.iterations).toEqual([]);
      expect(rules.lastUpdated).toBeDefined();
    });

    test('reads existing rules file', async () => {
      const existing = {
        rules: [createProposedRule({ ruleId: 'existing-rule' })],
        lastUpdated: '2024-01-01T00:00:00Z',
        iterations: ['iter-1'],
      };
      await fs.writeFile(
        path.join(testDir, 'learned-rules.json'),
        JSON.stringify(existing)
      );

      const rules = await writer.readLearnedRules();

      expect(rules.rules.length).toBe(1);
      expect(rules.rules[0].ruleId).toBe('existing-rule');
      expect(rules.iterations).toContain('iter-1');
    });
  });

  describe('writeLearnedRules', () => {
    test('writes rules to file', async () => {
      const rules = {
        rules: [createProposedRule({ ruleId: 'new-rule' })],
        lastUpdated: new Date().toISOString(),
        iterations: ['iter-1'],
      };

      await writer.writeLearnedRules(rules);

      const content = await fs.readFile(
        path.join(testDir, 'learned-rules.json'),
        'utf-8'
      );
      const parsed = JSON.parse(content);

      expect(parsed.rules[0].ruleId).toBe('new-rule');
    });
  });

  describe('addApprovedRules', () => {
    test('adds new rules to empty file', async () => {
      const rule = createProposedRule({ ruleId: 'approved-rule' });

      await writer.addApprovedRules([rule], 'iter-1');

      const rules = await writer.readLearnedRules();
      expect(rules.rules.length).toBe(1);
      expect(rules.rules[0].ruleId).toBe('approved-rule');
      expect(rules.rules[0].status).toBe('approved');
      expect(rules.iterations).toContain('iter-1');
    });

    test('updates existing rule with same ID', async () => {
      const rule1 = createProposedRule({ ruleId: 'rule-1', ruleContent: 'Original content' });
      await writer.addApprovedRules([rule1], 'iter-1');

      const rule2 = createProposedRule({ ruleId: 'rule-1', ruleContent: 'Updated content' });
      await writer.addApprovedRules([rule2], 'iter-2');

      const rules = await writer.readLearnedRules();
      expect(rules.rules.length).toBe(1);
      expect(rules.rules[0].ruleContent).toBe('Updated content');
    });

    test('adds multiple rules', async () => {
      const rules = [
        createProposedRule({ ruleId: 'rule-1' }),
        createProposedRule({ ruleId: 'rule-2' }),
        createProposedRule({ ruleId: 'rule-3' }),
      ];

      await writer.addApprovedRules(rules, 'iter-1');

      const saved = await writer.readLearnedRules();
      expect(saved.rules.length).toBe(3);
    });
  });

  describe('savePendingRule', () => {
    test('saves rule to pending directory', async () => {
      const rule = createProposedRule({ ruleId: 'pending-rule' });

      const filepath = await writer.savePendingRule(rule);

      expect(filepath).toContain('pending');
      expect(filepath).toContain('pending-rule.json');

      const content = await fs.readFile(filepath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.ruleId).toBe('pending-rule');
    });
  });

  describe('savePendingRules', () => {
    test('saves multiple rules', async () => {
      const rules = [
        createProposedRule({ ruleId: 'rule-1' }),
        createProposedRule({ ruleId: 'rule-2' }),
      ];

      const paths = await writer.savePendingRules(rules);

      expect(paths.length).toBe(2);
      for (const p of paths) {
        const exists = await fs.access(p).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      }
    });
  });

  describe('loadPendingRules', () => {
    test('returns empty array when no pending rules', async () => {
      const rules = await writer.loadPendingRules();

      expect(rules).toEqual([]);
    });

    test('loads pending rules from directory', async () => {
      await writer.savePendingRule(createProposedRule({ ruleId: 'rule-1' }));
      await writer.savePendingRule(createProposedRule({ ruleId: 'rule-2' }));

      const rules = await writer.loadPendingRules();

      expect(rules.length).toBe(2);
      const ids = rules.map(r => r.ruleId).sort();
      expect(ids).toContain('rule-1');
      expect(ids).toContain('rule-2');
    });
  });

  describe('approvePendingRule', () => {
    test('moves rule from pending to approved', async () => {
      await writer.savePendingRule(createProposedRule({ ruleId: 'rule-to-approve' }));

      await writer.approvePendingRule('rule-to-approve');

      const pendingExists = await fs.access(
        path.join(testDir, 'pending', 'rule-to-approve.json')
      ).then(() => true).catch(() => false);
      expect(pendingExists).toBe(false);

      const approvedExists = await fs.access(
        path.join(testDir, 'approved', 'rule-to-approve.json')
      ).then(() => true).catch(() => false);
      expect(approvedExists).toBe(true);

      const learned = await writer.readLearnedRules();
      expect(learned.rules.some(r => r.ruleId === 'rule-to-approve')).toBe(true);
    });

    test('throws error for non-existent rule', async () => {
      await expect(writer.approvePendingRule('non-existent')).rejects.toThrow();
    });
  });

  describe('rejectPendingRule', () => {
    test('moves rule from pending to rejected with reason', async () => {
      await writer.savePendingRule(createProposedRule({ ruleId: 'rule-to-reject' }));

      await writer.rejectPendingRule('rule-to-reject', 'Not applicable');

      const pendingExists = await fs.access(
        path.join(testDir, 'pending', 'rule-to-reject.json')
      ).then(() => true).catch(() => false);
      expect(pendingExists).toBe(false);

      const rejectedPath = path.join(testDir, 'rejected', 'rule-to-reject.json');
      const content = await fs.readFile(rejectedPath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.status).toBe('rejected');
      expect(parsed.reviewNotes).toBe('Not applicable');
    });
  });

  describe('clearPendingRules', () => {
    test('removes all pending rules', async () => {
      await writer.savePendingRule(createProposedRule({ ruleId: 'rule-1' }));
      await writer.savePendingRule(createProposedRule({ ruleId: 'rule-2' }));
      await writer.savePendingRule(createProposedRule({ ruleId: 'rule-3' }));

      const count = await writer.clearPendingRules();

      expect(count).toBe(3);

      const remaining = await writer.loadPendingRules();
      expect(remaining.length).toBe(0);
    });

    test('returns 0 when no pending rules', async () => {
      const count = await writer.clearPendingRules();

      expect(count).toBe(0);
    });
  });

  describe('readHistory', () => {
    test('returns empty history when file does not exist', async () => {
      const history = await writer.readHistory();

      expect(history.iterations).toEqual([]);
      expect(history.totalRulesGenerated).toBe(0);
      expect(history.totalRulesApproved).toBe(0);
      expect(history.totalRulesRejected).toBe(0);
    });

    test('reads existing history', async () => {
      const existing = {
        iterations: [],
        totalRulesGenerated: 10,
        totalRulesApproved: 5,
        totalRulesRejected: 2,
        lastRunAt: '2024-01-01T00:00:00Z',
      };
      await fs.mkdir(path.dirname(path.join(testDir, 'history.json')), { recursive: true });
      await fs.writeFile(
        path.join(testDir, 'history.json'),
        JSON.stringify(existing)
      );

      const history = await writer.readHistory();

      expect(history.totalRulesGenerated).toBe(10);
      expect(history.totalRulesApproved).toBe(5);
    });
  });

  describe('addIterationToHistory', () => {
    test('adds iteration to history', async () => {
      const iteration: LearningIterationResult = {
        iterationId: 'iter-1',
        timestamp: new Date().toISOString(),
        sources: ['eval'],
        failuresCollected: 10,
        explanationsGenerated: 8,
        patternsDetected: [],
        rulesProposed: [createProposedRule()],
        rulesApproved: [],
        rulesRejected: [],
        durationMs: 5000,
      };

      await writer.addIterationToHistory(iteration);

      const history = await writer.readHistory();
      expect(history.iterations.length).toBe(1);
      expect(history.iterations[0].iterationId).toBe('iter-1');
      expect(history.totalRulesGenerated).toBe(1);
    });

    test('accumulates stats across iterations', async () => {
      const iter1: LearningIterationResult = {
        iterationId: 'iter-1',
        timestamp: new Date().toISOString(),
        sources: ['eval'],
        failuresCollected: 5,
        explanationsGenerated: 5,
        patternsDetected: [],
        rulesProposed: [createProposedRule(), createProposedRule()],
        rulesApproved: [createProposedRule()],
        rulesRejected: [],
        durationMs: 1000,
      };

      const iter2: LearningIterationResult = {
        iterationId: 'iter-2',
        timestamp: new Date().toISOString(),
        sources: ['eval'],
        failuresCollected: 3,
        explanationsGenerated: 3,
        patternsDetected: [],
        rulesProposed: [createProposedRule()],
        rulesApproved: [],
        rulesRejected: [createProposedRule()],
        durationMs: 1000,
      };

      await writer.addIterationToHistory(iter1);
      await writer.addIterationToHistory(iter2);

      const history = await writer.readHistory();
      expect(history.iterations.length).toBe(2);
      expect(history.totalRulesGenerated).toBe(3);
      expect(history.totalRulesApproved).toBe(1);
      expect(history.totalRulesRejected).toBe(1);
    });
  });

  describe('getStats', () => {
    test('returns stats for rules and history', async () => {
      await writer.addApprovedRules([
        createProposedRule({ ruleId: 'rule-1' }),
        createProposedRule({ ruleId: 'rule-2' }),
      ], 'iter-1');

      await writer.savePendingRule(createProposedRule({ ruleId: 'pending-1' }));

      const stats = await writer.getStats();

      expect(stats.totalRules).toBe(2);
      expect(stats.pendingCount).toBe(1);
    });
  });
});
