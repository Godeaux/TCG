// Finite local verification queue; no cloud calls, deploys, account or DB writes.
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
const out = process.env.TCG_OVERNIGHT_OUT;
if (!out) throw new Error('TCG_OVERNIGHT_OUT must name the durable evidence directory');
mkdirSync(out, { recursive: true });
const record = {
  pid: process.pid,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  started: new Date().toISOString(),
  status: 'running',
  steps: [],
};
const save = () => writeFileSync(join(out, 'runner-status.json'), JSON.stringify(record, null, 2));
const jobs = [
  ['contract', 'npm', ['run', 'check'], 30 * 60000],
  ['browser-suite', 'npm', ['run', 'test:ui'], 45 * 60000],
  ['spectate-campaign', 'node', ['e2e/spectate-soak.mjs'], 9 * 3600000],
];
save();
for (const [name, command, args, timeout] of jobs) {
  const step = { name, status: 'running', started: new Date().toISOString() };
  record.steps.push(step);
  save();
  const fd = openSync(join(out, `${name}.log`), 'a');
  const result = spawnSync(command, args, {
    stdio: ['ignore', fd, fd],
    timeout,
    env: {
      ...process.env,
      TCG_SOAK_OUT: join(out, 'spectate'),
      TCG_SOAK_MATCHES: '400',
      TCG_SOAK_HOURS: '8',
      TCG_SOAK_PORT: '8204',
    },
  });
  closeSync(fd);
  step.finished = new Date().toISOString();
  step.exitCode = result.status;
  step.error = result.error?.message;
  step.status = result.status === 0 ? 'passed' : 'failed';
  if (result.status !== 0) {
    record.status = 'failed';
    record.finished = step.finished;
    save();
    process.exit(1);
  }
  save();
}
record.status = 'completed';
record.finished = new Date().toISOString();
save();
