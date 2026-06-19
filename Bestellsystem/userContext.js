import { supabase } from "./supabaseClient.js";

export async function resolveStudentProfile(user) {
    if (!user?.id && !user?.email) {
        return null;
    }

    let profile = null;

    if (user?.id) {
        const { data, error } = await supabase
            .from("students")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();

        if (!error && data) {
            profile = data;
        }
    }

    if (!profile && user?.email) {
        const { data, error } = await supabase
            .from("students")
            .select("*")
            .ilike("email", user.email)
            .maybeSingle();

        if (!error && data) {
            profile = data;
        }
    }

    return profile;
}

export function resolveDisplayName(user, profile) {
    const profileVorname = String(profile?.vorname || profile?.Vorname || "").trim();
    if (profileVorname) {
        return profileVorname;
    }

    const fullName = String(user?.user_metadata?.full_name || "").trim();
    if (fullName) {
        return fullName.split(/\s+/)[0];
    }

    const email = String(profile?.email || user?.email || "").trim();
    if (email.includes("@")) {
        return email.split("@")[0];
    }

    return email || "Gast";
}

export function resolvePreferredEmail(user, profile) {
    return String(profile?.email || user?.email || "").trim();
}

export async function loadCurrentUserContext() {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const user = sessionData?.session?.user || null;

    if (sessionError || !user) {
        return {
            user: null,
            profile: null,
            displayName: "Gast",
            email: "",
            sessionError: sessionError || null
        };
    }

    const profile = await resolveStudentProfile(user);
    return {
        user,
        profile,
        displayName: resolveDisplayName(user, profile),
        email: resolvePreferredEmail(user, profile),
        sessionError: null
    };
}