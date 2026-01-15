#!/usr/bin/env node
// @ts-check

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cliPath = join(__dirname, 'cli.js');

const child = spawn(
  process.execPath,
  ['--import', 'tsx', cliPath, ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    cwd: process.cwd(),
  }
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
