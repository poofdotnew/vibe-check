/**
 * Core types for the Prompt Learning System.
 *
 * The learning pipeline flows:
 * FailureInput → FailureExplanation → FailurePattern → ProposedRule
 */

import type { FailureInput } from './data-sources/types.js';

/**
 * LLM-generated explanation of why a failure occurred.
 * This is the critical piece - quality of explanations drives learning quality.
 */
export interface FailureExplanation {
  /** Unique identifier */
  id: string;

  /** Original failure input this explanation is based on */
  failureInput: FailureInput;

  /** LLM-generated explanation */
  explanation: {
    /** Concrete description of what the agent did wrong */
    whatWentWrong: string;

    /** Underlying reason for the failure */
    whyItFailed: string;

    /** Systemic issue (missing instruction, unclear guidance, etc.) */
    rootCause: string;

    /** What instruction would prevent this failure */
    suggestedFix: string;

    /** Classification of the failure type */
    patternCategory: string;

    /** Which agent/component is affected */
    affectedComponent?: string;
  };

  /** Confidence in the explanation (0-1) */
  confidence: number;

  /** When this explanation was generated */
  generatedAt: string;

  /** Model used to generate the explanation */
  model: string;
}

/**
 * A pattern detected across multiple similar failures.
 * Patterns are used to generate rules that address systemic issues.
 */
export interface FailurePattern {
  /** Unique identifier */
  patternId: string;

  /** Human-readable name for the pattern */
  patternName: string;

  /** Category of failures in this pattern */
  category: string;

  /** All failure explanations that match this pattern */
  failures: FailureExplanation[];

  /** Number of failures in this pattern */
  frequency: number;

  /** Components affected by this pattern */
  affectedComponents: string[];

  /** Common root causes identified */
  commonRootCauses: string[];

  /** Similarity score among failures (0-1) */
  similarityScore: number;

  /** When this pattern was detected */
  detectedAt: string;
}

/**
 * A proposed rule to add to the system prompt.
 * Rules are generated from patterns and require human review.
 */
export interface ProposedRule {
  /** Unique identifier */
  ruleId: string;

  /** The actual rule/instruction text */
  ruleContent: string;

  /** Where this rule should be placed in the prompt */
  targetSection: string;

  /** More specific placement guidance */
  placement?: string;

  /** Why this rule should help */
  rationale: string;

  /** Pattern IDs this rule addresses */
  addressesPatterns: string[];

  /** Expected impact - which failures should be fixed */
  expectedImpact: {
    failureIds: string[];
    confidenceScore: number;
  };

  /** Review status */
  status: 'pending' | 'approved' | 'rejected' | 'integrated';

  /** Human reviewer notes */
  reviewNotes?: string;

  /** When this rule was generated */
  generatedAt: string;

  /** Model used to generate the rule */
  model: string;

  /** Learning iteration that created this rule */
  source: string;
}

/**
 * Result of a learning iteration
 */
export interface LearningIterationResult {
  /** Unique identifier for this iteration */
  iterationId: string;

  /** When this iteration ran */
  timestamp: string;

  /** Data sources used */
  sources: string[];

  /** Number of failures collected */
  failuresCollected: number;

  /** Number of explanations generated */
  explanationsGenerated: number;

  /** Patterns detected */
  patternsDetected: FailurePattern[];

  /** Rules proposed */
  rulesProposed: ProposedRule[];

  /** Rules approved (after human review) */
  rulesApproved: ProposedRule[];

  /** Rules rejected (after human review) */
  rulesRejected: ProposedRule[];

  /** Validation results if run */
  validation?: {
    passRateBefore: number;
    passRateAfter: number;
    delta: number;
    regressions: string[];
  };

  /** Duration of the iteration */
  durationMs: number;
}

/**
 * Stored rules in learned-rules.json
 */
export interface LearnedRulesFile {
  rules: Array<ProposedRule & { integrated?: boolean }>;
  lastUpdated: string;
  iterations: string[];
}

/**
 * Learning history stored in history.json
 */
export interface LearningHistory {
  iterations: LearningIterationResult[];
  totalRulesGenerated: number;
  totalRulesApproved: number;
  totalRulesRejected: number;
  lastRunAt: string;
}

// Re-export data source types for convenience
export type { FailureInput, ToolCall, CollectOptions, DataSource } from './data-sources/types.js';
