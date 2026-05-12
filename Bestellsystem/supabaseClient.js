import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Nur URL + anon key im Frontend verwenden (niemals service_role key).
//Timo Supabase
const supabaseUrl = "https://qigqefdghcxerfpzxhmj.supabase.co";
const supabaseAnonKey = "sb_publishable_4uUlhkAJ9vyW8OQcfXK8AQ_NC-zX2Iv";

//Flo Supabase
//const supabaseUrl = "https://ghhqyjmoovsxrkyzxppb.supabase.co";
//const supabaseAnonKey = "sb_publishable_ESiDPxYboQbnR1ROIHB6CA_dgKXjtlt";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);