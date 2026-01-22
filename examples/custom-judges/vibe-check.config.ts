import {
  defineConfig,
  BaseJudge,
  getJudgeRegistry,
  type JudgeContext,
  type JudgeResult,
  type JudgeType,
  type AgentResult,
} from '@poofnew/vibe-check';

class ResponseLengthJudge extends BaseJudge {
  id = 'response-length';
  name = 'Response Length Judge';
  type: JudgeType = 'code';

  constructor(
    private minLength: number = 10,
    private maxLength: number = 1000
  ) {
    super();
  }

  async evaluate(context: JudgeContext): Promise<JudgeResult> {
    const { executionResult } = context;
    const length = executionResult.output.length;

    if (length < this.minLength) {
      return this.createResult({
        passed: false,
        score: 0,
        reasoning: `Response too short: ${length} chars (min: ${this.minLength})`,
      });
    }

    if (length > this.maxLength) {
      return this.createResult({
        passed: false,
        score: 50,
        reasoning: `Response too long: ${length} chars (max: ${this.maxLength})`,
      });
    }

    return this.createResult({
      passed: true,
      score: 100,
      reasoning: `Response length ${length} is within acceptable range`,
    });
  }
}

class NoErrorsJudge extends BaseJudge {
  id = 'no-errors';
  name = 'No Errors Judge';
  type: JudgeType = 'code';

  async evaluate(context: JudgeContext): Promise<JudgeResult> {
    const { executionResult } = context;
    const errorCalls = executionResult.toolCalls.filter((tc) => tc.isError);

    if (errorCalls.length > 0) {
      return this.createResult({
        passed: false,
        score: 0,
        reasoning: `Found ${errorCalls.length} tool call error(s)`,
        details: {
          errorTools: errorCalls.map((tc) => tc.toolName),
        },
      });
    }

    return this.createResult({
      passed: true,
      score: 100,
      reasoning: 'No tool errors detected',
    });
  }
}

const registry = getJudgeRegistry();
registry.register(new ResponseLengthJudge(20, 500));
registry.register(new NoErrorsJudge());

export default defineConfig({
  testDir: './__evals__',

  judges: [new ResponseLengthJudge(20, 500), new NoErrorsJudge()],

  agent: async (prompt): Promise<AgentResult> => {
    return {
      output: `Response to: ${prompt}`,
      success: true,
      toolCalls: [],
    };
  },
});
