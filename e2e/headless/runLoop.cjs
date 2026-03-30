#!/usr/bin/env node
/**
 * Run Loop — Runs N headless games with random deck pairings
 *
 * Usage: node e2e/headless/runLoop.cjs [count] [model]
 *   count: number of games to run (default: 5)
 *   model: Ollama model name (default: qwen3.5:9b)
 */

const path = require('path');
const fs = require('fs');

const LOG_DIR = path.resolve(__dirname, '../logs');

// We need to import the game runner dynamically since headlessGame.cjs
// runs immediately on import. Instead, we extract the core logic.

const DECKS = ['fish', 'bird', 'reptile', 'amphibian', 'mammal'];

function randomDeck(exclude = null) {
  const pool = exclude ? DECKS.filter((d) => d !== exclude) : DECKS;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function main() {
  const args = process.argv.slice(2);
  const count = parseInt(args[0]) || 5;
  const model = args[1] || 'qwen3.5:9b';

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Food Chain TCG — Headless Run Loop`);
  console.log(`Games: ${count} | Model: ${model}`);
  console.log(`${'='.repeat(60)}\n`);

  // We'll dynamically load the game engine for each game
  // Import the runGame function by requiring headlessGame and patching it
  // Actually, headlessGame.cjs auto-runs on require. Let's spawn it as a subprocess instead.

  const { execSync, spawn } = require('child_process');

  const results = [];
  const deckWins = {};
  const matchupWins = {};

  for (let i = 0; i < count; i++) {
    const deck1 = randomDeck();
    const deck2 = randomDeck(deck1);
    const matchup = `${deck1} vs ${deck2}`;

    console.log(`\n${'━'.repeat(50)}`);
    console.log(`Game ${i + 1}/${count}: ${matchup}`);
    console.log(`${'━'.repeat(50)}`);

    const startTime = Date.now();

    try {
      // Run as subprocess to get clean module state each game
      const result = await new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [path.join(__dirname, 'headlessGame.cjs'), deck1, deck2, model],
          {
            cwd: path.resolve(__dirname, '../..'),
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env },
          }
        );

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          const text = data.toString();
          stdout += text;
          process.stdout.write(text);
        });

        child.stderr.on('data', (data) => {
          const text = data.toString();
          stderr += text;
          // Only print errors, not warnings
          if (text.includes('Error') || text.includes('error')) {
            process.stderr.write(text);
          }
        });

        child.on('close', (code) => {
          // Parse result from stdout
          const winMatch = stdout.match(/🏆 Player (\d) \((\w+)\) WINS!/);
          const drawMatch = stdout.match(/🤝 DRAW!/);
          const hpMatch = stdout.match(/Final HP: P1=(-?\d+) P2=(-?\d+)/);
          const turnsMatch = stdout.match(/Turns: (\d+)/);
          const timeMatch = stdout.match(/Time: ([\d.]+)s/);

          if (winMatch) {
            resolve({
              winner: parseInt(winMatch[1]) - 1,
              winnerDeck: winMatch[2],
              deck1,
              deck2,
              finalHP: hpMatch ? [parseInt(hpMatch[1]), parseInt(hpMatch[2])] : [0, 0],
              turns: turnsMatch ? parseInt(turnsMatch[1]) : 0,
              timeS: timeMatch ? parseFloat(timeMatch[1]) : 0,
              code,
            });
          } else if (drawMatch) {
            resolve({
              winner: -1,
              winnerDeck: 'draw',
              deck1,
              deck2,
              finalHP: hpMatch ? [parseInt(hpMatch[1]), parseInt(hpMatch[2])] : [0, 0],
              turns: turnsMatch ? parseInt(turnsMatch[1]) : 0,
              timeS: timeMatch ? parseFloat(timeMatch[1]) : 0,
              code,
            });
          } else {
            resolve({
              winner: -1,
              winnerDeck: 'error',
              deck1,
              deck2,
              finalHP: [0, 0],
              turns: 0,
              timeS: (Date.now() - startTime) / 1000,
              code,
              error: code !== 0 ? `Exit code ${code}` : 'No result parsed',
            });
          }
        });

        child.on('error', (err) => {
          reject(err);
        });

        // Timeout: 10 minutes per game
        setTimeout(() => {
          child.kill('SIGTERM');
          resolve({
            winner: -1,
            winnerDeck: 'timeout',
            deck1,
            deck2,
            finalHP: [0, 0],
            turns: 0,
            timeS: 600,
            error: 'Game timed out',
          });
        }, 600000);
      });

      results.push(result);

      // Track stats
      if (result.winner >= 0) {
        const winDeck = result.winner === 0 ? deck1 : deck2;
        deckWins[winDeck] = (deckWins[winDeck] || 0) + 1;

        if (!matchupWins[matchup]) matchupWins[matchup] = { p1: 0, p2: 0, draws: 0 };
        matchupWins[matchup][result.winner === 0 ? 'p1' : 'p2']++;
      } else {
        if (!matchupWins[matchup]) matchupWins[matchup] = { p1: 0, p2: 0, draws: 0 };
        matchupWins[matchup].draws++;
      }

      console.log(
        `\n  Result: ${result.winnerDeck === 'draw' ? 'DRAW' : `${result.winnerDeck} wins`} | HP: ${result.finalHP[0]}/${result.finalHP[1]} | ${result.turns} turns | ${result.timeS}s`
      );
    } catch (err) {
      console.error(`  ❌ Game ${i + 1} failed: ${err.message}`);
      results.push({
        winner: -1,
        winnerDeck: 'error',
        deck1,
        deck2,
        error: err.message,
      });
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULTS SUMMARY — ${count} games`);
  console.log(`${'='.repeat(60)}`);

  console.log('\nDeck Win Rates:');
  for (const deck of DECKS) {
    const wins = deckWins[deck] || 0;
    const gamesPlayed = results.filter((r) => r.deck1 === deck || r.deck2 === deck).length;
    const pct = gamesPlayed > 0 ? ((wins / gamesPlayed) * 100).toFixed(0) : '0';
    console.log(`  ${deck.padEnd(12)} ${wins}/${gamesPlayed} (${pct}%)`);
  }

  console.log('\nMatchup Results:');
  for (const [matchup, record] of Object.entries(matchupWins)) {
    console.log(`  ${matchup}: P1 ${record.p1} | P2 ${record.p2} | Draws ${record.draws}`);
  }

  const avgTurns = results.filter((r) => r.turns > 0).reduce((s, r) => s + r.turns, 0) / Math.max(results.filter((r) => r.turns > 0).length, 1);
  const avgTime = results.filter((r) => r.timeS > 0).reduce((s, r) => s + r.timeS, 0) / Math.max(results.filter((r) => r.timeS > 0).length, 1);

  console.log(`\nAverages: ${avgTurns.toFixed(1)} turns | ${avgTime.toFixed(1)}s per game`);

  // Save summary
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const summaryFile = path.join(LOG_DIR, `runloop_${Date.now()}.json`);
  fs.writeFileSync(
    summaryFile,
    JSON.stringify({ count, model, results, deckWins, matchupWins, avgTurns, avgTime }, null, 2)
  );
  console.log(`\nSummary saved: ${summaryFile}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
