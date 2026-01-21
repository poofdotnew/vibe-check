import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { PythonAgentAdapter } from '../../adapters/python-adapter.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('PythonAgentAdapter', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'python-adapter-test-'));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    test('sets default pythonPath to python3', () => {
      const adapter = new PythonAgentAdapter({
        scriptPath: './agent.py',
      });
      expect(adapter).toBeDefined();
    });

    test('accepts custom pythonPath', () => {
      const adapter = new PythonAgentAdapter({
        scriptPath: './agent.py',
        pythonPath: '/usr/bin/python3.11',
      });
      expect(adapter).toBeDefined();
    });

    test('accepts custom env variables', () => {
      const adapter = new PythonAgentAdapter({
        scriptPath: './agent.py',
        env: { CUSTOM_VAR: 'value' },
      });
      expect(adapter).toBeDefined();
    });
  });

  describe('createAgent', () => {
    test('returns an async function', () => {
      const adapter = new PythonAgentAdapter({
        scriptPath: './agent.py',
      });
      const agent = adapter.createAgent();
      expect(typeof agent).toBe('function');
    });
  });

  describe('agent execution', () => {
    test('handles successful response', async () => {
      const scriptPath = path.join(tempDir, 'success-agent.py');
      await fs.writeFile(
        scriptPath,
        `#!/usr/bin/env python3
import sys
import json

request = json.loads(sys.stdin.read())
response = {
    "output": f"Processed: {request['prompt']}",
    "success": True
}
print(json.dumps(response))
`
      );

      const adapter = new PythonAgentAdapter({
        scriptPath,
        cwd: tempDir,
      });
      const agent = adapter.createAgent();

      const result = await agent('Hello world', {
        workingDirectory: tempDir,
        evalId: 'test-1',
        evalName: 'Test Eval',
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe('Processed: Hello world');
    });

    test('handles failed response', async () => {
      const scriptPath = path.join(tempDir, 'failed-agent.py');
      await fs.writeFile(
        scriptPath,
        `#!/usr/bin/env python3
import sys
import json

request = json.loads(sys.stdin.read())
response = {
    "output": "",
    "success": False,
    "error": "Something went wrong"
}
print(json.dumps(response))
`
      );

      const adapter = new PythonAgentAdapter({
        scriptPath,
        cwd: tempDir,
      });
      const agent = adapter.createAgent();

      const result = await agent('Hello world', {
        workingDirectory: tempDir,
        evalId: 'test-2',
        evalName: 'Test Eval',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Something went wrong');
    });

    test('handles response with tool calls', async () => {
      const scriptPath = path.join(tempDir, 'toolcalls-agent.py');
      await fs.writeFile(
        scriptPath,
        `#!/usr/bin/env python3
import sys
import json

request = json.loads(sys.stdin.read())
response = {
    "output": "Done",
    "success": True,
    "toolCalls": [
        {"toolName": "Read", "input": {"file": "test.txt"}, "output": "content"},
        {"toolName": "Write", "input": {"file": "out.txt", "content": "data"}}
    ]
}
print(json.dumps(response))
`
      );

      const adapter = new PythonAgentAdapter({
        scriptPath,
        cwd: tempDir,
      });
      const agent = adapter.createAgent();

      const result = await agent('Read and write', {
        workingDirectory: tempDir,
        evalId: 'test-3',
        evalName: 'Test Eval',
      });

      expect(result.success).toBe(true);
      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls?.[0].toolName).toBe('Read');
      expect(result.toolCalls?.[1].toolName).toBe('Write');
    });

    test('handles response with usage stats', async () => {
      const scriptPath = path.join(tempDir, 'usage-agent.py');
      await fs.writeFile(
        scriptPath,
        `#!/usr/bin/env python3
import sys
import json

request = json.loads(sys.stdin.read())
response = {
    "output": "Done",
    "success": True,
    "usage": {
        "inputTokens": 100,
        "outputTokens": 50,
        "totalCostUsd": 0.0015
    }
}
print(json.dumps(response))
`
      );

      const adapter = new PythonAgentAdapter({
        scriptPath,
        cwd: tempDir,
      });
      const agent = adapter.createAgent();

      const result = await agent('Test', {
        workingDirectory: tempDir,
        evalId: 'test-4',
        evalName: 'Test Eval',
      });

      expect(result.success).toBe(true);
      expect(result.usage?.inputTokens).toBe(100);
      expect(result.usage?.outputTokens).toBe(50);
      expect(result.usage?.totalCostUsd).toBe(0.0015);
    });

    test('handles Python script that exits with error', async () => {
      const scriptPath = path.join(tempDir, 'error-agent.py');
      await fs.writeFile(
        scriptPath,
        `#!/usr/bin/env python3
import sys
sys.exit(1)
`
      );

      const adapter = new PythonAgentAdapter({
        scriptPath,
        cwd: tempDir,
      });
      const agent = adapter.createAgent();

      const result = await agent('Test', {
        workingDirectory: tempDir,
        evalId: 'test-5',
        evalName: 'Test Eval',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('handles Python script that throws exception', async () => {
      const scriptPath = path.join(tempDir, 'exception-agent.py');
      await fs.writeFile(
        scriptPath,
        `#!/usr/bin/env python3
raise Exception("Test exception")
`
      );

      const adapter = new PythonAgentAdapter({
        scriptPath,
        cwd: tempDir,
      });
      const agent = adapter.createAgent();

      const result = await agent('Test', {
        workingDirectory: tempDir,
        evalId: 'test-6',
        evalName: 'Test Eval',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Test exception');
    });

    test('handles invalid JSON response', async () => {
      const scriptPath = path.join(tempDir, 'invalid-json-agent.py');
      await fs.writeFile(
        scriptPath,
        `#!/usr/bin/env python3
print("not valid json")
`
      );

      const adapter = new PythonAgentAdapter({
        scriptPath,
        cwd: tempDir,
      });
      const agent = adapter.createAgent();

      const result = await agent('Test', {
        workingDirectory: tempDir,
        evalId: 'test-7',
        evalName: 'Test Eval',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('handles script not found', async () => {
      const adapter = new PythonAgentAdapter({
        scriptPath: '/nonexistent/path/agent.py',
        cwd: tempDir,
      });
      const agent = adapter.createAgent();

      const result = await agent('Test', {
        workingDirectory: tempDir,
        evalId: 'test-8',
        evalName: 'Test Eval',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('passes context to Python script', async () => {
      const scriptPath = path.join(tempDir, 'context-agent.py');
      await fs.writeFile(
        scriptPath,
        `#!/usr/bin/env python3
import sys
import json

request = json.loads(sys.stdin.read())
context = request['context']
response = {
    "output": json.dumps({
        "workingDirectory": context['workingDirectory'],
        "evalId": context['evalId'],
        "evalName": context['evalName']
    }),
    "success": True
}
print(json.dumps(response))
`
      );

      const adapter = new PythonAgentAdapter({
        scriptPath,
        cwd: tempDir,
      });
      const agent = adapter.createAgent();

      const result = await agent('Test', {
        workingDirectory: '/test/workspace',
        evalId: 'eval-123',
        evalName: 'My Test Eval',
      });

      expect(result.success).toBe(true);
      const parsed = JSON.parse(result.output);
      expect(parsed.workingDirectory).toBe('/test/workspace');
      expect(parsed.evalId).toBe('eval-123');
      expect(parsed.evalName).toBe('My Test Eval');
    });

    test('handles multiline output before JSON', async () => {
      const scriptPath = path.join(tempDir, 'multiline-agent.py');
      await fs.writeFile(
        scriptPath,
        `#!/usr/bin/env python3
import sys
import json

# Some debug output that might appear
print("Debug: starting agent", file=sys.stderr)

request = json.loads(sys.stdin.read())
response = {
    "output": "Result",
    "success": True
}
# Only the last line should be JSON
print(json.dumps(response))
`
      );

      const adapter = new PythonAgentAdapter({
        scriptPath,
        cwd: tempDir,
      });
      const agent = adapter.createAgent();

      const result = await agent('Test', {
        workingDirectory: tempDir,
        evalId: 'test-9',
        evalName: 'Test Eval',
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe('Result');
    });

    test('respects timeout', async () => {
      const scriptPath = path.join(tempDir, 'slow-agent.py');
      await fs.writeFile(
        scriptPath,
        `#!/usr/bin/env python3
import sys
import json
import time

request = json.loads(sys.stdin.read())
time.sleep(5)  # Sleep longer than timeout
response = {"output": "Done", "success": True}
print(json.dumps(response))
`
      );

      const adapter = new PythonAgentAdapter({
        scriptPath,
        cwd: tempDir,
      });
      const agent = adapter.createAgent();

      const result = await agent('Test', {
        workingDirectory: tempDir,
        evalId: 'test-10',
        evalName: 'Test Eval',
        timeout: 1000, // 1 second timeout
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timed out');
    }, 10000);

    test('passes environment variables to script', async () => {
      const scriptPath = path.join(tempDir, 'env-agent.py');
      await fs.writeFile(
        scriptPath,
        `#!/usr/bin/env python3
import sys
import json
import os

request = json.loads(sys.stdin.read())
response = {
    "output": os.environ.get('TEST_VAR', 'not found'),
    "success": True
}
print(json.dumps(response))
`
      );

      const adapter = new PythonAgentAdapter({
        scriptPath,
        cwd: tempDir,
        env: { TEST_VAR: 'custom_value' },
      });
      const agent = adapter.createAgent();

      const result = await agent('Test', {
        workingDirectory: tempDir,
        evalId: 'test-11',
        evalName: 'Test Eval',
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe('custom_value');
    });
  });
});

describe('AgentRequest/AgentResponse types', () => {
  test('AgentRequest has correct structure', async () => {
    const scriptPath = path.join(os.tmpdir(), `request-echo-${Date.now()}.py`);
    await fs.writeFile(
      scriptPath,
      `#!/usr/bin/env python3
import sys
import json

request = json.loads(sys.stdin.read())
# Echo back the request structure
response = {
    "output": json.dumps(request),
    "success": True
}
print(json.dumps(response))
`
    );

    try {
      const adapter = new PythonAgentAdapter({
        scriptPath,
        cwd: os.tmpdir(),
      });
      const agent = adapter.createAgent();

      const result = await agent('Test prompt', {
        workingDirectory: '/test/dir',
        evalId: 'eval-id',
        evalName: 'eval-name',
        sessionId: 'session-123',
        timeout: 5000,
      });

      expect(result.success).toBe(true);
      const request = JSON.parse(result.output);

      expect(request.prompt).toBe('Test prompt');
      expect(request.context.workingDirectory).toBe('/test/dir');
      expect(request.context.evalId).toBe('eval-id');
      expect(request.context.evalName).toBe('eval-name');
      expect(request.context.sessionId).toBe('session-123');
      expect(request.context.timeout).toBe(5000);
    } finally {
      await fs.rm(scriptPath, { force: true });
    }
  });
});
