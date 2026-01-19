#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

var __filename$1 = fileURLToPath(import.meta.url);
var __dirname$1 = dirname(__filename$1);
var cliPath = join(__dirname$1, "cli.js");
var child = spawn(
  process.execPath,
  ["--import", "tsx", cliPath, ...process.argv.slice(2)],
  {
    stdio: "inherit",
    cwd: process.cwd()
  }
);
child.on("exit", (code) => {
  process.exit(code ?? 0);
});
//# sourceMappingURL=vibe-check.js.map
//# sourceMappingURL=vibe-check.js.map