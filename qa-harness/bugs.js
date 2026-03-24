/**
 * Bug Reporter — writes structured bug reports to qa-harness/bugs/
 *
 * Deduplicates by fingerprint so the same bug type doesn't get filed repeatedly.
 */

import { writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUGS_DIR = join(__dirname, 'bugs');

// Ensure bugs directory exists
if (!existsSync(BUGS_DIR)) mkdirSync(BUGS_DIR, { recursive: true });

/**
 * Generate a fingerprint for deduplication.
 * Same bug type + same cards involved = same fingerprint.
 */
function fingerprint(bug) {
  const key = `${bug.title}::${bug.rule_reference || ''}`;
  return createHash('md5').update(key).digest('hex').slice(0, 8);
}

/**
 * Check if a bug with this fingerprint already exists.
 */
function isDuplicate(fp) {
  try {
    const files = readdirSync(BUGS_DIR);
    return files.some((f) => f.includes(fp));
  } catch {
    return false;
  }
}

/**
 * File a bug report.
 * @param {object} bug - { title, expected, actual, severity, rule_reference }
 * @param {object} context - { gameId, turn, phase, beforeState, afterState, action }
 * @returns {string|null} - filename if filed, null if duplicate
 */
export function fileBugReport(bug, context = {}) {
  const fp = fingerprint(bug);

  if (isDuplicate(fp)) {
    console.log(`[Bugs] Duplicate skipped: ${bug.title} (${fp})`);
    return null;
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${timestamp}-${fp}.md`;
  const filepath = join(BUGS_DIR, filename);

  const report = `# BUG: ${bug.title}

**Detected:** ${now.toISOString()}
**Game:** ${context.gameId || 'unknown'}
**Turn:** ${context.turn || '?'}, ${context.phase || '?'}
**Severity:** ${bug.severity || 'unknown'}

## What Happened
${bug.actual || 'No description'}

## Expected (${bug.rule_reference || 'CORE-RULES'})
${bug.expected || 'No expectation'}

## LLM Analysis
${bug.analysis || ''}

## State Before
\`\`\`json
${JSON.stringify(context.beforeState || {}, null, 2)}
\`\`\`

## State After
\`\`\`json
${JSON.stringify(context.afterState || {}, null, 2)}
\`\`\`

## Action Taken
\`\`\`json
${JSON.stringify(context.action || {}, null, 2)}
\`\`\`
`;

  writeFileSync(filepath, report);
  console.log(`[Bugs] Filed: ${filename}`);
  return filename;
}

/**
 * Get count of unique bugs found.
 */
export function getBugCount() {
  try {
    return readdirSync(BUGS_DIR).filter((f) => f.endsWith('.md')).length;
  } catch {
    return 0;
  }
}
