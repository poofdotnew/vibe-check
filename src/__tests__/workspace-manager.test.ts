import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { WorkspaceManager } from '../harness/workspace-manager.js';

describe('WorkspaceManager', () => {
  let baseDir: string;
  let manager: WorkspaceManager;

  beforeEach(async () => {
    baseDir = path.join(os.tmpdir(), `ws-manager-test-${Date.now()}`);
    await fs.mkdir(baseDir, { recursive: true });
    manager = new WorkspaceManager(baseDir);
  });

  afterEach(async () => {
    await manager.cleanupAll();
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  describe('createWorkspace', () => {
    test('creates a workspace with unique id', async () => {
      const workspace = await manager.createWorkspace();

      expect(workspace.id).toMatch(/^ws-\d+-[a-z0-9]+$/);
      expect(workspace.path).toContain(baseDir);
      expect(workspace.createdAt).toBeInstanceOf(Date);
    });

    test('creates workspace directory', async () => {
      const workspace = await manager.createWorkspace();

      const stat = await fs.stat(workspace.path);
      expect(stat.isDirectory()).toBe(true);
    });

    test('creates minimal structure without template', async () => {
      const workspace = await manager.createWorkspace();

      const srcStat = await fs.stat(path.join(workspace.path, 'src'));
      expect(srcStat.isDirectory()).toBe(true);

      const pkgJson = await fs.readFile(path.join(workspace.path, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgJson);
      expect(pkg.name).toBe('eval-workspace');
      expect(pkg.type).toBe('module');
    });

    test('creates multiple unique workspaces', async () => {
      const ws1 = await manager.createWorkspace();
      const ws2 = await manager.createWorkspace();

      expect(ws1.id).not.toBe(ws2.id);
      expect(ws1.path).not.toBe(ws2.path);
    });
  });

  describe('createWorkspace with template', () => {
    let templateDir: string;

    beforeEach(async () => {
      templateDir = path.join(os.tmpdir(), `template-${Date.now()}`);
      await fs.mkdir(path.join(templateDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(templateDir, 'package.json'), '{"name": "template"}');
      await fs.writeFile(path.join(templateDir, 'src', 'index.ts'), 'export const x = 1;');
    });

    afterEach(async () => {
      await fs.rm(templateDir, { recursive: true, force: true });
    });

    test('copies template files to workspace', async () => {
      const workspace = await manager.createWorkspace(templateDir);

      const pkgJson = await fs.readFile(path.join(workspace.path, 'package.json'), 'utf-8');
      expect(JSON.parse(pkgJson).name).toBe('template');

      const indexContent = await fs.readFile(path.join(workspace.path, 'src', 'index.ts'), 'utf-8');
      expect(indexContent).toBe('export const x = 1;');
    });

    test('skips node_modules when copying', async () => {
      await fs.mkdir(path.join(templateDir, 'node_modules', 'some-pkg'), { recursive: true });
      await fs.writeFile(path.join(templateDir, 'node_modules', 'some-pkg', 'index.js'), 'template-content');

      const workspace = await manager.createWorkspace(templateDir);

      const templatePkgExists = await fs.access(path.join(workspace.path, 'node_modules', 'some-pkg', 'index.js'))
        .then(() => true)
        .catch(() => false);

      expect(templatePkgExists).toBe(false);
    });

    test('skips .git when copying', async () => {
      await fs.mkdir(path.join(templateDir, '.git'), { recursive: true });
      await fs.writeFile(path.join(templateDir, '.git', 'config'), '');

      const workspace = await manager.createWorkspace(templateDir);

      const gitExists = await fs.access(path.join(workspace.path, '.git'))
        .then(() => true)
        .catch(() => false);

      expect(gitExists).toBe(false);
    });

    test('skips dist when copying', async () => {
      await fs.mkdir(path.join(templateDir, 'dist'), { recursive: true });
      await fs.writeFile(path.join(templateDir, 'dist', 'index.js'), '');

      const workspace = await manager.createWorkspace(templateDir);

      const distExists = await fs.access(path.join(workspace.path, 'dist'))
        .then(() => true)
        .catch(() => false);

      expect(distExists).toBe(false);
    });

    test('falls back to minimal structure if template not found', async () => {
      const workspace = await manager.createWorkspace('/nonexistent/path');

      const pkgJson = await fs.readFile(path.join(workspace.path, 'package.json'), 'utf-8');
      expect(JSON.parse(pkgJson).name).toBe('eval-workspace');
    });
  });

  describe('cleanupWorkspace', () => {
    test('removes workspace directory', async () => {
      const workspace = await manager.createWorkspace();
      await manager.cleanupWorkspace(workspace.id);

      const exists = await fs.access(workspace.path)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(false);
    });

    test('removes workspace from internal tracking', async () => {
      const workspace = await manager.createWorkspace();
      await manager.cleanupWorkspace(workspace.id);

      expect(manager.getWorkspace(workspace.id)).toBeUndefined();
    });

    test('handles non-existent workspace gracefully', async () => {
      await expect(manager.cleanupWorkspace('non-existent-id')).resolves.toBeUndefined();
    });
  });

  describe('cleanupAll', () => {
    test('removes all workspaces', async () => {
      const ws1 = await manager.createWorkspace();
      const ws2 = await manager.createWorkspace();
      const ws3 = await manager.createWorkspace();

      await manager.cleanupAll();

      expect(manager.listWorkspaces()).toHaveLength(0);

      for (const ws of [ws1, ws2, ws3]) {
        const exists = await fs.access(ws.path)
          .then(() => true)
          .catch(() => false);
        expect(exists).toBe(false);
      }
    });
  });

  describe('getWorkspace', () => {
    test('returns workspace by id', async () => {
      const created = await manager.createWorkspace();
      const retrieved = manager.getWorkspace(created.id);

      expect(retrieved).toEqual(created);
    });

    test('returns undefined for unknown id', () => {
      expect(manager.getWorkspace('unknown-id')).toBeUndefined();
    });
  });

  describe('listWorkspaces', () => {
    test('returns all active workspaces', async () => {
      await manager.createWorkspace();
      await manager.createWorkspace();
      await manager.createWorkspace();

      const workspaces = manager.listWorkspaces();
      expect(workspaces).toHaveLength(3);
    });

    test('returns empty array initially', () => {
      expect(manager.listWorkspaces()).toHaveLength(0);
    });
  });
});
