import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

//Server
const directSupabaseUrl = "http://212.71.201.100:8000";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgxNTk4NTIzLCJleHAiOjE5MzkyNzg1MjN9.uv8Wigy92Vg448yYm5GXSCnvZBfBPBFZy96CBtkCD5M";

function resolveSupabaseUrl() {
    if (typeof window !== "undefined" && window.location.protocol === "https:") {
        return `${window.location.origin}/api/supabase`;
    }

    return directSupabaseUrl;
}

export const supabase = createClient(resolveSupabaseUrl(), supabaseAnonKey);