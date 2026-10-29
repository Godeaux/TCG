import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
const server = spawn('python3', ['-m', 'http.server', '8188', '--bind', '127.0.0.1'], {stdio:'ignore'});
const browser = await chromium.launch(process.env.TCG_CHROME ? {executablePath:process.env.TCG_CHROME} : {});
try {
 const page=await browser.newPage();page.setDefaultTimeout(15000);
 await page.goto('http://127.0.0.1:8188');
 await page.waitForFunction(()=>!document.body.hasAttribute('data-loading'));
 const result=await page.evaluate(async()=>{
  const {createGameState}=await import('/js/state/gameState.js');
  const {deckCatalogs}=await import('/js/cards/index.js');
  const {generateAIvsAIDecks}=await import('/js/ui/overlays/DeckBuilderOverlay.js');
  const fixture=(domain)=>[['Predator',6],['Prey',7],['Spell',4],['Free Spell',2],['Trap',1]].flatMap(([type,n])=>deckCatalogs[domain].filter(c=>c.type===type).slice(0,n).map(c=>c.id));
  const state=createGameState();
  state.menu.mode='aiVsAi';
  state.menu.decks=[{id:'qa-fish',name:'Saved fish',deck:fixture('fish')},{id:'qa-frog',name:'Saved frogs',deck:fixture('amphibian')}];
  state.menu.aiVsAiDecks={player1:'saved:qa-fish',player2:'saved:qa-frog'};
  const recovered=JSON.parse(JSON.stringify(state));
  generateAIvsAIDecks(recovered);
  return {expected:state.menu.decks.map(d=>d.deck),actual:recovered.deckBuilder.selections.map(d=>d.map(c=>c.id))};
 });
 expect(result.expected.map(d=>d.length)).toEqual([20,20]);
 expect(result.actual).toEqual(result.expected);
 console.log('PASS: both AI seats use exact saved decks after JSON recovery');
 // Exercise the actual controls with real catalog-based saved-deck fixtures.
 // These are local UI fixtures, not a claim of live account/permission testing.
 for (const scenario of ['saved', 'domains', 'build', 'spectate']) {
  await page.reload();
  await page.waitForFunction(()=>!document.body.hasAttribute('data-loading'));
  const expected=await page.evaluate(async()=>{
   const state=(await import('/js/ui/input/dragAndDrop.js')).getLatestState();
   const {deckCatalogs}=await import('/js/cards/index.js');
   const fixture=(domain)=>[['Predator',6],['Prey',7],['Spell',4],['Free Spell',2],['Trap',1]].flatMap(([type,n])=>deckCatalogs[domain].filter(c=>c.type===type).slice(0,n).map(c=>c.id));
   state.menu.decks=[{id:'qa-fish',name:'Saved fish',deck:fixture('fish')},{id:'qa-frog',name:'Saved frogs',deck:fixture('amphibian')}];
   state.menu.aiSpeed='paused';
   return state.menu.decks.map(d=>d.deck);
  });
  await page.locator('#menu-other').click();
  await page.locator('[data-difficulty="trueSim"]').click();
  if(scenario==='spectate') {
   await page.locator('.practice-advanced summary').click();
   await page.locator('#ai-vs-ai').click();
   await page.locator('#spectate-left-deck').selectOption('saved:qa-frog');
   await page.locator('#spectate-right-deck').selectOption('saved:qa-fish');
   await page.locator('#ai-vs-ai-start').click();
  } else {
   await page.locator('#practice-player-deck').selectOption(scenario==='saved'?'saved:qa-fish':scenario==='domains'?'domain:bird':'build');
   await page.locator('#practice-ai-deck').selectOption(scenario==='domains'?'domain:mammal':'saved:qa-frog');
   await page.locator('#ai-start-game').click();
   if(scenario==='build') {
    await page.locator('.deck-select-panel--fish .deck-name').click();
    await page.locator('#deck-random').click();
    await page.locator('#deck-confirm').click();
   }
  }
  const actual=await page.evaluate(async()=>{
   const s=(await import('/js/ui/input/dragAndDrop.js')).getLatestState();
   return {mode:s.menu.mode,stage:s.deckBuilder.stage,difficulty:s.menu.aiDifficulty,domains:s.deckSelection.selections,cards:s.deckBuilder.selections.map(d=>d.map(c=>c.id)),runtime:s.players.map(p=>[...p.deck,...p.hand].map(c=>c.id))};
  });
  expect(actual.stage).toBe('complete');
  expect(actual.difficulty).toBe('trueSim');
  expect(actual.cards.map(d=>d.length)).toEqual([20,20]);
  expect(actual.runtime.map(d=>d.length)).toEqual([20,20]);
  if(scenario==='saved') expect(actual.cards).toEqual(expected);
  if(scenario==='build') expect(actual.cards[1]).toEqual(expected[1]);
  if(scenario==='domains') expect(actual.domains).toEqual(['bird','mammal']);
  if(scenario==='spectate') {expect(actual.mode).toBe('aiVsAi');expect(actual.cards).toEqual([expected[1],expected[0]]);}
  for(let i=0;i<2;i++)expect([...actual.runtime[i]].sort()).toEqual([...actual.cards[i]].sort());
  console.log(`PASS actual ${scenario} controls: chosen decks reach both runtime seats; difficulty retained`);
 }

} finally {await browser.close();server.kill();}
