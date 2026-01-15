import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface EvalWorkspace {
  id: string;
  path: string;
  createdAt: Date;
}

const SKIP_PATTERNS = ['node_modules', '.bun', 'bun.lock', 'dist', '.git', '.next', 'coverage'];

function getWorkspaceBaseDir(): string {
  const cwd = process.cwd();
  const evalsResultsDir = path.join(cwd, '__evals__', 'results', 'workspaces');

  try {
    fsSync.mkdirSync(evalsResultsDir, { recursive: true });
    const testFile = path.join(evalsResultsDir, '.write-test');
    fsSync.writeFileSync(testFile, '');
    fsSync.unlinkSync(testFile);
    return evalsResultsDir;
  } catch {
    const tmpDir = fsSync.realpathSync(os.tmpdir());
    return path.join(tmpDir, 'vibe-check-evals');
  }
}

export class WorkspaceManager {
  private workspaces: Map<string, EvalWorkspace> = new Map();
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? getWorkspaceBaseDir();
  }

  async createWorkspace(template?: string): Promise<EvalWorkspace> {
    const id = `ws-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const workspacePath = path.join(this.baseDir, id);

    await fs.mkdir(workspacePath, { recursive: true });

    if (template) {
      console.log(`[WorkspaceManager] Copying template from: ${template}`);
      try {
        await this.copyTemplate(template, workspacePath);
        console.log(`[WorkspaceManager] Template copied successfully to: ${workspacePath}`);
        // Run bun install to install dependencies (node_modules is skipped during copy)
        await this.installDependencies(workspacePath);
        console.log(`[WorkspaceManager] Dependencies installed`);
      } catch (error) {
        console.error(`[WorkspaceManager] Failed to copy template from ${template}:`, error);
        // Fall back to minimal structure
        await this.createMinimalStructure(workspacePath);
      }
    } else {
      console.log(`[WorkspaceManager] No template provided, creating minimal structure`);
      await this.createMinimalStructure(workspacePath);
    }

    const workspace: EvalWorkspace = {
      id,
      path: workspacePath,
      createdAt: new Date(),
    };

    this.workspaces.set(id, workspace);
    return workspace;
  }

  private async installDependencies(workspacePath: string): Promise<void> {
    try {
      // Check if package.json exists
      const packageJsonPath = path.join(workspacePath, 'package.json');
      await fs.access(packageJsonPath);

      // Run bun install in the workspace
      await execAsync('bun install', { cwd: workspacePath });
    } catch {
      // Ignore errors - workspace may not need dependencies
    }
  }

  private async createMinimalStructure(workspacePath: string): Promise<void> {
    await fs.mkdir(path.join(workspacePath, 'src'), { recursive: true });

    await fs.writeFile(
      path.join(workspacePath, 'package.json'),
      JSON.stringify({ name: 'eval-workspace', version: '1.0.0', type: 'module' }, null, 2)
    );
  }

  private async copyTemplate(templatePath: string, workspacePath: string): Promise<void> {
    const resolvedTemplate = path.isAbsolute(templatePath)
      ? templatePath
      : path.join(process.cwd(), templatePath);

    // Verify template exists
    try {
      await fs.access(resolvedTemplate);
    } catch {
      throw new Error(`Template not found at: ${resolvedTemplate}`);
    }

    await this.copyDir(resolvedTemplate, workspacePath, SKIP_PATTERNS);
  }

  private async copyDir(src: string, dest: string, skipPatterns: string[] = []): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      if (skipPatterns.some(pattern => entry.name === pattern)) {
        continue;
      }

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDir(srcPath, destPath, skipPatterns);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  async cleanupWorkspace(id: string): Promise<void> {
    const workspace = this.workspaces.get(id);
    if (workspace) {
      try {
        await fs.rm(workspace.path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch (error) {
        console.warn(`Warning: Could not fully cleanup workspace ${id}:`, (error as Error).message);
      }
      this.workspaces.delete(id);
    }
  }

  async cleanupAll(): Promise<void> {
    for (const id of this.workspaces.keys()) {
      await this.cleanupWorkspace(id);
    }
  }

  getWorkspace(id: string): EvalWorkspace | undefined {
    return this.workspaces.get(id);
  }

  listWorkspaces(): EvalWorkspace[] {
    return Array.from(this.workspaces.values());
  }
}
