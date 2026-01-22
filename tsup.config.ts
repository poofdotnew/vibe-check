import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'bin/vibe-check': 'src/bin/vibe-check.ts',
    'bin/cli': 'src/bin/cli.ts',
    'judges/index': 'src/judges/index.ts',
    'learning/index': 'src/learning/index.ts',
    'adapters/index': 'src/adapters/index.ts',
    'openai/index': 'src/openai/index.ts',
  },
  format: ['esm'],
  dts: {
    entry: {
      index: 'src/index.ts',
      'judges/index': 'src/judges/index.ts',
      'adapters/index': 'src/adapters/index.ts',
      'openai/index': 'src/openai/index.ts',
    },
  },
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: ['@anthropic-ai/sdk', '@anthropic-ai/claude-agent-sdk', '@openai/agents'],
});
