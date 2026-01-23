import * as fs from 'fs';
import * as path from 'path';

export interface CopilotToolCall {
  toolName: string;
  toolCallId?: string;
  args: unknown;
}

export interface CopilotToolResult {
  toolName: string;
  toolCallId?: string;
  args: unknown;
  result: unknown;
}

export interface CopilotEvent {
  type:
    | 'tool.execution_start'
    | 'tool.execution_end'
    | 'assistant.message'
    | 'session.idle'
    | 'handoff';
  data?: {
    toolName?: string;
    toolCallId?: string;
    args?: unknown;
    result?: unknown;
    content?: string;
  };
  timestamp: number;
  from_agent?: string;
  to_agent?: string;
}

export interface EventEntry {
  type: 'tool_start' | 'tool_end' | 'message' | 'handoff';
  timestamp: number;
  tool_name?: string;
  tool_call_id?: string;
  tool_input?: string;
  tool_output?: string;
  content?: string;
  from_agent?: string;
  to_agent?: string;
}

export class VibeCheckCopilotWriter {
  private eventsPath: string;
  private stream: fs.WriteStream | null = null;
  private pendingToolCalls: Map<string, { toolName: string; args: unknown }> = new Map();

  constructor(workspacePath: string) {
    this.eventsPath = path.join(workspacePath, '.copilot', 'events.jsonl');
  }

  private ensureDir(): void {
    const dir = path.dirname(this.eventsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!this.stream) {
      this.stream = fs.createWriteStream(this.eventsPath, { flags: 'a' });
    }
  }

  handleEvent(event: CopilotEvent): void {
    this.ensureDir();

    if (event.type === 'tool.execution_start' && event.data) {
      const toolCallId = event.data.toolCallId || `call_${Date.now()}`;
      this.pendingToolCalls.set(toolCallId, {
        toolName: event.data.toolName || 'unknown',
        args: event.data.args,
      });

      const entry: EventEntry = {
        type: 'tool_start',
        timestamp: event.timestamp || Date.now(),
        tool_name: event.data.toolName,
        tool_call_id: toolCallId,
        tool_input:
          typeof event.data.args === 'string' ? event.data.args : JSON.stringify(event.data.args),
      };
      this.stream?.write(JSON.stringify(entry) + '\n');
    } else if (event.type === 'tool.execution_end' && event.data) {
      const toolCallId = event.data.toolCallId || '';
      const pendingCall = this.pendingToolCalls.get(toolCallId);

      const entry: EventEntry = {
        type: 'tool_end',
        timestamp: event.timestamp || Date.now(),
        tool_name: event.data.toolName || pendingCall?.toolName,
        tool_call_id: toolCallId,
        tool_input: pendingCall
          ? typeof pendingCall.args === 'string'
            ? pendingCall.args
            : JSON.stringify(pendingCall.args)
          : undefined,
        tool_output:
          typeof event.data.result === 'string'
            ? event.data.result
            : JSON.stringify(event.data.result),
      };
      this.stream?.write(JSON.stringify(entry) + '\n');

      if (toolCallId) {
        this.pendingToolCalls.delete(toolCallId);
      }
    } else if (event.type === 'assistant.message' && event.data) {
      const entry: EventEntry = {
        type: 'message',
        timestamp: event.timestamp || Date.now(),
        content: event.data.content,
      };
      this.stream?.write(JSON.stringify(entry) + '\n');
    } else if (event.type === 'handoff') {
      const entry: EventEntry = {
        type: 'handoff',
        timestamp: event.timestamp || Date.now(),
        from_agent: event.from_agent,
        to_agent: event.to_agent,
      };
      this.stream?.write(JSON.stringify(entry) + '\n');
    }
  }

  writeToolCall(toolName: string, args: unknown, result?: unknown): void {
    this.ensureDir();
    const entry: EventEntry = {
      type: 'tool_end',
      timestamp: Date.now(),
      tool_name: toolName,
      tool_input: typeof args === 'string' ? args : JSON.stringify(args),
      tool_output:
        result !== undefined
          ? typeof result === 'string'
            ? result
            : JSON.stringify(result)
          : undefined,
    };
    this.stream?.write(JSON.stringify(entry) + '\n');
  }

  writeHandoff(fromAgent: string, toAgent: string): void {
    this.ensureDir();
    const entry: EventEntry = {
      type: 'handoff',
      timestamp: Date.now(),
      from_agent: fromAgent,
      to_agent: toAgent,
    };
    this.stream?.write(JSON.stringify(entry) + '\n');
  }

  createEventHandler(): (event: CopilotEvent) => void {
    return (event: CopilotEvent) => this.handleEvent(event);
  }

  async flush(): Promise<void> {
    return new Promise((resolve) => {
      if (this.stream) {
        this.stream.end(() => resolve());
        this.stream = null;
      } else {
        resolve();
      }
    });
  }
}
