import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://cjjkzcvfphagkwsejsoe.supabase.co';
const SUPABASE_KEY = 'sb_publishable_vExmBDfe9xUfryt0pQhtgQ_crJZTH47';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
