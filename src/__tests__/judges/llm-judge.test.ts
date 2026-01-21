import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  LLMJudge,
  loadRubric,
  createLLMCodeQualityJudge,
  createLLMRoutingQualityJudge,
  createLLMResponseQualityJudge,
  createLLMConversationQualityJudge,
  parseLLMJudgeResponse,
  formatToolCallsSummary,
} from '../../judges/builtin/llm-judge.js';
import type { JudgeContext } from '../../judges/judge-interface.js';
import type { BasicEvalCase } from '../../config/schemas.js';

describe('LLMJudge', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-judge-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('loadRubric', () => {
    test('loads rubric from file', async () => {
      const rubricContent = `# Test Rubric

## Criteria
- Item 1
- Item 2

## Scoring
| Score | Description |
|-------|-------------|
| 100   | Perfect     |
| 0     | Bad         |
`;
      await fs.writeFile(path.join(tempDir, 'test.md'), rubricContent);

      const rubric = await loadRubric(path.join(tempDir, 'test.md'));

      expect(rubric.id).toBe('test');
      expect(rubric.content).toBe(rubricContent);
    });

    test('throws error for missing file', async () => {
      await expect(loadRubric(path.join(tempDir, 'nonexistent.md'))).rejects.toThrow();
    });
  });

  describe('LLMJudge constructor', () => {
    test('has correct metadata', () => {
      const judge = new LLMJudge('test-judge', 'test.md');

      expect(judge.id).toBe('test-judge');
      expect(judge.name).toBe('LLM Judge: test-judge');
      expect(judge.type).toBe('llm');
    });

    test('accepts custom rubricsDir', () => {
      const judge = new LLMJudge('test-judge', 'test.md', {
        rubricsDir: '/custom/rubrics',
      });

      expect(judge.id).toBe('test-judge');
    });
  });

  describe('factory functions', () => {
    test('createLLMCodeQualityJudge creates correct judge', () => {
      const judge = createLLMCodeQualityJudge();

      expect(judge.id).toBe('llm-code-quality');
      expect(judge.type).toBe('llm');
    });

    test('createLLMRoutingQualityJudge creates correct judge', () => {
      const judge = createLLMRoutingQualityJudge();

      expect(judge.id).toBe('llm-routing-quality');
      expect(judge.type).toBe('llm');
    });

    test('createLLMResponseQualityJudge creates correct judge', () => {
      const judge = createLLMResponseQualityJudge();

      expect(judge.id).toBe('llm-response-quality');
      expect(judge.type).toBe('llm');
    });

    test('createLLMConversationQualityJudge creates correct judge', () => {
      const judge = createLLMConversationQualityJudge();

      expect(judge.id).toBe('llm-conversation-quality');
      expect(judge.type).toBe('llm');
    });

    test('factory functions accept options', () => {
      const judge = createLLMCodeQualityJudge({
        rubricsDir: '/custom/path',
      });

      expect(judge.id).toBe('llm-code-quality');
    });
  });

  describe('evaluate', () => {
    test('returns error result when no API key', async () => {
      const originalKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      try {
        const rubricContent = '# Test\nScore based on quality.';
        const rubricPath = path.join(tempDir, 'test.md');
        await fs.writeFile(rubricPath, rubricContent);

        // Use absolute path directly to avoid path resolution issues
        const judge = new LLMJudge('test', rubricPath);

        const context: JudgeContext = {
          evalCase: {
            id: 'test',
            name: 'Test',
            description: 'd',
            category: 'basic',
            prompt: 'p',
            judges: [],
            enabled: true,
          } as BasicEvalCase,
          executionResult: {
            success: true,
            output: 'Test output',
            toolCalls: [],
            duration: 0,
          },
          workingDirectory: tempDir,
        };

        const result = await judge.evaluate(context);

        expect(result.passed).toBe(false);
        expect(result.reasoning).toContain('authentication');
      } finally {
        if (originalKey) {
          process.env.ANTHROPIC_API_KEY = originalKey;
        }
      }
    });

    test('returns error result when rubric not found', async () => {
      const judge = new LLMJudge('test', 'nonexistent.md', { rubricsDir: tempDir });

      const context: JudgeContext = {
        evalCase: {
          id: 'test',
          name: 'Test',
          description: 'd',
          category: 'basic',
          prompt: 'p',
          judges: [],
          enabled: true,
        } as BasicEvalCase,
        executionResult: {
          success: true,
          output: 'Test output',
          toolCalls: [],
          duration: 0,
        },
        workingDirectory: tempDir,
      };

      const result = await judge.evaluate(context);

      expect(result.passed).toBe(false);
      expect(result.reasoning).toContain('Failed');
    });
  });
});

