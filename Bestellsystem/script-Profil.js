import { supabase } from "./supabaseClient.js";

async function ermittleVorname(user) {
    const fullName = (user.user_metadata?.full_name || "").trim();
    if (fullName) {
        return fullName.split(/\s+/)[0];
    }

    const email = (user.email || "").trim();
    if (email) {
        const { data, error } = await supabase
            .from("students")
            .select("Vorname")
            .ilike("email", email)
            .maybeSingle();

        if (error) {
            console.warn("Vorname konnte nicht aus students geladen werden:", error.message);
        } else {
            const vornameDb = (data?.Vorname || "").trim();
            if (vornameDb) {
                return vornameDb;
            }
        }
    }

    return "Gast";
}

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

async function abmelden() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error("Abmelden fehlgeschlagen:", error);
        return;
    }

    window.location.href = "Anmeldestartseite.html";
}

function renderProfile(profileData, user) {
    const profileContainer = document.getElementById("profile-container");
    if (!profileContainer) return;

    if (!profileData) {
        profileContainer.innerHTML = "<p>Es wurden noch keine Profildaten gefunden.</p>";
        return;
    }

    const email = profileData.email || profileData["E-Mail"] || user.email || "-";
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
            .from("students")
            .select("*")
            .ilike("email", email)
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
            .from("students")
            .select("*")
            .eq("user_id", user.id)
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

    // Vorname aus Auth-Metadaten oder aus students ermitteln.
    const displayName = await ermittleVorname(user);

    // Namen rechts oben im Profil-Bereich einsetzen.
    const nameElement = document.getElementById("user-display-name");
    if (nameElement) {
        nameElement.textContent = displayName;
    }

    const logoutButton = document.getElementById("btn-abmelden");
    if (logoutButton) {
        logoutButton.addEventListener("click", abmelden);
    }

    await ladeProfildaten(user);

});
