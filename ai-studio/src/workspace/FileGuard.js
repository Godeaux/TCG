/**
 * Enforces role-based file access control.
 * Each role defines allowedPaths and forbiddenPaths as glob-like patterns.
 * FileGuard checks whether a given path is permitted for a role.
 */
export class FileGuard {
  /**
   * Check if a role can read a file path.
   * Reading is more permissive — most roles can read most files.
   */
  canRead(filePath, role) {
    // All roles can read anything not explicitly forbidden
    if (this._matchesAny(filePath, role.forbiddenPaths)) {
      return { allowed: false, reason: `${role.name} cannot access ${filePath}` };
    }
    return { allowed: true };
  }

  /**
   * Check if a role can write to a file path.
   * Writing is strict — must match allowedPaths.
   */
  canWrite(filePath, role) {
    if (this._matchesAny(filePath, role.forbiddenPaths)) {
      return { allowed: false, reason: `${role.name} cannot write to ${filePath}` };
    }
    if (!this._matchesAny(filePath, role.allowedPaths)) {
      return {
        allowed: false,
        reason: `${role.name} can only write to: ${role.allowedPaths.join(', ')}`,
      };
    }
    return { allowed: true };
  }

  /**
   * Simple glob matching — supports * and ** patterns.
   */
  _matchesAny(filePath, patterns) {
    return patterns.some((pattern) => this._matches(filePath, pattern));
  }

  _matches(filePath, pattern) {
    // Normalize
    const normalized = filePath.replace(/\\/g, '/');

    // Convert glob to regex
    const regexStr = pattern
      .replace(/\\/g, '/')
      .replace(/\*\*/g, '{{DOUBLESTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\{\{DOUBLESTAR\}\}/g, '.*');

    return new RegExp(`^${regexStr}$`).test(normalized) ||
           new RegExp(`^${regexStr}`).test(normalized);
  }
}
