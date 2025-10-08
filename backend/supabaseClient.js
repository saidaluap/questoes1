// supabaseClient.js
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://[seu-project-url].supabase.co'; // copie o seu
const supabaseKey = '[sua-api-key]'; // copie a sua anon/public key do dashboard
const supabase = createClient(supabaseUrl, supabaseKey);
module.exports = supabase;