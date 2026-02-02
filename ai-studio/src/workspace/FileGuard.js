/**
 * Enforces role-based file access control.
 *
 * Role definitions use placeholder patterns like {sourceExt}, {styleExt}, {dataExt}
 * that are resolved at runtime from the project config. This keeps roles
 * language-agnostic while enforcing precise boundaries.
 */
export class FileGuard {
  /**
   * @param {object} [projectConfig] - Project config with extension arrays
   */
  constructor(projectConfig = {}) {
    this._projectConfig = projectConfig;
  }

  /** Update the project config (e.g. after loading from template) */
  setProjectConfig(projectConfig) {
    this._projectConfig = projectConfig;
  }

  /**
   * Check if a role can read a file path.
   * Reading is more permissive — only blocked by forbiddenPaths.
   */
  canRead(filePath, role) {
    const forbidden = this._resolvePatterns(role.forbiddenPaths);
    if (this._matchesAny(filePath, forbidden)) {
      return { allowed: false, reason: `${role.name} cannot access ${filePath}` };
    }
    return { allowed: true };
  }

  /**
   * Check if a role can write to a file path.
   * Writing is strict — must match allowedPaths and not match forbiddenPaths.
   */
  canWrite(filePath, role) {
    const forbidden = this._resolvePatterns(role.forbiddenPaths);
    if (this._matchesAny(filePath, forbidden)) {
      return { allowed: false, reason: `${role.name} cannot write to ${filePath}` };
    }
    const allowed = this._resolvePatterns(role.allowedPaths);
    if (!this._matchesAny(filePath, allowed)) {
      return {
        allowed: false,
        reason: `${role.name} can only write to: ${allowed.join(', ')}`,
      };
    }
    return { allowed: true };
  }

  /**
   * Resolve placeholder patterns against project config.
   *
   * {sourceExt} → expands to one pattern per source extension
   * {styleExt}  → expands to one pattern per style extension
   * {dataExt}   → expands to one pattern per data extension
   *
   * e.g. 'src/**/*{sourceExt}' with sourceExtensions ['.js', '.mjs']
   *   → ['src/**/*.js', 'src/**/*.mjs']
   */
  _resolvePatterns(patterns) {
    const resolved = [];
    for (const pattern of patterns) {
      if (pattern.includes('{sourceExt}')) {
        for (const ext of this._projectConfig.sourceExtensions || ['.js']) {
          resolved.push(pattern.replace('{sourceExt}', ext));
        }
      } else if (pattern.includes('{styleExt}')) {
        for (const ext of this._projectConfig.styleExtensions || ['.css', '.html']) {
          resolved.push(pattern.replace('{styleExt}', ext));
        }
      } else if (pattern.includes('{dataExt}')) {
        for (const ext of this._projectConfig.dataExtensions || ['.json']) {
          resolved.push(pattern.replace('{dataExt}', ext));
        }
      } else {
        resolved.push(pattern);
      }
    }
    return resolved;
  }

  _matchesAny(filePath, patterns) {
    return patterns.some((pattern) => this._matches(filePath, pattern));
  }

  _matches(filePath, pattern) {
    const normalized = filePath.replace(/\\/g, '/');
    const regexStr = pattern
      .replace(/\\/g, '/')
      .replace(/\*\*/g, '{{DOUBLESTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\{\{DOUBLESTAR\}\}/g, '.*');

    return new RegExp(`^${regexStr}$`).test(normalized) ||
           new RegExp(`^${regexStr}`).test(normalized);
  }
}
