import * as fs from 'fs';
import * as path from 'path';
import { FileGuard } from './FileGuard.js';

/**
 * Virtual filesystem for the game project being built.
 * All agent file operations go through here, enforcing
 * role-based access control via FileGuard.
 */
export class Workspace {
  /**
   * @param {string} rootDir - Absolute path to workspace directory
   */
  constructor(rootDir) {
    this.root = path.resolve(rootDir);
    this._guard = new FileGuard();
    this._ensureDir(this.root);
  }

  /**
   * Read a file. Returns { content } or { denied, reason }.
   */
  readFile(filePath, agentId, role) {
    const resolved = this._resolve(filePath);
    const check = this._guard.canRead(filePath, role);
    if (!check.allowed) {
      return { denied: true, reason: check.reason };
    }

    try {
      const content = fs.readFileSync(resolved, 'utf-8');
      return { content };
    } catch (err) {
      return { denied: false, error: err.message };
    }
  }

  /**
   * Write a file. Returns { written } or { denied, reason }.
   */
  writeFile(filePath, content, agentId, role) {
    const resolved = this._resolve(filePath);
    const check = this._guard.canWrite(filePath, role);
    if (!check.allowed) {
      return { denied: true, reason: check.reason };
    }

    try {
      this._ensureDir(path.dirname(resolved));
      fs.writeFileSync(resolved, content, 'utf-8');
      return { written: true };
    } catch (err) {
      return { denied: false, error: err.message };
    }
  }

  /**
   * List files in a directory.
   */
  listFiles(dirPath, agentId, role) {
    const resolved = this._resolve(dirPath || '.');
    try {
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      return entries.map((e) => ({
        name: e.name,
        type: e.isDirectory() ? 'dir' : 'file',
      }));
    } catch {
      return [];
    }
  }

  /**
   * Check if a file exists.
   */
  exists(filePath) {
    return fs.existsSync(this._resolve(filePath));
  }

  /**
   * Get project structure as a tree (for context).
   */
  getProjectTree(maxDepth = 3) {
    return this._buildTree(this.root, 0, maxDepth);
  }

  _resolve(filePath) {
    const resolved = path.resolve(this.root, filePath);
    if (!resolved.startsWith(this.root)) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  _ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  _buildTree(dir, depth, maxDepth) {
    if (depth >= maxDepth) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const result = {};
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (entry.isDirectory()) {
        result[entry.name + '/'] = this._buildTree(
          path.join(dir, entry.name),
          depth + 1,
          maxDepth
        );
      } else {
        result[entry.name] = null;
      }
    }
    return result;
  }
}
