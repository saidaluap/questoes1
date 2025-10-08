// supabaseClient.js
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY; // ou ANON_KEY se preferir esse nome
const supabase = createClient(supabaseUrl, supabaseKey);
module.exports = supabase;
