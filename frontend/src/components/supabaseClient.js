import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://<sua-url-do-supabase>.supabase.co';
const supabaseAnonKey = '<sua-public-anon-key>';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
