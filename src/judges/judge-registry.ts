import type { Judge, JudgeType } from './judge-interface.js';
import { FileExistenceJudge } from './builtin/file-existence.js';
import { ToolInvocationJudge } from './builtin/tool-invocation.js';
import { PatternMatchJudge } from './builtin/pattern-match.js';
import { AgentRoutingJudge } from './builtin/agent-routing.js';
import { SkillInvocationJudge } from './builtin/skill-invocation.js';
import { SyntaxValidationJudge } from './builtin/syntax-validation.js';
import {
  createLLMCodeQualityJudge,
  createLLMRoutingQualityJudge,
  createLLMResponseQualityJudge,
  createLLMConversationQualityJudge,
} from './builtin/llm-judge.js';

export class JudgeRegistry {
  private judges: Map<string, Judge> = new Map();

  constructor() {
    this.registerBuiltInJudges();
  }

  private registerBuiltInJudges(): void {
    this.register(new FileExistenceJudge());
    this.register(new ToolInvocationJudge());
    this.register(new PatternMatchJudge());
    this.register(new AgentRoutingJudge());
    this.register(new SkillInvocationJudge());
    this.register(new SyntaxValidationJudge());
    this.register(createLLMCodeQualityJudge());
    this.register(createLLMRoutingQualityJudge());
    this.register(createLLMResponseQualityJudge());
    this.register(createLLMConversationQualityJudge());
  }

  register(judge: Judge): void {
    this.judges.set(judge.id, judge);
  }

  /** @internal Used for testing only */
  unregister(id: string): boolean {
    return this.judges.delete(id);
  }

  get(id: string): Judge | undefined {
    return this.judges.get(id);
  }

  has(id: string): boolean {
    return this.judges.has(id);
  }

  list(): string[] {
    return Array.from(this.judges.keys());
  }

  /** @internal Used for testing only */
  listByType(type: JudgeType): string[] {
    return Array.from(this.judges.entries())
      .filter(([_, judge]) => judge.type === type)
      .map(([id]) => id);
  }

  /** @internal Used for testing only */
  getAll(): Judge[] {
    return Array.from(this.judges.values());
  }
}

let defaultRegistry: JudgeRegistry | null = null;

export function getJudgeRegistry(): JudgeRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new JudgeRegistry();
  }
  return defaultRegistry;
}

/** @internal Used for testing only */
export function resetJudgeRegistry(): void {
  defaultRegistry = null;
}
