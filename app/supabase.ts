import {createClient} from '@supabase/supabase-js';

const supabaseUrl='https://vsitkmfxucycjzaibuxs.supabase.co';
const supabasePublishableKey='sb_publishable_OwBIBITXjoVXtg5c7g6sMA_7Y2gcls2';

export const supabase=createClient(supabaseUrl,supabasePublishableKey,{
 auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
