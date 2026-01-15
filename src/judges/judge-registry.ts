import type { Judge, JudgeType } from './judge-interface.js';
import { FileExistenceJudge } from './builtin/file-existence.js';
import { ToolInvocationJudge } from './builtin/tool-invocation.js';
import { PatternMatchJudge } from './builtin/pattern-match.js';

export class JudgeRegistry {
  private judges: Map<string, Judge> = new Map();

  constructor() {
    this.registerBuiltInJudges();
  }

  private registerBuiltInJudges(): void {
    this.register(new FileExistenceJudge());
    this.register(new ToolInvocationJudge());
    this.register(new PatternMatchJudge());
  }

  register(judge: Judge): void {
    this.judges.set(judge.id, judge);
  }

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

  listByType(type: JudgeType): string[] {
    return Array.from(this.judges.entries())
      .filter(([_, judge]) => judge.type === type)
      .map(([id]) => id);
  }

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

export function resetJudgeRegistry(): void {
  defaultRegistry = null;
}
