// Real production UI/client; only Supabase transport is replaced. No live writes.
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn('python3',['-m','http.server','8231','--bind','127.0.0.1'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,300));
const browser=await chromium.launch(process.env.TCG_CHROME ? {executablePath:process.env.TCG_CHROME} : {});
try {
  const context=await browser.newContext();
  await context.route('**/*.supabase.co/**',r=>r.abort());
  await context.route(u=>u.pathname==='/js/network/supabaseClient.js',r=>r.fulfill({contentType:'text/javascript',body:`
    const chain = new Proxy(function(){}, { get: (_, p) => p==='then' ? (resolve)=>resolve({data:null,error:window.qaMode==='legacy'?{message:'Debit refused'}:null}) : ()=>chain });
    export const supabase = {
      auth: { getSession:async()=>({data:{session:{user:{id:'qa-user'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) },
      from:()=>chain,channel:()=>chain,removeChannel:()=>{},rpc:async(name,args)=>window.qaRPC(name,args)
    };
  `}));
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.qaCalls=[];window.qaMode='managed';window.qaPacks=1;window.qaReceipt=null;
    window.qaRPC=async(name,args)=>{
      window.qaCalls.push({name,args});
      const economy=()=>({profile_id:'qa-profile',packs:window.qaPacks,inventory:window.qaReceipt?[{card_id:'fish-prey-atlantic-flying-fish',rarity_rank:1}]:[]});
      if(name==='tcg_economy')return {data:window.qaMode==='legacy'?null:economy()};
      if(name==='tcg_open_pack'){
        if(window.qaMode==='refuse')return {error:{message:'Server refused opening'}};
        if(!window.qaReceipt){
          window.qaPacks--;
          window.qaReceipt={profile_id:'qa-profile',opening_id:args.p_opening,packs_after:window.qaPacks,cards:Array.from({length:5},()=>({card_id:'fish-prey-atlantic-flying-fish',rarity_rank:1}))};
        }
        if(window.qaMode==='lost'){window.qaMode='managed';return {error:{message:'Response lost'}};}
        return {data:{receipt:window.qaReceipt,economy:economy()}};
      }
      throw Error('Unexpected RPC '+name);
    };
  });
  await page.goto('http://127.0.0.1:8231');
  await page.waitForFunction(()=>window.__qa);
  const prepare=async(mode,packs=1)=>page.evaluate(async({mode,packs})=>{
    window.qaMode=mode;
    const {createGameState}=await import('/js/state/gameState.js');
    const {renderGame}=await import('/js/ui.js');
    const state=createGameState();state.menu.stage='collection';
    state.menu.profile={id:'qa-profile',username:'QA',packs,ownedCards:new Map()};
    state.menu.profile.pendingPackOpening = (await import('/js/network/supabaseApi.js')).getServerEconomyClient().hasPending('qa-profile');
    window.qaState=state;
    renderGame(state,{onUpdate:()=>renderGame(state)});
  },{mode,packs});
  await prepare('refuse');
  await page.locator('[data-pe="packs"]').click();
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>qaState.menu.stage),'collection');
  assert.equal(await page.evaluate(()=>qaReceipt),null);
  // Commit succeeds, response lost: no animation; retry must reuse persisted ID.
  await prepare('lost');
  await page.locator('[data-pe="packs"]').click();
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>qaState.menu.stage),'collection');
  assert.equal(await page.evaluate(()=>qaPacks),0);
  await prepare('managed',0);
  await page.locator('[data-pe="packs"]').click();
  await expect(page.locator('#pack-opening-overlay')).toHaveClass(/active/);
  const opened=await page.evaluate(()=>({receipt:qaState.menu.serverPackReceipt,packs:qaState.menu.profile.packs,ids:qaCalls.filter(c=>c.name==='tcg_open_pack').map(c=>c.args.p_opening)}));
  assert.equal(opened.packs,0);assert.equal(new Set(opened.ids).size,1);
  await page.locator('#pack-unopened').focus();await page.keyboard.down('Space');
  await page.waitForTimeout(1700);await page.keyboard.up('Space');
  await page.locator('#pack-reveal-all').click();
  await expect(page.locator('#pack-done')).toBeVisible();
  await page.locator('#pack-done').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('tcg:pack-intent:v1:qa-profile')),null);
  assert.equal(await page.evaluate(()=>qaState.menu.profile.ownedCards.get('fish-prey-atlantic-flying-fish')),'uncommon');
  await prepare('legacy');
  await page.locator('[data-pe="packs"]').click();
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>qaState.menu.stage),'collection');
  assert.equal(await page.evaluate(()=>qaState.menu.profile.packs),1);
  assert.deepEqual(errors,[]);
  console.log('PASS production pack UI: refusal, lost response, same-ID recovery at zero, server cards revealed, durable acknowledgment. Supabase IO mocked.');
}finally{await browser.close();server.kill();}
