import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { EvalRunner } from '../../runner/eval-runner.js';
import { EvalDataSource } from '../../learning/data-sources/eval-source.js';
import { PatternDetector } from '../../learning/pattern-detector.js';
import {
  defaultConfig,
  type ResolvedConfig,
  type AgentResult,
  type ToolCall,
} from '../../config/types.js';
import { resetJudgeRegistry } from '../../judges/judge-registry.js';

function createResolvedConfig(config: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    ...defaultConfig,
    ...config,
    learning: { ...defaultConfig.learning, ...config.learning },
  } as ResolvedConfig;
}

function createFlawedAgent() {
  return async (prompt: string): Promise<AgentResult> => {
    const toolCalls: ToolCall[] = [];
    let output = '';

    if (prompt.toLowerCase().includes('write') || prompt.toLowerCase().includes('create')) {
      toolCalls.push({
        toolName: 'Read',
        input: { path: '/some/file.txt' },
        output: 'File not found',
        isError: true,
      });
      output = 'I tried to read the file but it does not exist.';
    } else if (prompt.toLowerCase().includes('delete') || prompt.toLowerCase().includes('remove')) {
      output = 'I understand you want to delete something, but I cannot perform that action.';
    } else if (prompt.toLowerCase().includes('api') || prompt.toLowerCase().includes('fetch')) {
      toolCalls.push({
        toolName: 'Bash',
        input: { command: 'curl https://example.com' },
        output: 'Command not allowed',
        isError: true,
      });
      output = 'I attempted to use curl but the command was blocked.';
    } else if (
      prompt.toLowerCase().includes('validate') ||
      prompt.toLowerCase().includes('check')
    ) {
      output = 'The input appears valid.';
    } else {
      output = `Processed request: ${prompt.substring(0, 50)}...`;
    }

    return { output, success: true, toolCalls };
  };
}

