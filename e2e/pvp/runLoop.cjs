/**
 * Run PvP games in a loop with random deck matchups
 * Each game produces a JSON log in e2e/logs/
 */

const { execSync } = require('child_process');
const path = require('path');

const DECKS = ['bird', 'fish', 'mammal', 'reptile', 'amphibian'];
const PROJECT = path.join(__dirname, '..', '..');

function randomDeck() {
  return DECKS[Math.floor(Math.random() * DECKS.length)];
}

async function runLoop(maxGames = 5) {
  for (let i = 0; i < maxGames; i++) {
    const d1 = randomDeck();
    const d2 = randomDeck();
    console.log(`\n${'='.repeat(50)}`);
    console.log(`  Game ${i + 1}/${maxGames}: ${d1.toUpperCase()} vs ${d2.toUpperCase()}`);
    console.log(`${'='.repeat(50)}\n`);
    
    try {
      const model = process.argv[3] || '';
      const modelArg = model ? ` ${model}` : '';
      execSync(`node e2e/pvp/pvpGame.cjs ${d1} ${d2}${modelArg}`, {
        cwd: PROJECT,
        stdio: 'inherit',
        timeout: 900000, // 15 minutes max per game
      });
    } catch (err) {
      if (err.killed) {
        console.log(`\n⏱️ Game ${i + 1} timed out after 15 minutes`);
      } else {
        console.log(`\n❌ Game ${i + 1} error: ${err.message?.substring(0, 100)}`);
      }
    }
    
    // Brief pause between games
    console.log('\n💤 Pausing 5s before next game...\n');
    await new Promise(r => setTimeout(r, 5000));
  }
  
  // Summary
  const fs = require('fs');
  const logDir = path.join(PROJECT, 'e2e', 'logs');
  if (fs.existsSync(logDir)) {
    const logs = fs.readdirSync(logDir).filter(f => f.endsWith('.json'));
    console.log(`\n${'='.repeat(50)}`);
    console.log(`  BATCH COMPLETE: ${logs.length} game logs`);
    console.log(`${'='.repeat(50)}`);
    
    let totalActions = 0;
    let totalSuspicious = 0;
    for (const log of logs) {
      const data = JSON.parse(fs.readFileSync(path.join(logDir, log)));
      totalActions += data.actions?.length || 0;
      totalSuspicious += data.suspiciousCount || 0;
      const result = data.result ? `Winner: P${(data.result.winner ?? -1) + 1} (${data.result.reason})` : 'incomplete';
      console.log(`  ${log}: ${data.actions?.length || 0} actions, ${data.suspiciousCount || 0} suspicious — ${result}`);
    }
    console.log(`\n  Total: ${totalActions} actions, ${totalSuspicious} suspicious flags`);
  }
}

const maxGames = parseInt(process.argv[2]) || 3;
runLoop(maxGames).catch(console.error);
