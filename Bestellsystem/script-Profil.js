import { supabase } from "./supabaseClient.js";
import { loadCurrentUserContext, resolveStudentProfile } from "./userContext.js";
import { escapeHtml } from "./escapeHtml.js";

const BADGE_CACHE_KEY = "mensa-badge-status-v1";
const BADGE_CACHE_TTL_MS = 90 * 1000; // 90 Sekunden

function todayIso() {
    return new Date().toISOString().split("T")[0];
}

function readCachedBadge() {
    try {
        const raw = sessionStorage.getItem(BADGE_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        const age = Date.now() - Number(parsed.cachedAt || 0);
        if (!Number.isFinite(age) || age > BADGE_CACHE_TTL_MS) return null;
        if (parsed.isoDate !== todayIso()) return null;
        return parsed;
    } catch (_error) {
        return null;
    }
}

function writeCachedBadge(userId, className, textContent) {
    try {
        if (!userId) {
            sessionStorage.removeItem(BADGE_CACHE_KEY);
            return;
        }
        sessionStorage.setItem(BADGE_CACHE_KEY, JSON.stringify({
            userId,
            className,
            textContent,
            isoDate: todayIso(),
            cachedAt: Date.now()
        }));
    } catch (_error) {
        // Ignore cache errors
    }
}

function applyBadgeState(badge, className, textContent) {
    if (!badge) return;
    badge.style.display = "inline-block";
    badge.className = className || "bestellstatus-badge";
    badge.textContent = textContent || "Keine aktive Bestellung";
}

async function aktualisiereBestellstatusHeader(userId) {
    const badge = document.getElementById("bestellstatus-badge");
    if (!badge) return;

    // Zuerst Cache auslesen (schnell)
    const cached = readCachedBadge();
    if (cached) {
        applyBadgeState(badge, cached.className, cached.textContent);
    }

    const heute = new Date();
    const isoHeute = heute.getFullYear() + "-" +
        String(heute.getMonth() + 1).padStart(2, "0") + "-" +
        String(heute.getDate()).padStart(2, "0");

    try {
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
        const ist1315 = 13 * 60 + 15;

        let className = "bestellstatus-badge";
        let textContent = "Keine aktive Bestellung";

        if (zeitInMinuten >= ist1200 && zeitInMinuten < ist1315 && hatBestellung) {
            className += " badge-essensvergabe";
            textContent = "Essensvergabe";
        } else {
            className += " badge-keine";
            textContent = "Keine aktive Bestellung";
        }

        applyBadgeState(badge, className, textContent);
        writeCachedBadge(userId, className, textContent);
    } catch (error) {
        console.error("Fehler beim Badge-Update:", error);
    }
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

async function ladeProfildaten(user, initialProfile) {
    if (initialProfile) {
        renderProfile(initialProfile, user);
    }

    const profileData = await resolveStudentProfile(user);
    if (profileData) {
        renderProfile(profileData, user);
        return;
    }

    if (!initialProfile) {
        renderProfile(null, user);
    }
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

    // Badge mit Bestellstatus aktualisieren
    if (user) {
        try {
            await aktualisiereBestellstatusHeader(user.id);
            console.log("Badge aktualisiert für user", user.id);
        } catch (error) {
            console.error("Fehler beim Badge-Update:", error);
        }
    }

    if (userContext.profile) {
        renderProfile(userContext.profile, user);
    } else {
        const profileContainer = document.getElementById("profile-container");
        if (profileContainer) {
            profileContainer.innerHTML = "<p>Profildaten werden geladen ...</p>";
        }
    }

    const logoutButton = document.getElementById("btn-abmelden");
    if (logoutButton) {
        logoutButton.addEventListener("click", abmelden);
    }

    ladeProfildaten(user, userContext.profile).catch(function (_error) {
        if (!userContext.profile) {
            renderProfile(null, user);
        }
    });

});
