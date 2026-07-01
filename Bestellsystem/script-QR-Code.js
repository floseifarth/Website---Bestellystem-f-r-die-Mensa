import { supabase } from "./supabaseClient.js";
import QRCode from "https://esm.sh/qrcode@1.5.4";
import { loadCurrentUserContext } from "./userContext.js";

const QR_BOX_ID = "qr-code-box";
const QR_HINT_ID = "qr-code-hinweis";
const QR_KENNUNG_ID = "qr-code-kennung";

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

async function ladeUserIdFuerQr(user) {
    // Der Scanner ordnet Bestellungen ueber auth_user_id zu.
    // Deshalb enthaelt der QR die rohe Supabase Auth-ID (UUID) – ohne Wrapper.
    if (!user || !user.id) {
        throw new Error("Keine gueltige Auth-ID vorhanden.");
    }
    return user.id;
}

function baueQrPayload(kennung) {
    // Der Scanner liest den rohen QR-Inhalt und matcht ihn direkt gegen
    // auth_user_id (UUID). Deshalb KEIN mensa://-Wrapper – nur der reine Wert.
    return String(kennung || "").trim();
}

function setQrHintText(text) {
    const hintElement = document.getElementById(QR_HINT_ID);
    if (hintElement) {
        hintElement.textContent = text;
    }
}

function setQrKennungText(text) {
    const kennungElement = document.getElementById(QR_KENNUNG_ID);
    if (!kennungElement) {
        return;
    }

    const value = String(text || "").trim();
    if (!value) {
        kennungElement.hidden = true;
        kennungElement.textContent = "";
        return;
    }

    kennungElement.hidden = false;
    kennungElement.textContent = value;
}

function sanitizeKennungValue(value) {
    if (typeof value === "number") {
        return String(value);
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed;
    }
    return "";
}

function mappeNummerAusStudent(row, user) {
    const kandidatFelder = [
        row?.matrikelnummer,
        row?.Matrikelnummer,
        row?.matrikel,
        row?.Matrikel,
        row?.student_number,
        row?.studentNumber,
        row?.username,
        row?.rz_kennung,
        row?.kennung,
        row?.user_id
    ];

    const gefuellt = kandidatFelder
        .map(sanitizeKennungValue)
        .find(function (entry) { return Boolean(entry); });

    if (gefuellt) {
        return gefuellt;
    }

    const emailPrefix = String(user?.email || "").split("@")[0].trim();
    if (emailPrefix) {
        return emailPrefix;
    }

    return String(user?.id || "").trim();
}

async function ladeQrKennung(user) {
    const email = String(user?.email || "").trim();
    let studentRow = null;

    if (email) {
        const { data, error } = await supabase
            .from("students")
            .select("matrikelnummer, Matrikelnummer, matrikel, Matrikel, student_number, studentNumber, username, rz_kennung, kennung, user_id")
            .ilike("email", email)
            .maybeSingle();

        if (!error) {
            studentRow = data;
        }
    }

    if (!studentRow) {
        const { data, error } = await supabase
            .from("students")
            .select("matrikelnummer, Matrikelnummer, matrikel, Matrikel, student_number, studentNumber, username, rz_kennung, kennung, user_id")
            .eq("user_id", user.id)
            .maybeSingle();

        if (!error) {
            studentRow = data;
        }
    }

    return mappeNummerAusStudent(studentRow, user);
}

async function rendereQrCode(userId) {
    const qrBox = document.getElementById(QR_BOX_ID);
    if (!qrBox) {
        return;
    }

    // Aus dem Payload wird eine Data-URL erzeugt und direkt als Bild angezeigt.
    const qrPayload = baueQrPayload(userId);
    const dataUrl = await QRCode.toDataURL(qrPayload, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 280
    });

    qrBox.innerHTML = `<img src="${dataUrl}" alt="Persoenlicher QR-Code" width="280" height="280">`;
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

    try {
        // QR basiert auf der eindeutig zugeordneten user_id des eingeloggten Nutzers.
        const userIdFuerQr = await ladeUserIdFuerQr(user);
        await rendereQrCode(userIdFuerQr);
    } catch (error) {
        console.error(error);
        const qrBox = document.getElementById(QR_BOX_ID);
        if (qrBox) {
            qrBox.innerHTML = "<p>QR-Code konnte nicht geladen werden.</p>";
        }
    }

});
