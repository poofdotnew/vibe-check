import { describe, expect, test, beforeEach } from 'bun:test';
import {
  JudgeRegistry,
  getJudgeRegistry,
  resetJudgeRegistry,
} from '../judges/judge-registry.js';
import { BaseJudge, type JudgeContext, type JudgeResult, type JudgeType } from '../judges/judge-interface.js';

class TestJudge extends BaseJudge {
  id: string;
  name: string;
  type: JudgeType;

  constructor(id: string, name: string, type: JudgeType = 'code') {
    super();
    this.id = id;
    this.name = name;
    this.type = type;
  }

  async evaluate(_context: JudgeContext): Promise<JudgeResult> {
    return this.createResult({
      passed: true,
      score: 100,
      reasoning: 'Test passed',
    });
  }
}

describe('JudgeRegistry', () => {
  beforeEach(() => {
    resetJudgeRegistry();
  });

  describe('constructor', () => {
    test('registers built-in judges on creation', () => {
      const registry = new JudgeRegistry();

      expect(registry.has('file-existence')).toBe(true);
      expect(registry.has('tool-invocation')).toBe(true);
      expect(registry.has('pattern-match')).toBe(true);
    });
  });

  describe('register', () => {
    test('registers a new judge', () => {
      const registry = new JudgeRegistry();
      const judge = new TestJudge('custom-judge', 'Custom Judge');

      registry.register(judge);

      expect(registry.has('custom-judge')).toBe(true);
      expect(registry.get('custom-judge')).toBe(judge);
    });

    test('overwrites existing judge with same id', () => {
      const registry = new JudgeRegistry();
      const judge1 = new TestJudge('test-judge', 'Test Judge 1');
      const judge2 = new TestJudge('test-judge', 'Test Judge 2');

      registry.register(judge1);
      registry.register(judge2);

      expect(registry.get('test-judge')?.name).toBe('Test Judge 2');
    });
  });

  describe('unregister', () => {
    test('removes an existing judge', () => {
      const registry = new JudgeRegistry();
      const judge = new TestJudge('temp-judge', 'Temp Judge');
      registry.register(judge);

      const result = registry.unregister('temp-judge');

      expect(result).toBe(true);
      expect(registry.has('temp-judge')).toBe(false);
    });

    test('returns false for non-existent judge', () => {
      const registry = new JudgeRegistry();

      const result = registry.unregister('non-existent');

      expect(result).toBe(false);
    });

    test('can unregister built-in judges', () => {
      const registry = new JudgeRegistry();

      const result = registry.unregister('file-existence');

      expect(result).toBe(true);
      expect(registry.has('file-existence')).toBe(false);
    });
  });

  describe('get', () => {
    test('returns judge by id', () => {
      const registry = new JudgeRegistry();

      const judge = registry.get('file-existence');

      expect(judge).toBeDefined();
      expect(judge?.id).toBe('file-existence');
    });

    test('returns undefined for non-existent id', () => {
      const registry = new JudgeRegistry();

      const judge = registry.get('non-existent');

      expect(judge).toBeUndefined();
    });
  });

  describe('has', () => {
    test('returns true for existing judge', () => {
      const registry = new JudgeRegistry();

      expect(registry.has('file-existence')).toBe(true);
    });

    test('returns false for non-existent judge', () => {
      const registry = new JudgeRegistry();

      expect(registry.has('non-existent')).toBe(false);
    });
  });

  describe('list', () => {
    test('returns all registered judge ids', () => {
      const registry = new JudgeRegistry();

      const ids = registry.list();

      expect(ids).toContain('file-existence');
      expect(ids).toContain('tool-invocation');
      expect(ids).toContain('pattern-match');
    });

    test('includes custom judges', () => {
      const registry = new JudgeRegistry();
      registry.register(new TestJudge('custom', 'Custom'));

      const ids = registry.list();

      expect(ids).toContain('custom');
    });
  });

  describe('listByType', () => {
    test('filters judges by type', () => {
      const registry = new JudgeRegistry();
      registry.register(new TestJudge('code-1', 'Code 1', 'code'));
      registry.register(new TestJudge('llm-1', 'LLM 1', 'llm'));
      registry.register(new TestJudge('hybrid-1', 'Hybrid 1', 'hybrid'));

      const codeJudges = registry.listByType('code');
      const llmJudges = registry.listByType('llm');
      const hybridJudges = registry.listByType('hybrid');

      expect(codeJudges).toContain('code-1');
      expect(codeJudges).toContain('file-existence');
      expect(llmJudges).toContain('llm-1');
      expect(hybridJudges).toContain('hybrid-1');
    });

    test('returns empty array for type with no judges', () => {
      const registry = new JudgeRegistry();

      const llmJudges = registry.listByType('llm');

      expect(llmJudges).toEqual([]);
    });
  });

  describe('getAll', () => {
    test('returns all registered judges', () => {
      const registry = new JudgeRegistry();

      const judges = registry.getAll();

      expect(judges.length).toBeGreaterThanOrEqual(3);
      expect(judges.some(j => j.id === 'file-existence')).toBe(true);
      expect(judges.some(j => j.id === 'tool-invocation')).toBe(true);
      expect(judges.some(j => j.id === 'pattern-match')).toBe(true);
    });
  });
});

describe('getJudgeRegistry', () => {
  beforeEach(() => {
    resetJudgeRegistry();
  });

  test('returns singleton instance', () => {
    const registry1 = getJudgeRegistry();
    const registry2 = getJudgeRegistry();

    expect(registry1).toBe(registry2);
  });

  test('creates registry with built-in judges', () => {
    const registry = getJudgeRegistry();

    expect(registry.has('file-existence')).toBe(true);
    expect(registry.has('tool-invocation')).toBe(true);
    expect(registry.has('pattern-match')).toBe(true);
  });

  test('persists changes across calls', () => {
    const registry1 = getJudgeRegistry();
    registry1.register(new TestJudge('persistent', 'Persistent'));

    const registry2 = getJudgeRegistry();

    expect(registry2.has('persistent')).toBe(true);
  });
});

describe('resetJudgeRegistry', () => {
  test('resets singleton to null', () => {
    const registry1 = getJudgeRegistry();
    registry1.register(new TestJudge('temp', 'Temp'));

    resetJudgeRegistry();

    const registry2 = getJudgeRegistry();
    expect(registry2.has('temp')).toBe(false);
  });

  test('new registry has fresh built-in judges', () => {
    const registry1 = getJudgeRegistry();
    registry1.unregister('file-existence');

    resetJudgeRegistry();

    const registry2 = getJudgeRegistry();
    expect(registry2.has('file-existence')).toBe(true);
  });
});
