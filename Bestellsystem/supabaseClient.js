import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Nur URL + anon key im Frontend verwenden (niemals service_role key).
//Timo Supabase
const supabaseUrl = "https://qigqefdghcxerfpzxhmj.supabase.co";
const supabaseAnonKey = "sb_publishable_4uUlhkAJ9vyW8OQcfXK8AQ_NC-zX2Iv";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);