describe('parseLLMJudgeResponse', () => {
  describe('JSON extraction', () => {
    test('extracts JSON from markdown code block', () => {
      const response = `Here is my evaluation:

\`\`\`json
{
  "score": 85,
  "passed": true,
  "confidence": 0.9,
  "reasoning": "The code is well-written"
}
\`\`\`

That's my assessment.`;

      const result = parseLLMJudgeResponse(response);

      expect(result.score).toBe(85);
      expect(result.passed).toBe(true);
      expect(result.confidence).toBe(0.9);
      expect(result.reasoning).toBe('The code is well-written');
    });

    test('parses raw JSON without code block', () => {
      const response = `{"score": 75, "passed": true, "confidence": 0.8, "reasoning": "Good work"}`;

      const result = parseLLMJudgeResponse(response);

      expect(result.score).toBe(75);
      expect(result.passed).toBe(true);
      expect(result.confidence).toBe(0.8);
      expect(result.reasoning).toBe('Good work');
    });

    test('extracts JSON with extra whitespace in code block', () => {
      const response = `\`\`\`json

  { "score": 90, "passed": true, "confidence": 0.95, "reasoning": "Excellent" }

\`\`\``;

      const result = parseLLMJudgeResponse(response);

      expect(result.score).toBe(90);
      expect(result.passed).toBe(true);
    });
  });

  describe('score boundary tests', () => {
    test('score of 70 passes (threshold)', () => {
      const response = `{"score": 70, "confidence": 0.8, "reasoning": "At threshold"}`;

      const result = parseLLMJudgeResponse(response);

      expect(result.score).toBe(70);
      expect(result.passed).toBe(true);
    });

    test('score of 69 fails (below threshold)', () => {
      const response = `{"score": 69, "confidence": 0.8, "reasoning": "Below threshold"}`;

      const result = parseLLMJudgeResponse(response);

      expect(result.score).toBe(69);
      expect(result.passed).toBe(false);
    });

    test('score of 71 passes (above threshold)', () => {
      const response = `{"score": 71, "confidence": 0.8, "reasoning": "Above threshold"}`;

      const result = parseLLMJudgeResponse(response);

      expect(result.score).toBe(71);
      expect(result.passed).toBe(true);
    });

    test('explicit passed=true overrides score-based threshold', () => {
      const response = `{"score": 50, "passed": true, "confidence": 0.8, "reasoning": "Manual override"}`;

      const result = parseLLMJudgeResponse(response);

      expect(result.score).toBe(50);
      expect(result.passed).toBe(true);
    });

    test('explicit passed=false overrides score-based threshold', () => {
      const response = `{"score": 90, "passed": false, "confidence": 0.8, "reasoning": "Manual override"}`;

      const result = parseLLMJudgeResponse(response);

      expect(result.score).toBe(90);
      expect(result.passed).toBe(false);
    });
  });

  describe('score clamping', () => {
    test('clamps score above 100 to 100', () => {
      const response = `{"score": 150, "passed": true, "confidence": 0.8, "reasoning": "Over max"}`;

      const result = parseLLMJudgeResponse(response);

      expect(result.score).toBe(100);
    });

    test('clamps negative score to 0', () => {
      const response = `{"score": -10, "passed": false, "confidence": 0.8, "reasoning": "Negative"}`;

      const result = parseLLMJudgeResponse(response);

      expect(result.score).toBe(0);
    });

    test('clamps confidence above 1 to 1', () => {
      const response = `{"score": 80, "passed": true, "confidence": 1.5, "reasoning": "High confidence"}`;

      const result = parseLLMJudgeResponse(response);

      expect(result.confidence).toBe(1);
    });

    test('clamps negative confidence to 0', () => {
      const response = `{"score": 80, "passed": true, "confidence": -0.5, "reasoning": "Negative confidence"}`;

      const result = parseLLMJudgeResponse(response);

      expect(result.confidence).toBe(0);
    });
  });

  describe('missing fields handling', () => {
    test('uses default confidence of 0.5 when missing', () => {
      const response = `{"score": 80, "passed": true, "reasoning": "No confidence"}`;

      const result = parseLLMJudgeResponse(response);

      expect(result.confidence).toBe(0.5);
    });

    test('uses default reasoning when missing', () => {
      const response = `{"score": 80, "passed": true, "confidence": 0.8}`;

      const result = parseLLMJudgeResponse(response);

      expect(result.reasoning).toBe('No reasoning provided');
    });

    test('uses default score of 0 when missing', () => {
      const response = `{"passed": false, "confidence": 0.8, "reasoning": "No score"}`;

      const result = parseLLMJudgeResponse(response);

      expect(result.score).toBe(0);
    });

    test('infers passed from score when passed field is missing', () => {
      const response = `{"score": 85, "confidence": 0.8, "reasoning": "No passed field"}`;

      const result = parseLLMJudgeResponse(response);

      expect(result.passed).toBe(true);
    });
  });

  describe('malformed JSON handling', () => {
    test('returns failure result for completely invalid JSON', () => {
      const response = `This is not JSON at all, just some text.`;

      const result = parseLLMJudgeResponse(response);

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('Failed to parse');
    });

    test('returns failure result for partial JSON', () => {
      const response = `{"score": 80, "passed":`;

      const result = parseLLMJudgeResponse(response);

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });

    test('returns failure result for JSON with syntax error', () => {
      const response = `{"score": 80, passed: true}`;

      const result = parseLLMJudgeResponse(response);

      expect(result.passed).toBe(false);
      expect(result.reasoning).toContain('Failed to parse');
    });

    test('truncates long invalid response in error message', () => {
      const longResponse = 'x'.repeat(500);

      const result = parseLLMJudgeResponse(longResponse);

      expect(result.reasoning.length).toBeLessThan(300);
      expect(result.reasoning).toContain('...');
    });
  });
});

