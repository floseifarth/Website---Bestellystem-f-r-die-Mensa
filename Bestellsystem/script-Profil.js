import { supabase } from "./supabaseClient.js";

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatValue(value) {
    if (value === null || value === undefined) return "-";
    const text = String(value).trim();
    return text ? escapeHtml(text) : "-";
}

function renderProfile(profileData, user) {
    const profileContainer = document.getElementById("profile-container");
    if (!profileContainer) return;

    if (!profileData) {
        profileContainer.innerHTML = "<p>Es wurden noch keine Profildaten gefunden.</p>";
        return;
    }

    const email = profileData["E-Mail"] || user.email || "-";
    const fullName = [profileData.Vorname, profileData.Nachname]
        .map((v) => (v || "").trim())
        .filter(Boolean)
        .join(" ");

    profileContainer.innerHTML = `
        <p><strong>Name:</strong> ${formatValue(fullName || "-")}</p>
        <p><strong>Benutzername:</strong> ${formatValue(profileData["RZ-Kennung"])}</p>
        <p><strong>Matrikelnummer:</strong> ${formatValue(profileData.Matrikelnummer)}</p>
        <p><strong>Studiengang:</strong> ${formatValue(profileData.Studiengang)}</p>
        <p><strong>E-Mail:</strong> ${formatValue(email)}</p>
        
        
    `;
}

async function ladeProfildaten(user) {
    const email = (user.email || "").trim();
    let profileData = null;
    let lastError = null;

    // Primaere Suche: ueber die hinterlegte E-Mail.
    if (email) {
        const { data, error } = await supabase
            .from("RegistriertePersonen")
            .select("*")
            .ilike("E-Mail", email)
            .maybeSingle();

        if (error) {
            lastError = error;
        } else {
            profileData = data;
        }
    }

    // Fallback: falls in der Tabelle ein Auth-User-ID Mapping existiert.
    if (!profileData) {
        const { data, error } = await supabase
            .from("RegistriertePersonen")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();

        if (error) {
            lastError = error;
        } else {
            profileData = data;
        }
    }

    if (lastError && !profileData) {
        console.error("Fehler beim Laden der Profildaten:", lastError);
    }

    renderProfile(profileData, user);
}


// Seite ist bereit – Session und Name laden.
document.addEventListener("DOMContentLoaded", async function () {

    // Aktuelle Supabase-Session abrufen (gespeichert nach dem Login).
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;

    // Kein eingeloggter User? Zurueck zur Anmeldeseite.
    if (!user) {
        window.location.href = "Anmeldestartseite.html";
        return;
    }

    // Anzeigenamen aus den User-Metadaten holen.

    const displayName =
        user.user_metadata?.full_name ||       // Alternativ: vollstaendiger Name
        user.user_metadata?.display_name ||   // Benutzerdefinierter Anzeigename
        user.email;                            // Fallback: E-Mail-Adresse

    // Namen rechts oben im Profil-Bereich einsetzen.
    const nameElement = document.getElementById("user-display-name");
    if (nameElement) {
        nameElement.textContent = displayName;
    }

    await ladeProfildaten(user);

});