describe('Integration: Learning Example', () => {
  let testDir: string;
  let evalsDir: string;
  let resultsDir: string;

  beforeEach(async () => {
    resetJudgeRegistry();
    testDir = path.join(os.tmpdir(), `learning-example-test-${Date.now()}`);
    evalsDir = path.join(testDir, '__evals__');
    resultsDir = path.join(evalsDir, 'results');
    await fs.mkdir(resultsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function createEvalFiles() {
    const evals = [
      {
        id: 'file-write-001',
        name: 'Write a config file',
        description: 'Agent should use Write tool',
        category: 'tool',
        prompt: 'Write a new configuration file called config.json',
        expectedToolCalls: [{ toolName: 'Write', minCalls: 1 }],
        judges: ['tool-invocation'],
      },
      {
        id: 'file-write-002',
        name: 'Create a README',
        description: 'Agent should use Write tool',
        category: 'tool',
        prompt: 'Create a README.md file',
        expectedToolCalls: [{ toolName: 'Write', minCalls: 1 }],
        judges: ['tool-invocation'],
      },
      {
        id: 'file-delete-001',
        name: 'Delete temp files',
        description: 'Agent should use Bash tool',
        category: 'tool',
        prompt: 'Delete all .tmp files',
        expectedToolCalls: [{ toolName: 'Bash', minCalls: 1 }],
        judges: ['tool-invocation'],
      },
      {
        id: 'api-call-001',
        name: 'Fetch API data',
        description: 'Agent should use WebFetch tool',
        category: 'tool',
        prompt: 'Fetch the current weather from the API',
        expectedToolCalls: [{ toolName: 'WebFetch', minCalls: 1 }],
        judges: ['tool-invocation'],
      },
    ];

    for (const evalCase of evals) {
      await fs.writeFile(path.join(evalsDir, `${evalCase.id}.eval.json`), JSON.stringify(evalCase));
    }
  }

  describe('eval execution with flawed agent', () => {
    test('produces expected failures', async () => {
      await createEvalFiles();

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: createFlawedAgent(),
        maxRetries: 0,
        parallel: false,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      expect(result.total).toBe(4);
      expect(result.failed).toBe(4);
      expect(result.passed).toBe(0);

      const writeFailures = result.results.filter((r) => r.evalCase.id.startsWith('file-write'));
      expect(writeFailures.length).toBe(2);
      for (const failure of writeFailures) {
        expect(failure.toolCalls?.some((tc) => tc.toolName === 'Read')).toBe(true);
        expect(failure.toolCalls?.some((tc) => tc.toolName === 'Write')).toBe(false);
      }

      const deleteFailure = result.results.find((r) => r.evalCase.id === 'file-delete-001');
      expect(deleteFailure?.toolCalls?.length).toBe(0);

      const apiFailure = result.results.find((r) => r.evalCase.id === 'api-call-001');
      expect(apiFailure?.toolCalls?.some((tc) => tc.toolName === 'Bash')).toBe(true);
    });

    test('saves results that learning system can read', async () => {
      await createEvalFiles();

      const config = createResolvedConfig({
        testDir: evalsDir,
        outputDir: resultsDir,
        agent: createFlawedAgent(),
        maxRetries: 0,
        parallel: false,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      await fs.writeFile(path.join(resultsDir, 'latest.json'), JSON.stringify(result));

      const source = new EvalDataSource(resultsDir);
      expect(await source.isAvailable()).toBe(true);

      const failures = await source.collect();
      expect(failures.length).toBe(4);

      for (const failure of failures) {
        expect(failure.source).toBe('eval');
        expect(failure.prompt).toBeDefined();
        expect(failure.output).toBeDefined();
      }
    });
  });

  describe('learning system integration', () => {
    test('EvalDataSource collects failures correctly', async () => {
      await createEvalFiles();

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: createFlawedAgent(),
        maxRetries: 0,
        parallel: false,
      });

      const runner = new EvalRunner(config);
      const result = await runner.run();

      await fs.writeFile(path.join(resultsDir, 'latest.json'), JSON.stringify(result));

      const source = new EvalDataSource(resultsDir);
      const stats = await source.getStats();

      expect(stats.failuresInLatest).toBe(4);
      expect(stats.latestRun).not.toBeNull();
    });

    test('PatternDetector groups similar failures', async () => {
      const mockExplanations = [
        {
          id: 'exp-1',
          failureInput: {
            id: 'file-write-001',
            source: 'eval' as const,
            sourceId: '1',
            prompt: 'write',
            output: '',
            timestamp: '',
          },
          explanation: {
            whatWentWrong: 'Used Read instead of Write',
            whyItFailed: 'Wrong tool selection',
            rootCause: 'Missing write capability instruction',
            suggestedFix: 'Add instruction to use Write for file creation',
            patternCategory: 'tool-selection',
          },
          confidence: 0.9,
          generatedAt: new Date().toISOString(),
          model: 'test',
        },
        {
          id: 'exp-2',
          failureInput: {
            id: 'file-write-002',
            source: 'eval' as const,
            sourceId: '2',
            prompt: 'create',
            output: '',
            timestamp: '',
          },
          explanation: {
            whatWentWrong: 'Used Read instead of Write',
            whyItFailed: 'Wrong tool selection',
            rootCause: 'Missing write capability instruction',
            suggestedFix: 'Add instruction to use Write for file creation',
            patternCategory: 'tool-selection',
          },
          confidence: 0.85,
          generatedAt: new Date().toISOString(),
          model: 'test',
        },
        {
          id: 'exp-3',
          failureInput: {
            id: 'api-call-001',
            source: 'eval' as const,
            sourceId: '3',
            prompt: 'api',
            output: '',
            timestamp: '',
          },
          explanation: {
            whatWentWrong: 'Used Bash/curl instead of WebFetch',
            whyItFailed: 'Wrong tool for HTTP requests',
            rootCause: 'Missing HTTP tool instruction',
            suggestedFix: 'Add instruction to use WebFetch for API calls',
            patternCategory: 'tool-selection',
          },
          confidence: 0.8,
          generatedAt: new Date().toISOString(),
          model: 'test',
        },
      ];

      const detector = new PatternDetector({ minFailuresForPattern: 2, similarityThreshold: 0.6 });
      const patterns = detector.detectPatterns(mockExplanations);

      expect(patterns.length).toBeGreaterThanOrEqual(1);

      const toolSelectionPattern = patterns.find((p) => p.category === 'tool-selection');
      expect(toolSelectionPattern).toBeDefined();
      expect(toolSelectionPattern!.frequency).toBeGreaterThanOrEqual(2);
    });
  });

  describe('end-to-end learning flow', () => {
    test('full pipeline from eval to pattern detection', async () => {
      await createEvalFiles();

      const config = createResolvedConfig({
        testDir: evalsDir,
        agent: createFlawedAgent(),
        maxRetries: 0,
        parallel: false,
      });

      const runner = new EvalRunner(config);
      const evalResult = await runner.run();

      expect(evalResult.failed).toBe(4);

      await fs.writeFile(path.join(resultsDir, 'latest.json'), JSON.stringify(evalResult));

      const source = new EvalDataSource(resultsDir);
      const failures = await source.collect();

      expect(failures.length).toBe(4);

      const writeFailures = failures.filter(
        (f) => f.prompt.toLowerCase().includes('write') || f.prompt.toLowerCase().includes('create')
      );
      expect(writeFailures.length).toBe(2);

      for (const failure of writeFailures) {
        expect(failure.toolCalls?.some((tc) => tc.name === 'Read')).toBe(true);
      }
    });
  });
});
