import { supabase } from "./supabaseClient.js";
import { loadCurrentUserContext, resolveStudentProfile } from "./userContext.js";
async function aktualisiereBestellstatusHeader(userId) {
    const badge = document.getElementById("bestellstatus-badge");
    if (!badge) return;

    const heute = new Date();
    const isoHeute = heute.getFullYear() + "-" +
        String(heute.getMonth() + 1).padStart(2, "0") + "-" +
        String(heute.getDate()).padStart(2, "0");

    const { data } = await supabase
        .from("Bestellungen")
        .select("id")
        .eq("auth_user_id", userId)
        .eq("bestell_datum", isoHeute)
        .limit(1);

    const hatBestellung = Array.isArray(data) && data.length > 0;
    const stunde = heute.getHours();
    const minute = heute.getMinutes();
    const zeitInMinuten = stunde * 60 + minute;
    const ist1200 = 12 * 60;
    const ist1330 = 13 * 60 + 30;

    badge.style.display = "inline-block";
    badge.className = "bestellstatus-badge";

    if (zeitInMinuten >= ist1200 && zeitInMinuten < ist1330) {
        badge.classList.add("badge-essensvergabe");
        badge.textContent = "Essensvergabe";
    } else if (hatBestellung) {
        badge.classList.add("badge-vorbestellt");
        badge.textContent = "Vorbestellt";
    } else {
        badge.classList.add("badge-keine");
        badge.textContent = "Keine aktive Bestellung";
    }
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

    window.location.href = "index.html";
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
    const profileData = await resolveStudentProfile(user);
    renderProfile(profileData, user);
}


// Seite ist bereit – Session und Name laden.
document.addEventListener("DOMContentLoaded", async function () {

    // Aktuelle Supabase-Session abrufen (gespeichert nach dem Login).
    const userContext = await loadCurrentUserContext();
    const user = userContext.user;

    // Kein eingeloggter User? Zurueck zur Anmeldeseite.
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    // Vorname aus Auth-Metadaten oder aus students ermitteln.
    // Namen rechts oben im Profil-Bereich einsetzen.
    const nameElement = document.getElementById("user-display-name");
    if (nameElement) {
        nameElement.textContent = userContext.displayName;
    }
    aktualisiereBestellstatusHeader(user.id);
    const logoutButton = document.getElementById("btn-abmelden");
    if (logoutButton) {
        logoutButton.addEventListener("click", abmelden);
    }

    await ladeProfildaten(user);

});
