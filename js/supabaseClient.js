import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/esm/supabase.js";

const SUPABASE_URL = "https://cjjkzcvfphagkwsejsoe.supabase.co";
const SUPABASE_KEY = "sb_publishable_vExmBDfe9xUfryt0pQhtgQ_crJZTH47";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
