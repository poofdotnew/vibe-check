/**
 * Data source for extracting failures from production JSONL logs.
 * Scans prompt-runs/project-* folders for .claude session logs.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import readline from 'readline';
import type { DataSource, FailureInput, CollectOptions, ToolCall } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Structure of a JSONL message entry
 */
interface JsonlMessage {
  uuid: string;
  parentUuid: string | null;
  type: 'user' | 'assistant';
  sessionId: string;
  agentId?: string;
  timestamp: string;
  cwd?: string;
  message: {
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
    model?: string;
    id?: string;
    stop_reason?: string | null;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
  toolUseResult?: string;
  isSidechain?: boolean;
}

interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string;
  is_error?: boolean;
  tool_use_id?: string;
}

/**
 * A session with all its messages
 */
interface Session {
  sessionId: string;
  agentId?: string;
  messages: JsonlMessage[];
  firstMessage: JsonlMessage;
  lastMessage: JsonlMessage;
  hasErrors: boolean;
  errors: SessionError[];
}

interface SessionError {
  messageUuid: string;
  toolName?: string;
  errorMessage: string;
  timestamp: string;
  parentUuid?: string;
}

export class JsonlDataSource implements DataSource {
  name = 'jsonl';
  private promptRunsDir: string;

  constructor(promptRunsDir?: string) {
    // Default to cdk/dev-server-manager/prompt-runs relative to project root
    this.promptRunsDir =
      promptRunsDir ||
      path.join(__dirname, '..', '..', '..', 'cdk', 'dev-server-manager', 'prompt-runs');
  }

  async isAvailable(): Promise<boolean> {
    try {
      await fs.access(this.promptRunsDir);
      const projects = await this.findProjectFolders();
      return projects.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Finds all project-* folders in prompt-runs
   */
  private async findProjectFolders(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.promptRunsDir, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory() && e.name.startsWith('project-'))
        .map((e) => path.join(this.promptRunsDir, e.name));
    } catch {
      return [];
    }
  }

