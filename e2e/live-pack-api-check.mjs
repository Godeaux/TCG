// Opt-in: operator provisions one explicitly synthetic owner with ONE pack.
// Session file contains a temporary QA bearer token; never log or commit it.
import { readFile,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
if(process.env.TCG_LIVE_PACK_QA!=='1'||!process.env.TCG_QA_SESSION)throw Error('Explicit live QA fixture required');
const c=JSON.parse(await readFile(process.env.TCG_QA_SESSION,'utf8'));
const call=async(name,body={})=>{
  const r=await fetch(`${c.base}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:c.key,Authorization:`Bearer ${c.token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  return {status:r.status,data:await r.json()};
};
const before=await call('tcg_economy');
assert.equal(before.status,200);assert.equal(before.data.profile_id,c.profileId);assert.equal(before.data.packs,1);
// Distinct HTTP requests in flight together, not a single PGlite connection.
const concurrent=await Promise.all([c.openingA,c.openingB].map(p_opening=>call('tcg_open_pack',{p_opening})));
const success=concurrent.filter(r=>r.status===200),refusal=concurrent.filter(r=>r.status!==200);
assert.equal(success.length,1);assert.equal(refusal.length,1);assert.equal(refusal[0].data.code,'22023');
assert.equal(success[0].data.economy.packs,0);
const receipt=success[0].data.receipt;
assert.equal(receipt.cards.length,5);assert(receipt.cards.some(c=>c.rarity_rank>=1));
const retries=await Promise.all(Array.from({length:5},()=>call('tcg_open_pack',{p_opening:receipt.opening_id})));
for(const r of retries){assert.equal(r.status,200);assert.deepEqual(r.data.receipt,receipt);assert.equal(r.data.economy.packs,0);}
const after=await call('tcg_economy');assert.equal(after.data.packs,0);
const result={test:'real Supabase authenticated overlapping HTTP requests',distinctOpeningStatuses:concurrent.map(r=>r.status),successfulDebits:success.length,refused:refusal.length,retries:retries.length,balance:after.data.packs,receiptStable:true};
if(process.env.TCG_QA_RESULT)await writeFile(process.env.TCG_QA_RESULT,JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
