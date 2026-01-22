import * as fs from 'fs';
import * as path from 'path';
import type {
  TracingProcessor,
  Trace,
  Span,
  SpanData,
  FunctionSpanData,
  HandoffSpanData,
  AgentSpanData,
} from '@openai/agents';

export interface TraceEntry {
  type: 'trace_start' | 'trace_end' | 'span';
  trace_id: string;
  timestamp: number;
  span_type?: string;
  span_id?: string;
  tool_name?: string;
  tool_input?: string;
  tool_output?: string;
  from_agent?: string;
  to_agent?: string;
  agent_name?: string;
}

export class VibeCheckTracingProcessor implements TracingProcessor {
  private tracesPath: string;
  private stream: fs.WriteStream | null = null;

  constructor(workspacePath: string) {
    this.tracesPath = path.join(workspacePath, '.openai-agents', 'traces.jsonl');
  }

  private ensureDir(): void {
    const dir = path.dirname(this.tracesPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!this.stream) {
      this.stream = fs.createWriteStream(this.tracesPath, { flags: 'a' });
    }
  }

  async onTraceStart(trace: Trace): Promise<void> {
    this.ensureDir();
    const entry: TraceEntry = {
      type: 'trace_start',
      trace_id: trace.traceId,
      timestamp: Date.now(),
    };
    this.stream?.write(JSON.stringify(entry) + '\n');
  }

  async onTraceEnd(trace: Trace): Promise<void> {
    this.ensureDir();
    const entry: TraceEntry = {
      type: 'trace_end',
      trace_id: trace.traceId,
      timestamp: Date.now(),
    };
    this.stream?.write(JSON.stringify(entry) + '\n');
  }

  async onSpanStart(_span: Span<SpanData>): Promise<void> {
    // Not needed for vibe-check
  }

  async onSpanEnd(span: Span<SpanData>): Promise<void> {
    this.ensureDir();

    const spanData = span.spanData;
    const entry: TraceEntry = {
      type: 'span',
      span_type: spanData?.type,
      span_id: span.spanId,
      trace_id: span.traceId,
      timestamp: Date.now(),
    };

    if (spanData?.type === 'function') {
      const funcData = spanData as FunctionSpanData;
      entry.tool_name = funcData.name;
      entry.tool_input = funcData.input;
      entry.tool_output = funcData.output;
    }

    if (spanData?.type === 'handoff') {
      const handoffData = spanData as HandoffSpanData;
      entry.from_agent = handoffData.from_agent;
      entry.to_agent = handoffData.to_agent;
    }

    if (spanData?.type === 'agent') {
      const agentData = spanData as AgentSpanData;
      entry.agent_name = agentData.name;
    }

    this.stream?.write(JSON.stringify(entry) + '\n');
  }

  async forceFlush(): Promise<void> {
    return new Promise((resolve) => {
      if (this.stream) {
        this.stream.end(() => resolve());
        this.stream = null;
      } else {
        resolve();
      }
    });
  }

  async shutdown(_timeout?: number): Promise<void> {
    await this.forceFlush();
  }
}
