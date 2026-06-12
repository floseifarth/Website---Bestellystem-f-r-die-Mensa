import { supabase } from "./supabaseClient.js";

async function ermittleVorname(user) {
    const fullName = (user.user_metadata?.full_name || "").trim();
    if (fullName) {
        return fullName.split(/\s+/)[0];
    }

    const email = (user.email || "").trim();
    if (!email) {
        return "Gast";
    }

    const { data, error } = await supabase
        .from("students")
        .select("Vorname")
        .ilike("email", email)
        .maybeSingle();

    if (!error && data?.Vorname) {
        return data.Vorname;
    }

    return email;
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

function firstNonEmpty(...values) {
    for (const value of values) {
        if (value === null || value === undefined) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return "";
}

function deriveRzKennung(profileData, user) {
    const explicit = firstNonEmpty(
        profileData?.["RZ-Kennung"],
        profileData?.RZ_Kennung,
        profileData?.rz_kennung,
        profileData?.username,
        profileData?.["RZ Kennung"]
    );
    if (explicit) return explicit;

    const email = firstNonEmpty(profileData?.email, profileData?.["E-Mail"], user?.email);
    if (email.includes("@")) {
        return email.split("@")[0];
    }
    return "";
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

    const email = firstNonEmpty(profileData.email, profileData["E-Mail"], user.email, "-");
    const rzKennung = deriveRzKennung(profileData, user);
    const vorname = firstNonEmpty(profileData.Vorname, profileData.vorname);
    const nachname = firstNonEmpty(profileData.Nachname, profileData.nachname);

    const matrikelnummer = firstNonEmpty(profileData.Matrikelnummer, profileData.matrikelnummer);

    profileContainer.innerHTML = `
        <div class="profil-datenkarte">
            <div class="profil-datenzeile">
                <span class="profil-label">Vorname</span>
                <span class="profil-value">${formatValue(vorname || "-")}</span>
            </div>
            <div class="profil-datenzeile">
                <span class="profil-label">Nachname</span>
                <span class="profil-value">${formatValue(nachname || "-")}</span>
            </div>
            <div class="profil-datenzeile">
                <span class="profil-label">RZ-Kennung</span>
                <span class="profil-value">${formatValue(rzKennung || "-")}</span>
            </div>
            <div class="profil-datenzeile">
                <span class="profil-label">Matrikelnummer</span>
                <span class="profil-value">${formatValue(matrikelnummer || "-")}</span>
            </div>
            <div class="profil-datenzeile">
                <span class="profil-label">E-Mail</span>
                <span class="profil-value">${formatValue(email)}</span>
            </div>
        </div>
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
