/**
 * Toolchain — executes project-level commands (build, test, run, lint).
 *
 * The toolchain is defined per-project in the project config. This class
 * wraps command execution with timeout, output capture, and event emission.
 *
 * Agents never run toolchain commands directly — they request them through
 * the Orchestrator, which uses this class.
 */
import { exec } from 'child_process';
import { EventType } from '../timeline/Event.js';

export class Toolchain {
  /**
   * @param {object} commands - The toolchain commands from project config
   * @param {string} cwd - Working directory (workspace root)
   * @param {import('../timeline/EventBus.js').EventBus} eventBus
   */
  constructor(commands, cwd, eventBus) {
    this._commands = commands || {};
    this._cwd = cwd;
    this._eventBus = eventBus;
  }

  /** Check which commands are available */
  available() {
    return Object.entries(this._commands)
      .filter(([, cmd]) => cmd != null)
      .map(([name]) => name);
  }

  /** Run a named toolchain command. Returns { ok, stdout, stderr, code }. */
  async run(name, { timeout = 60_000 } = {}) {
    const cmd = this._commands[name];
    if (!cmd) {
      return { ok: false, error: `No '${name}' command configured` };
    }

    this._eventBus?.emit({
      type: EventType.BUILD_STARTED,
      data: { command: name, raw: cmd },
      timestamp: Date.now(),
    });

    return new Promise((resolve) => {
      const child = exec(cmd, {
        cwd: this._cwd,
        timeout,
        maxBuffer: 1024 * 1024,
      }, (error, stdout, stderr) => {
        const ok = !error;
        const result = { ok, stdout, stderr, code: error?.code ?? 0 };

        this._eventBus?.emit({
          type: ok ? EventType.BUILD_SUCCEEDED : EventType.BUILD_FAILED,
          data: { command: name, ...result },
          timestamp: Date.now(),
        });

        resolve(result);
      });
    });
  }

  /** Convenience methods */
  install(opts) { return this.run('install', opts); }
  build(opts) { return this.run('build', opts); }
  test(opts) { return this.run('test', opts); }
  lint(opts) { return this.run('lint', opts); }
  typecheck(opts) { return this.run('typecheck', opts); }
}
