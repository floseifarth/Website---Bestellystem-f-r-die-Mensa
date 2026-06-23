import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Nur URL + anon key im Frontend verwenden (niemals service_role key).
//Timo Supabase
//const supabaseUrl = "https://qigqefdghcxerfpzxhmj.supabase.co";
//const supabaseAnonKey = "sb_publishable_4uUlhkAJ9vyW8OQcfXK8AQ_NC-zX2Iv";

//Server
const directSupabaseUrl = "http://212.71.201.100:8000";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgxNTk4NTIzLCJleHAiOjE5MzkyNzg1MjN9.uv8Wigy92Vg448yYm5GXSCnvZBfBPBFZy96CBtkCD5M";

function isLocalDevelopmentHost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function resolveSupabaseUrl() {
    if (typeof window !== "undefined" && window.location.protocol === "https:") {
        return `${window.location.origin}/api/supabase`;
    }

    if (typeof window !== "undefined" && !isLocalDevelopmentHost(window.location.hostname)) {
        return `${window.location.origin}/api/supabase`;
    }

    return directSupabaseUrl;
}

export const supabase = createClient(resolveSupabaseUrl(), supabaseAnonKey);