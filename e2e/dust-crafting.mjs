// Real UI and real migrated SQL. Only Supabase transport/identity are local fixtures.
import {chromium,expect} from '@playwright/test';
import {PGlite} from '@electric-sql/pglite';
import {readFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const server=spawn('python3',['-m','http.server','8241','--bind','127.0.0.1'],{stdio:'ignore'});
const browser=await chromium.launch(process.env.TCG_CHROME?{executablePath:process.env.TCG_CHROME}:{});
try {
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;create table public.profiles(id uuid primary key);create table public.lobbies(id bigint primary key);insert into auth.users values('${id(101)}');insert into public.profiles values('${id(1)}');`);
for(const file of ['001-foundation-candidate.sql','002-reward-settlement-candidate.sql','003-pack-opening-candidate.sql','004-authenticated-packs.sql','009-dust-crafting.sql'])await db.exec(await readFile(new URL('../docs/release-1.0-staging/'+file,import.meta.url),'utf8'));
await db.exec(`insert into tcg_private.profile_owners(profile_id,auth_user_id) values('${id(1)}','${id(101)}');insert into tcg_private.economy_accounts(profile_id,packs,dust) values('${id(1)}',0,128);insert into tcg_private.pack_catalog values('fish-prey-atlantic-flying-fish');insert into tcg_private.card_finishes values('${id(1)}','fish-prey-atlantic-flying-fish',0,3);insert into tcg_private.card_inventory values('${id(1)}','fish-prey-atlantic-flying-fish',0);set role authenticated;set request.jwt.claim.sub='${id(101)}'`);
let lose=false;
const context=await browser.newContext();
await context.route('**/*.supabase.co/**',r=>r.abort());
await context.exposeBinding('dustRPC',async(_,name,args)=>{
 try {
 let result;
 if(name==='tcg_economy')result=await db.query('select public.tcg_economy() r');
 else if(name==='tcg_dust_action')result=await db.query('select public.tcg_dust_action($1,$2,$3,$4) r',[args.p_operation,args.p_action,args.p_card,args.p_rarity]);
 else throw Error('Unexpected RPC '+name);
 if(lose&&name==='tcg_dust_action'){lose=false;return {error:{message:'Response lost. Retry to recover.'}}}
 return {data:result.rows[0].r};
 }catch(e){return {error:{message:e.message,code:e.code}}}
});
await context.route(u=>u.pathname==='/js/network/supabaseClient.js',r=>r.fulfill({contentType:'text/javascript',body:`const chain=new Proxy(function(){},{get:(_,p)=>p==='then'?(resolve)=>resolve({data:[],error:null}):()=>chain});export const supabase={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>chain,channel:()=>chain,removeChannel:()=>{},rpc:(n,a)=>window.dustRPC(n,a)};`}));
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir('docs/dust-crafting',{recursive:true});
const prepare=async()=>{
 await page.goto('http://127.0.0.1:8241');
 await page.evaluate(async profileId=>{
 const {createGameState}=await import('/js/state/gameState.js');const {renderGame}=await import('/js/ui.js');const {applyServerEconomy}=await import('/js/network/serverEconomy.js');
 const state=createGameState();state.menu.stage='collection';state.menu.profile={id:profileId,username:'QA',packs:0,ownedCards:new Map()};
 applyServerEconomy(state.menu.profile,(await window.dustRPC('tcg_economy')).data);window.dustState=state;renderGame(state,{onUpdate:()=>renderGame(state)});
 },id(1));
 if(await page.locator('[data-pe="toggle-filters"]').isVisible())await page.locator('[data-pe="toggle-filters"]').click();
 await page.locator('#pe-ownership').selectOption('all');
 if(await page.locator('[data-pe="toggle-filters"]').isVisible())await page.locator('[data-pe="toggle-filters"]').click();
};
for(const [width,height,min,max] of [[393,852,3,5],[1440,900,2,6],[1920,1080,2,6],[320,568,3,5]]){
 await page.setViewportSize({width,height});await prepare();
 const defaultRows=width===320?5:min; // persisted mobile preference from prior viewport.
 await expect(page.locator('[data-rows]')).toHaveText(`${defaultRows} rows`);
 for(let rows=defaultRows;rows<max;rows++)await page.locator('[data-pe="smaller-cards"]').click();
 await expect(page.locator('[data-pe="smaller-cards"]')).toBeDisabled();
 const fit=await page.locator('.pe-pagination').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight);expect(fit).toBe(true);
 const thumbs = await page.locator('.pe-density-grid .pe-tile').evaluateAll(tiles => tiles.map(tile => {
   const face=tile.querySelector('.canonical-card'),box=face.getBoundingClientRect(),hit=tile.getBoundingClientRect();
   return {ratio:box.width/box.height,hitWidth:hit.width,hitHeight:hit.height,hidden:getComputedStyle(face.querySelector('.card-inner')).visibility,art:getComputedStyle(face.querySelector('.pe-art-face')).display,count:parseFloat(getComputedStyle(tile.querySelector('.pe-rarity')).fontSize)};
 }));
 for(const t of thumbs){expect(Math.abs(t.ratio-5/7)).toBeLessThan(.006);expect(t.hitWidth).toBeGreaterThanOrEqual(44);expect(t.hitHeight).toBeGreaterThanOrEqual(44);expect(t.hidden).toBe('hidden');expect(t.art).toBe('block');expect(t.count).toBeGreaterThanOrEqual(11);}
 await page.screenshot({animations:'disabled',path:`docs/dust-crafting/${width}-dense.png`});
 for(let rows=max;rows>min;rows--)await page.locator('[data-pe="larger-cards"]').click();
 await expect(page.locator('[data-pe="larger-cards"]')).toBeDisabled();
 if(width===1920)await expect(page.locator('.pe-density-grid')).toHaveAttribute('data-art-only','false');
 await page.screenshot({animations:'disabled',path:`docs/dust-crafting/${width}-default.png`});
 if(width<=700){await page.locator('[data-pe="toggle-filters"]').click();await page.screenshot({animations:'disabled',path:`docs/dust-crafting/${width}-filters.png`});await page.keyboard.press('Escape');}
 await page.locator('[data-pe="next-page"]').click();await page.waitForTimeout(500);
 const anchor=await page.locator('.pe-density-grid').evaluate(g=>[...g.querySelectorAll('[data-card]')].find(e=>e.getBoundingClientRect().left>=g.getBoundingClientRect().left-1)?.dataset.card);
 await page.locator('[data-pe="smaller-cards"]').click();
 await expect.poll(()=>page.locator(`[data-card="${anchor}"]`).evaluate(e=>{const r=e.getBoundingClientRect(),g=e.parentElement.getBoundingClientRect();return r.left>=g.left-1&&r.right<=g.right+1})).toBe(true);
 await page.locator('#pe-search').fill('no matching card here');
 await expect(page.locator('.pe-density-grid .pe-empty')).toBeVisible();
 expect(await page.locator('.pe-density-grid .pe-empty').evaluate(e=>{const r=e.getBoundingClientRect(),g=e.parentElement.getBoundingClientRect();return r.right<=g.right+1&&r.bottom<=g.bottom+1})).toBe(true);
 await page.locator('#pe-search').fill('Atlantic Flying Fish');await expect(page.locator('[data-pe="next-page"]')).toBeDisabled();
 await page.locator('[data-pe="craft-tab"]').click();await page.locator('.pe-density-grid .pe-tile').click();
 await expect(page.locator('.pe-crafting-dialog')).toBeVisible();await expect(page.locator('[data-pe="craft-finish"][data-rank="0"]')).toHaveCount(0);
 await expect(page.locator('[data-pe="craft-finish"][data-rank="4"]')).toBeDisabled();
 await page.screenshot({animations:'disabled',path:`docs/dust-crafting/${width}-craft.png`});
 await page.locator('[data-pe="craft-finish"][data-rank="4"]').scrollIntoViewIfNeeded();
 expect(await page.locator('.pe-crafting-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 expect(await page.locator('.pe-crafting-dialog [data-pe="close-dialog"]').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})).toBe(true);
 await page.screenshot({animations:'disabled',path:`docs/dust-crafting/${width}-craft-bottom.png`});
 await page.keyboard.press('Escape');await expect(page.locator('.pe-crafting-dialog')).not.toBeVisible();await expect(page.locator('.pe-density-grid .pe-tile')).toBeFocused();
 if(width>700)await page.locator('[data-pe="larger-cards"]').click();
 if(width===393){for(let rows=min+1;rows<max;rows++)await page.locator('[data-pe="smaller-cards"]').click();}
}
// Presentation stress only: large values must fit; reload authoritative SQL before spending.
await page.evaluate(async()=>{dustState.menu.profile.dust=123456789;dustState.menu.profile.cardFinishes[0].quantity=98765;(await import('/js/ui.js')).renderGame(dustState)});
await expect(page.locator('.pe-dust')).toHaveText('✧ 123M');
expect(await page.locator('.pe-craft-toolbar').evaluate(e=>[...e.querySelectorAll('button,span')].every(n=>n.getBoundingClientRect().right<=innerWidth))).toBe(true);
await page.screenshot({animations:'disabled',path:'docs/dust-crafting/320-large-balances.png'});
await prepare();await page.locator('#pe-search').fill('Atlantic Flying Fish');await page.locator('[data-pe="craft-tab"]').click();
// Commit, lose response, reload, recover: no second debit, ownership refreshes.
await page.locator('.pe-density-grid .pe-tile').click();lose=true;
await page.locator('[data-pe="craft-finish"][data-rank="1"]').click();
await expect(page.locator('.pe-dialog-error')).toContainText('Response lost');
await prepare();await page.locator('[data-pe="recover-dust"]').click();
await expect(page.locator('[data-pe="recover-dust"]')).toHaveCount(0);
expect(await page.evaluate(()=>dustState.menu.profile.dust)).toBe(112);
await page.locator('[data-pe="recycle-extras"]').click();
await expect(page.locator('[data-pe="recycle-extras"]')).toBeDisabled();
expect(await page.evaluate(()=>dustState.menu.profile.dust)).toBe(114);
expect((await db.query('select public.tcg_economy() r')).rows[0].r.finishes.map(f=>f.quantity)).toEqual([1,1]);
expect(errors).toEqual([]);
console.log('PASS real collection UI + migrated SQL: density bounds, persisted preference, anchor, missing-only craft, insufficient dust, response-loss recovery and one-click recycling. Local identity/transport fixtures, not live enrollment.');
}finally{await browser.close();server.kill();await db.close()}
