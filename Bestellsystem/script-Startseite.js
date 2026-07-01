import { supabase } from "./supabaseClient.js";
import { loadCurrentUserContext } from "./userContext.js";

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
    console.log("Badge-Update aufgerufen, Badge Element:", badge);
    if (!badge) {
        console.log("Badge Element nicht gefunden!");
        return;
    }

    // Zuerst Cache auslesen (schnell)
    const cached = readCachedBadge();
    if (cached) {
        console.log("Badge aus Cache geladen", cached);
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

        console.log("Badge aktualisiert:", className, textContent);
        applyBadgeState(badge, className, textContent);
        writeCachedBadge(userId, className, textContent);
    } catch (error) {
        console.error("Fehler beim Badge-Update:", error);
    }
}
// Seite ist bereit – Session und Name laden.
document.addEventListener("DOMContentLoaded", async function () {

    const userContext = await loadCurrentUserContext();
    const user = userContext.user;

    // Kein eingeloggter User? Zurueck zur Anmeldeseite.
    if (!user) {
        window.location.href = "index.html";
        return;
    }

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
});
