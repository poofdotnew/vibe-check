import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config/config-loader.js';
import { EvalRunner } from '../runner/eval-runner.js';
import type { EvalCategory } from '../config/schemas.js';

const program = new Command();

program.name('vibe-check').description('AI agent evaluation framework').version('0.1.0');

program
  .command('run')
  .description('Run eval suite')
  .option('-c, --config <path>', 'Path to config file')
  .option(
    '--category <categories...>',
    'Filter by category (tool, code-gen, routing, multi-turn, basic)'
  )
  .option('--tag <tags...>', 'Filter by tag')
  .option('--id <ids...>', 'Filter by eval ID')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);

      if (options.verbose) {
        config.verbose = true;
      }

      console.log(chalk.blue('🎯 Running vibe-check evals...\n'));

      const runner = new EvalRunner(config);
      const result = await runner.run({
        categories: options.category as EvalCategory[] | undefined,
        tags: options.tag,
        ids: options.id,
      });

      console.log();
      printSummary(result);

      process.exit(result.failed + result.errors > 0 ? 1 : 0);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all eval cases')
  .option('-c, --config <path>', 'Path to config file')
  .option('--category <categories...>', 'Filter by category')
  .option('--tag <tags...>', 'Filter by tag')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      const { loadEvalCases } = await import('../utils/eval-loader.js');

      const evalCases = await loadEvalCases({
        testDir: config.testDir,
        testMatch: config.testMatch,
        categories: options.category as EvalCategory[] | undefined,
        tags: options.tag,
        enabledOnly: true,
      });

      if (options.json) {
        console.log(JSON.stringify(evalCases, null, 2));
      } else {
        console.log(chalk.blue(`Found ${evalCases.length} eval cases:\n`));

        for (const evalCase of evalCases) {
          const tags = evalCase.tags?.length ? chalk.gray(`[${evalCase.tags.join(', ')}]`) : '';
          console.log(`  ${chalk.cyan(evalCase.id)} - ${evalCase.name} ${tags}`);
          console.log(`    Category: ${evalCase.category}`);
          if (evalCase.description) {
            console.log(`    ${chalk.gray(evalCase.description)}`);
          }
          console.log();
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize vibe-check in current project')
  .option('--typescript', 'Create TypeScript config (default)')
  .action(async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const configContent = `import { defineConfig } from '@pooflabs/vibe-check';

// TODO: Import your AI agent SDK
// import { query } from '@anthropic-ai/claude-agent-sdk';

export default defineConfig({
  testDir: './__evals__',

  // Implement your agent function
  agent: async (prompt, context) => {
    // TODO: Replace with your agent implementation
    // For Claude Agent SDK:
    // for await (const msg of query({ prompt, options: { cwd: context.workingDirectory } })) {
    //   if (msg.type === 'result') {
    //     return { output: msg.result || '', success: msg.subtype === 'success' };
    //   }
    // }

    throw new Error('Agent not implemented - update vibe-check.config.ts');
  },
});
`;

    const evalExampleContent = `{
  "id": "example-eval",
  "name": "Example Evaluation",
  "description": "An example eval case",
  "category": "basic",
  "prompt": "Say hello world",
  "judges": []
}
`;

    try {
      const cwd = process.cwd();

      await fs.writeFile(path.join(cwd, 'vibe-check.config.ts'), configContent);
      console.log(chalk.green('✓'), 'Created vibe-check.config.ts');

      await fs.mkdir(path.join(cwd, '__evals__'), { recursive: true });
      await fs.writeFile(path.join(cwd, '__evals__', 'example.eval.json'), evalExampleContent);
      console.log(chalk.green('✓'), 'Created __evals__/example.eval.json');

      console.log();
      console.log(chalk.blue('Next steps:'));
      console.log('  1. Update vibe-check.config.ts with your agent function');
      console.log('  2. Create eval cases in __evals__/*.eval.json');
      console.log('  3. Run: bunx vibe-check run');
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Learning commands
const learn = program.command('learn').description('Learning loop commands');

learn
  .command('run')
  .description('Run full learning iteration')
  .option('-c, --config <path>', 'Path to config file')
  .option('--source <source>', 'Data source to use (eval, jsonl, both)', 'eval')
  .option('--auto-approve', 'Auto-approve high-confidence rules')
  .option('--save-pending', 'Save rules for later review')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      const { LearningRunner } = await import('../learning/learning-runner.js');
      const runner = new LearningRunner(config.learning);

      const sources = options.source === 'both' ? ['eval', 'jsonl'] : [options.source];

      await runner.runIteration({
        sources,
        autoApprove: options.autoApprove,
        savePending: options.savePending,
      });
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

learn
  .command('analyze')
  .description('Analyze failures without generating rules')
  .option('-c, --config <path>', 'Path to config file')
  .option('--source <source>', 'Data source to use (eval, jsonl, both)', 'eval')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      const { LearningRunner } = await import('../learning/learning-runner.js');
      const runner = new LearningRunner(config.learning);

      const sources = options.source === 'both' ? ['eval', 'jsonl'] : [options.source];

      await runner.analyze({ sources });
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

learn
  .command('review')
  .description('Review pending rules')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      const { LearningRunner } = await import('../learning/learning-runner.js');
      const runner = new LearningRunner(config.learning);
      await runner.reviewPending();
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

learn
  .command('stats')
  .description('Show learning system statistics')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      const { LearningRunner } = await import('../learning/learning-runner.js');
      const runner = new LearningRunner(config.learning);
      await runner.showStats();
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

function printSummary(result: import('../runner/eval-runner.js').EvalSuiteResult): void {
  const { total, passed, failed, errors, passRate, duration } = result;

  console.log(chalk.bold('Results:'));
  console.log(`  Total:  ${total}`);
  console.log(`  ${chalk.green('Passed:')} ${passed}`);

  if (failed > 0) {
    console.log(`  ${chalk.red('Failed:')} ${failed}`);
  }

  if (errors > 0) {
    console.log(`  ${chalk.yellow('Errors:')} ${errors}`);
  }

  console.log();
  console.log(`  Pass rate: ${chalk.bold((passRate * 100).toFixed(1) + '%')}`);
  console.log(`  Duration:  ${(duration / 1000).toFixed(2)}s`);

  if (result.results.length > 0 && (failed > 0 || errors > 0)) {
    console.log();
    console.log(chalk.bold('Failed cases:'));

    for (const r of result.results) {
      if (!r.success) {
        console.log(`  ${chalk.red('✗')} ${r.evalCase.name}`);
        if (r.error) {
          console.log(`    ${chalk.gray(r.error.message)}`);
        }
        for (const judge of r.judgeResults) {
          if (!judge.passed) {
            console.log(`    ${chalk.gray(`[${judge.judgeId}] ${judge.reasoning}`)}`);
          }
        }
      }
    }
  }
}

// Handle graceful shutdown signals
let shuttingDown = false;
const handleShutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${chalk.yellow(`Received ${signal}, shutting down gracefully...`)}`);
  process.exit(1);
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

program.parse();