  /**
   * Finds all .jsonl files in a project's .claude folders
   */
  private async findJsonlFiles(projectDir: string): Promise<string[]> {
    const jsonlFiles: string[] = [];

    const searchDir = async (dir: string) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await searchDir(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
            jsonlFiles.push(fullPath);
          }
        }
      } catch {
        // Ignore permission errors
      }
    };

    await searchDir(projectDir);
    return jsonlFiles;
  }

  /**
   * Parses a JSONL file into messages
   */
  private async parseJsonlFile(filePath: string): Promise<JsonlMessage[]> {
    const messages: JsonlMessage[] = [];

    const fileStream = createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const parsed = JSON.parse(line) as JsonlMessage;
          messages.push(parsed);
        } catch {
          // Skip malformed lines
        }
      }
    }

    return messages;
  }

  /**
   * Groups messages into sessions
   */
  private groupIntoSessions(messages: JsonlMessage[]): Session[] {
    const sessionMap = new Map<string, JsonlMessage[]>();

    for (const msg of messages) {
      const key = msg.agentId || msg.sessionId;
      if (!sessionMap.has(key)) {
        sessionMap.set(key, []);
      }
      sessionMap.get(key)!.push(msg);
    }

    const sessions: Session[] = [];

    for (const [_key, msgs] of sessionMap) {
      // Sort by timestamp
      msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Find errors
      const errors: SessionError[] = [];
      for (const msg of msgs) {
        const msgErrors = this.extractErrors(msg);
        errors.push(...msgErrors);
      }

      if (msgs.length > 0) {
        sessions.push({
          sessionId: msgs[0].sessionId,
          agentId: msgs[0].agentId,
          messages: msgs,
          firstMessage: msgs[0],
          lastMessage: msgs[msgs.length - 1],
          hasErrors: errors.length > 0,
          errors,
        });
      }
    }

    return sessions;
  }

  /**
   * Extracts errors from a message
   */
  private extractErrors(msg: JsonlMessage): SessionError[] {
    const errors: SessionError[] = [];

    // Check toolUseResult for errors
    if (msg.toolUseResult) {
      const resultStr =
        typeof msg.toolUseResult === 'string'
          ? msg.toolUseResult
          : JSON.stringify(msg.toolUseResult);
      if (resultStr.toLowerCase().includes('error')) {
        errors.push({
          messageUuid: msg.uuid,
          errorMessage: resultStr,
          timestamp: msg.timestamp,
          parentUuid: msg.parentUuid || undefined,
        });
      }
    }

    // Check content for tool_result with is_error
    if (Array.isArray(msg.message?.content)) {
      for (const block of msg.message.content) {
        if (block.type === 'tool_result' && block.is_error) {
          errors.push({
            messageUuid: msg.uuid,
            toolName: this.findToolNameForResult(msg, block.tool_use_id),
            errorMessage:
              typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
            timestamp: msg.timestamp,
            parentUuid: msg.parentUuid || undefined,
          });
        }
      }
    }

    return errors;
  }

  /**
   * Finds the tool name for a tool_use_id by looking at parent messages
   */
  private findToolNameForResult(msg: JsonlMessage, toolUseId?: string): string | undefined {
    if (!toolUseId) return undefined;

    // Look in the message content for matching tool_use
    if (Array.isArray(msg.message?.content)) {
      for (const block of msg.message.content) {
        if (block.type === 'tool_use' && block.id === toolUseId) {
          return block.name;
        }
      }
    }

    return undefined;
  }

  /**
   * Extracts the initial prompt from a session
   */
  private extractPrompt(session: Session): string {
    const firstUserMsg = session.messages.find((m) => m.type === 'user');
    if (!firstUserMsg) return '';

    const content = firstUserMsg.message?.content;
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      const textBlock = content.find((b) => b.type === 'text');
      return textBlock?.text || '';
    }
    return '';
  }

  /**
   * Extracts all tool calls from a session
   */
  private extractToolCalls(session: Session): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    const toolUseMap = new Map<string, ContentBlock>();

    // First pass: collect tool_use blocks
    for (const msg of session.messages) {
      if (Array.isArray(msg.message?.content)) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_use' && block.id) {
            toolUseMap.set(block.id, block);
          }
        }
      }
    }

    // Second pass: match with tool_result
    for (const msg of session.messages) {
      if (Array.isArray(msg.message?.content)) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_result' && block.tool_use_id) {
            const toolUse = toolUseMap.get(block.tool_use_id);
            if (toolUse) {
              toolCalls.push({
                name: toolUse.name || 'unknown',
                input: toolUse.input,
                output:
                  typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
                error: block.is_error
                  ? typeof block.content === 'string'
                    ? block.content
                    : JSON.stringify(block.content)
                  : undefined,
                timestamp: msg.timestamp,
              });
            }
          }
        }
      }
    }

    return toolCalls;
  }

  /**
   * Extracts the final output from a session
   */
  private extractOutput(session: Session): string {
    // Find last assistant message with text content
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const msg = session.messages[i];
      if (msg.type === 'assistant') {
        const content = msg.message?.content;
        if (typeof content === 'string') {
          return content;
        }
        if (Array.isArray(content)) {
          const textBlock = content.find((b) => b.type === 'text');
          if (textBlock?.text) {
            return textBlock.text;
          }
        }
      }
    }
    return '';
  }

  /**
   * Converts a session with errors to a FailureInput
   */
  private sessionToFailureInput(session: Session, filePath: string): FailureInput {
    const prompt = this.extractPrompt(session);
    const output = this.extractOutput(session);
    const toolCalls = this.extractToolCalls(session);

    // Combine all errors into a single error message
    const errorMessage = session.errors
      .map((e) => (e.toolName ? `${e.toolName}: ${e.errorMessage}` : e.errorMessage))
      .join('\n');

    return {
      id: `jsonl-${session.agentId || session.sessionId}-${Date.now()}`,
      source: 'production',
      sourceId: filePath,
      prompt,
      output,
      toolCalls,
      error: errorMessage,
      timestamp: session.firstMessage.timestamp,
      metadata: {
        sessionId: session.sessionId,
        agentId: session.agentId,
        errorCount: session.errors.length,
        messageCount: session.messages.length,
        cwd: session.firstMessage.cwd,
        errors: session.errors,
      },
    };
  }

  /**
   * Collects failures from production JSONL logs
   */
  async collect(options?: CollectOptions): Promise<FailureInput[]> {
    const failures: FailureInput[] = [];
    const projectFolders = await this.findProjectFolders();

    if (projectFolders.length === 0) {
      console.warn(`No project-* folders found in ${this.promptRunsDir}`);
      return [];
    }

    for (const projectDir of projectFolders) {
      const jsonlFiles = await this.findJsonlFiles(projectDir);

      for (const filePath of jsonlFiles) {
        // Apply date filters
        if (options?.since || options?.until) {
          const stats = await fs.stat(filePath);
          if (options.since && stats.mtime < options.since) continue;
          if (options.until && stats.mtime > options.until) continue;
        }

        const messages = await this.parseJsonlFile(filePath);
        const sessions = this.groupIntoSessions(messages);

        for (const session of sessions) {
          if (session.hasErrors) {
            const failure = this.sessionToFailureInput(session, filePath);
            failures.push(failure);
          }
        }

        // Check limit
        if (options?.limit && failures.length >= options.limit) {
          return failures.slice(0, options.limit);
        }
      }
    }

    return failures;
  }

  /**
   * Gets statistics about available JSONL data
   */
  async getStats(): Promise<{
    projectCount: number;
    jsonlFileCount: number;
    sessionCount: number;
    errorSessionCount: number;
  }> {
    const projectFolders = await this.findProjectFolders();
    let jsonlFileCount = 0;
    let sessionCount = 0;
    let errorSessionCount = 0;

    for (const projectDir of projectFolders) {
      const jsonlFiles = await this.findJsonlFiles(projectDir);
      jsonlFileCount += jsonlFiles.length;

      for (const filePath of jsonlFiles) {
        const messages = await this.parseJsonlFile(filePath);
        const sessions = this.groupIntoSessions(messages);
        sessionCount += sessions.length;
        errorSessionCount += sessions.filter((s) => s.hasErrors).length;
      }
    }

    return {
      projectCount: projectFolders.length,
      jsonlFileCount,
      sessionCount,
      errorSessionCount,
    };
  }
}

export default JsonlDataSource;