describe('formatToolCallsSummary', () => {
  test('returns "None" for undefined toolCalls', () => {
    const result = formatToolCallsSummary(undefined);
    expect(result).toBe('None');
  });

  test('returns "None" for empty array', () => {
    const result = formatToolCallsSummary([]);
    expect(result).toBe('None');
  });

  test('lists tool names for small number of calls', () => {
    const toolCalls = [
      { toolName: 'read' },
      { toolName: 'write' },
      { toolName: 'execute' },
    ];

    const result = formatToolCallsSummary(toolCalls);

    expect(result).toBe('read, write, execute');
  });

  test('lists all tools for exactly 10 calls', () => {
    const toolCalls = Array(10).fill(null).map((_, i) => ({ toolName: `tool${i}` }));

    const result = formatToolCallsSummary(toolCalls);

    expect(result).toBe('tool0, tool1, tool2, tool3, tool4, tool5, tool6, tool7, tool8, tool9');
  });

  test('aggregates counts for more than 10 calls', () => {
    const toolCalls = [
      ...Array(5).fill({ toolName: 'read' }),
      ...Array(4).fill({ toolName: 'write' }),
      ...Array(3).fill({ toolName: 'execute' }),
    ];

    const result = formatToolCallsSummary(toolCalls);

    expect(result).toContain('read (x5)');
    expect(result).toContain('write (x4)');
    expect(result).toContain('execute (x3)');
  });

  test('shows count only when tool called multiple times', () => {
    const toolCalls = [
      ...Array(8).fill({ toolName: 'read' }),
      ...Array(3).fill({ toolName: 'write' }),
      { toolName: 'single' },
    ];

    const result = formatToolCallsSummary(toolCalls);

    expect(result).toContain('read (x8)');
    expect(result).toContain('write (x3)');
    expect(result).toContain('single');
    expect(result).not.toContain('single (x1)');
  });

  test('handles missing toolName by using "unknown"', () => {
    const toolCalls = [
      ...Array(11).fill({}),
    ];

    const result = formatToolCallsSummary(toolCalls);

    expect(result).toBe('unknown (x11)');
  });
});
