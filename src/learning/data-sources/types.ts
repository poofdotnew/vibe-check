/**
 * Common types for all data sources in the learning system.
 * All data sources output FailureInput[] which feeds into the learning pipeline.
 */

import type { JudgeResult, EvalCategory } from '../../config/schemas.js';

/**
 * Represents a tool call made by the agent
 */
export interface ToolCall {
  name: string;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  timestamp?: string;
}

/**
 * Common input format for all data sources.
 * This is the interface between data sources and the learning pipeline.
 */
export interface FailureInput {
  /** Unique identifier for this failure */
  id: string;

  /** Source type: eval results, production logs, or custom */
  source: 'eval' | 'production' | 'custom';

  /** Source-specific identifier (eval ID, JSONL file path, etc.) */
  sourceId: string;

  /** The prompt/request given to the agent */
  prompt: string;

  /** Expected behavior (optional for production logs) */
  expectedBehavior?: string;

  /** Category of the eval (optional for production logs) */
  category?: EvalCategory;

  /** The agent's output/response */
  output: string;

  /** Tool calls made during execution */
  toolCalls?: ToolCall[];

  /** Error message if the agent failed */
  error?: string;

  /** Existing judge results if available */
  judgeResults?: JudgeResult[];

  /** When this failure occurred */
  timestamp: string;

  /** Additional metadata from the source */
  metadata?: Record<string, unknown>;
}

/**
 * Options for collecting failures from a data source
 */
export interface CollectOptions {
  /** Filter by date range */
  since?: Date;
  until?: Date;

  /** Maximum number of failures to collect */
  limit?: number;

  /** Filter by category (for eval sources) */
  categories?: EvalCategory[];

  /** Filter by specific IDs */
  ids?: string[];

  /** Project ID for production data source (fetches from S3) */
  projectId?: string;

  /** Task ID for production data source (optional, fetches all tasks if not specified) */
  taskId?: string;

  /** Custom filters */
  filters?: Record<string, unknown>;
}

/**
 * Interface for data sources that can provide failure data
 */
export interface DataSource {
  /** Name of the data source */
  name: string;

  /** Collects failures from the source */
  collect(options?: CollectOptions): Promise<FailureInput[]>;

  /** Optional: Check if the source is available/configured */
  isAvailable?(): Promise<boolean>;
}

/**
 * Registry of available data sources
 */
export type DataSourceRegistry = Record<string, DataSource>;
