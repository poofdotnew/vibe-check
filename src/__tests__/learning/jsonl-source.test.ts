import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { JsonlDataSource } from '../../learning/data-sources/jsonl-source.js';

function createJsonlMessage(overrides: Partial<{
  uuid: string;
  parentUuid: string | null;
  type: 'user' | 'assistant';
  sessionId: string;
  agentId: string;
  timestamp: string;
  content: string | object[];
  toolUseResult: string;
}> = {}): string {
  const msg = {
    uuid: overrides.uuid || `uuid-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    parentUuid: overrides.parentUuid ?? null,
    type: overrides.type || 'user',
    sessionId: overrides.sessionId || 'session-1',
    agentId: overrides.agentId,
    timestamp: overrides.timestamp || new Date().toISOString(),
    message: {
      role: overrides.type || 'user',
      content: overrides.content || 'Test message',
    },
    toolUseResult: overrides.toolUseResult,
  };

  return JSON.stringify(msg);
}

describe('JsonlDataSource', () => {
  let testDir: string;
  let source: JsonlDataSource;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `jsonl-source-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    source = new JsonlDataSource(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('isAvailable', () => {
    test('returns false when no project folders exist', async () => {
      const available = await source.isAvailable();
      expect(available).toBe(false);
    });

    test('returns true when project folder exists', async () => {
      await fs.mkdir(path.join(testDir, 'project-test'), { recursive: true });
      await fs.writeFile(
        path.join(testDir, 'project-test', 'test.jsonl'),
        createJsonlMessage()
      );

      const available = await source.isAvailable();
      expect(available).toBe(true);
    });

    test('returns false for non-existent directory', async () => {
      const nonExistentSource = new JsonlDataSource('/non/existent/path');
      const available = await nonExistentSource.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('collect', () => {
    test('returns empty array when no project folders', async () => {
      const failures = await source.collect();
      expect(failures).toEqual([]);
    });

    test('returns empty array when no jsonl files', async () => {
      await fs.mkdir(path.join(testDir, 'project-empty'), { recursive: true });

      const failures = await source.collect();
      expect(failures).toEqual([]);
    });

    test('returns empty array when no errors in sessions', async () => {
      const projectDir = path.join(testDir, 'project-test');
      await fs.mkdir(projectDir, { recursive: true });

      const messages = [
        createJsonlMessage({ type: 'user', content: 'Hello' }),
        createJsonlMessage({ type: 'assistant', content: 'Hi there!' }),
      ];

      await fs.writeFile(
        path.join(projectDir, 'test.jsonl'),
        messages.join('\n')
      );

      const failures = await source.collect();
      expect(failures).toEqual([]);
    });

    test('collects failures with errors in toolUseResult', async () => {
      const projectDir = path.join(testDir, 'project-test');
      await fs.mkdir(projectDir, { recursive: true });

      const messages = [
        createJsonlMessage({ type: 'user', content: 'Do something' }),
        createJsonlMessage({
          type: 'assistant',
          content: 'Working on it',
          toolUseResult: 'Error: Something went wrong',
        }),
      ];

      await fs.writeFile(
        path.join(projectDir, 'test.jsonl'),
        messages.join('\n')
      );

      const failures = await source.collect();
      expect(failures.length).toBe(1);
      expect(failures[0].source).toBe('production');
      expect(failures[0].error).toContain('Error');
    });

    test('collects failures with tool_result is_error', async () => {
      const projectDir = path.join(testDir, 'project-test');
      await fs.mkdir(projectDir, { recursive: true });

      const messages = [
        createJsonlMessage({ type: 'user', content: 'Read a file' }),
        createJsonlMessage({
          type: 'assistant',
          content: [
            { type: 'tool_use', id: 'tool-1', name: 'Read', input: { path: '/file.ts' } },
          ],
        }),
        createJsonlMessage({
          type: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tool-1', is_error: true, content: 'File not found' },
          ],
        }),
      ];

      await fs.writeFile(
        path.join(projectDir, 'test.jsonl'),
        messages.join('\n')
      );

      const failures = await source.collect();
      expect(failures.length).toBe(1);
    });

    test('applies limit option', async () => {
      const projectDir = path.join(testDir, 'project-test');
      await fs.mkdir(projectDir, { recursive: true });

      const messages = [
        createJsonlMessage({ sessionId: 'session-1', type: 'user', content: 'Task 1' }),
        createJsonlMessage({ sessionId: 'session-1', type: 'assistant', toolUseResult: 'Error 1' }),
        createJsonlMessage({ sessionId: 'session-2', type: 'user', content: 'Task 2' }),
        createJsonlMessage({ sessionId: 'session-2', type: 'assistant', toolUseResult: 'Error 2' }),
        createJsonlMessage({ sessionId: 'session-3', type: 'user', content: 'Task 3' }),
        createJsonlMessage({ sessionId: 'session-3', type: 'assistant', toolUseResult: 'Error 3' }),
      ];

      await fs.writeFile(
        path.join(projectDir, 'test.jsonl'),
        messages.join('\n')
      );

      const failures = await source.collect({ limit: 2 });
      expect(failures.length).toBe(2);
    });

    test('searches nested directories for jsonl files', async () => {
      const nestedDir = path.join(testDir, 'project-test', 'subdir', '.claude');
      await fs.mkdir(nestedDir, { recursive: true });

      const messages = [
        createJsonlMessage({ type: 'user', content: 'Test' }),
        createJsonlMessage({ type: 'assistant', toolUseResult: 'Error: nested error' }),
      ];

      await fs.writeFile(
        path.join(nestedDir, 'session.jsonl'),
        messages.join('\n')
      );

      const failures = await source.collect();
      expect(failures.length).toBe(1);
    });

    test('extracts prompt from first user message', async () => {
      const projectDir = path.join(testDir, 'project-test');
      await fs.mkdir(projectDir, { recursive: true });

      const messages = [
        createJsonlMessage({ type: 'user', content: 'This is my prompt' }),
        createJsonlMessage({ type: 'assistant', toolUseResult: 'Error occurred' }),
      ];

      await fs.writeFile(
        path.join(projectDir, 'test.jsonl'),
        messages.join('\n')
      );

      const failures = await source.collect();
      expect(failures[0].prompt).toBe('This is my prompt');
    });

    test('extracts output from last assistant message', async () => {
      const projectDir = path.join(testDir, 'project-test');
      await fs.mkdir(projectDir, { recursive: true });

      const messages = [
        createJsonlMessage({ type: 'user', content: 'Do task' }),
        createJsonlMessage({ type: 'assistant', content: 'First response' }),
        createJsonlMessage({ type: 'assistant', content: 'Final response', toolUseResult: 'Error' }),
      ];

      await fs.writeFile(
        path.join(projectDir, 'test.jsonl'),
        messages.join('\n')
      );

      const failures = await source.collect();
      expect(failures[0].output).toBe('Final response');
    });

    test('skips malformed jsonl lines', async () => {
      const projectDir = path.join(testDir, 'project-test');
      await fs.mkdir(projectDir, { recursive: true });

      const content = [
        'not valid json',
        createJsonlMessage({ type: 'user', content: 'Valid message' }),
        '{ incomplete json',
        createJsonlMessage({ type: 'assistant', toolUseResult: 'Error' }),
      ].join('\n');

      await fs.writeFile(path.join(projectDir, 'test.jsonl'), content);

      const failures = await source.collect();
      expect(failures.length).toBe(1);
    });

    test('includes metadata in failure input', async () => {
      const projectDir = path.join(testDir, 'project-test');
      await fs.mkdir(projectDir, { recursive: true });

      const messages = [
        createJsonlMessage({
          sessionId: 'test-session',
          agentId: 'test-agent',
          type: 'user',
          content: 'Test',
        }),
        createJsonlMessage({
          sessionId: 'test-session',
          agentId: 'test-agent',
          type: 'assistant',
          toolUseResult: 'Error',
        }),
      ];

      await fs.writeFile(
        path.join(projectDir, 'test.jsonl'),
        messages.join('\n')
      );

      const failures = await source.collect();
      expect(failures[0].metadata?.sessionId).toBe('test-session');
      expect(failures[0].metadata?.agentId).toBe('test-agent');
      expect(failures[0].metadata?.errorCount).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    test('returns zero stats when no data', async () => {
      const stats = await source.getStats();

      expect(stats.projectCount).toBe(0);
      expect(stats.jsonlFileCount).toBe(0);
      expect(stats.sessionCount).toBe(0);
      expect(stats.errorSessionCount).toBe(0);
    });

    test('returns correct stats', async () => {
      const projectDir = path.join(testDir, 'project-test');
      await fs.mkdir(projectDir, { recursive: true });

      const messages = [
        createJsonlMessage({ sessionId: 's1', type: 'user', content: 'Test 1' }),
        createJsonlMessage({ sessionId: 's1', type: 'assistant', content: 'Response 1' }),
        createJsonlMessage({ sessionId: 's2', type: 'user', content: 'Test 2' }),
        createJsonlMessage({ sessionId: 's2', type: 'assistant', toolUseResult: 'Error' }),
      ];

      await fs.writeFile(
        path.join(projectDir, 'test.jsonl'),
        messages.join('\n')
      );

      const stats = await source.getStats();

      expect(stats.projectCount).toBe(1);
      expect(stats.jsonlFileCount).toBe(1);
      expect(stats.sessionCount).toBe(2);
      expect(stats.errorSessionCount).toBe(1);
    });
  });
});
