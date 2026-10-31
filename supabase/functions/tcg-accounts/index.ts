import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { accountHandler } from './handler.js';
const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const options = {auth:{persistSession:false,autoRefreshToken:false}};
const admin = createClient(url,serviceKey,options);
Deno.serve(accountHandler({
  admin,
  passwordClient:()=>createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,options),
  // Deploy this enabled entrypoint only after the coordinated policy/reset cutover.
  ready:true,
  ipHash:async(request:Request)=>{
    const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));
    return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  },
}));
