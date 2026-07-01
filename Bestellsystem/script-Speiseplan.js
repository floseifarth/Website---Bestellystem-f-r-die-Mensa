import { supabase } from "./supabaseClient.js";
import { loadCurrentUserContext } from "./userContext.js";
import { escapeHtml } from "./escapeHtml.js";

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

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
    const ist1315 = 13 * 60 + 15;

    badge.style.display = "inline-block";
    badge.className = "bestellstatus-badge";

    if (zeitInMinuten >= ist1200 && zeitInMinuten < ist1315) {
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
function normalisiereBestellDatum(bestellDatum) {
    const raw = String(bestellDatum || "").trim();
    if (!raw) {
        return "";
    }

    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    const dateParts = raw.split(", ");
    const datumText = dateParts[1] || dateParts[0] || "";

    const numerischMatch = datumText.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
    if (numerischMatch) {
        const tag = numerischMatch[1].padStart(2, "0");
        const monat = numerischMatch[2].padStart(2, "0");
        const jahrRoh = numerischMatch[3];
        const jahr = jahrRoh.length === 2 ? `20${jahrRoh}` : jahrRoh;
        return `${jahr}-${monat}-${tag}`;
    }

    const monate = {
        Januar: "01",
        Februar: "02",
        März: "03",
        April: "04",
        Mai: "05",
        Juni: "06",
        Juli: "07",
        August: "08",
        September: "09",
        Oktober: "10",
        November: "11",
        Dezember: "12"
    };

    const textMatch = datumText.match(/^(\d{1,2})\.\s+([A-Za-zÄÖÜäöüß]+)\s+(\d{2}|\d{4})$/);
    if (!textMatch) {
        return datumText;
    }

    const tag = textMatch[1].padStart(2, "0");
    const monat = monate[textMatch[2]];
    const jahrRoh = textMatch[3];
    const jahr = jahrRoh.length === 2 ? `20${jahrRoh}` : jahrRoh;
    if (!monat) {
        return "";
    }

    return `${jahr}-${monat}-${tag}`;
}

function formatiereZeitraumDatum(date) {
    return date.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    });
}

function ladeGerichtzeitraum(startDate, endDate) {
    const anzeigeElement = document.getElementById("GerichtanzeigeDatum");
    if (!anzeigeElement) {
        return;
    }

    const startString = formatiereZeitraumDatum(startDate);
    const endString = formatiereZeitraumDatum(endDate);
    anzeigeElement.innerText = `Gerichte für den Zeitraum: ${startString} - ${endString}`;
}

function renderGerichtzeitraumSofort() {
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 17);

    ladeGerichtzeitraum(startDate, endDate);
}

async function ermittleVorbestellungsZaehler(userId, startIsoDate, endIsoDate) {
    const { data, error } = await supabase
        .from("Bestellungen")
        .select("gericht_name, bestell_datum, status")
        .eq("auth_user_id", userId)
        .limit(5000);

    if (error) {
        console.warn("Vorbestellungsstatus konnte nicht geladen werden:", error.message || error);
        return {};
    }

    const zaehler = {};

    (data || []).forEach(function (bestellung) {
        const datumIso = normalisiereBestellDatum(bestellung.bestell_datum);
        const gericht = String(bestellung.gericht_name || "").trim();
        const status = String(bestellung.status || "").trim().toLowerCase();

        if (!datumIso || !gericht) {
            return;
        }

        if (datumIso < startIsoDate || datumIso > endIsoDate) {
            return;
        }

        if (status === "archiviert" || status === "storniert") {
            return;
        }

        const key = `${datumIso}||${gericht}`;
        zaehler[key] = (zaehler[key] || 0) + 1;
    });

    return zaehler;
}

function toIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function normalizeErnaehrungstyp(rawValue) {
    const text = String(rawValue || "")
        .trim()
        .toLowerCase()
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/ß/g, "ss");

    if (!text) {
        return null;
    }
    if (text.includes("vegan")) {
        return "vegan";
    }
    if (text.includes("nicht vegetarisch") || text.includes("nicht-vegetarisch") || text.includes("fleisch")) {
        return null;
    }
    if (text.includes("vegetar")) {
        return "vegetarisch";
    }

    return null;
}

function renderErnaehrungsBadge(rawValue) {
    const normalized = normalizeErnaehrungstyp(rawValue);
    if (!normalized) {
        return "";
    }

    const classMap = {
        vegan: "ernaehrung-vegan",
        vegetarisch: "ernaehrung-vegetarisch"
    };

    return `<span class="ernaehrung-badge ${classMap[normalized]}">${normalized}</span>`;
}

async function ladeGerichte(userId) {
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    //Zeigt die aktuellen Gerichte für die nächsten 3 Wochen an (inklusive heute).
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 17);
    ladeGerichtzeitraum(startDate, endDate);

    const startIsoDate = toIsoDate(startDate);
    const endIsoDate = toIsoDate(endDate);
    const vorbestellungsZaehler = await ermittleVorbestellungsZaehler(userId, startIsoDate, endIsoDate);

    const { data, error } = await supabase
        .from("Speiseplan")
        .select("*")
        .gte("Ausgabedatum", startIsoDate)
        .lte("Ausgabedatum", endIsoDate)
        .order("Ausgabedatum", { ascending: true });

    if (error) {
        console.error("Fehler beim Laden des Speiseplans:", error);
        return;
    }

    const container = document.getElementById("speiseplan-container");
    container.innerHTML = "";

    if (data.length === 0) {
        container.innerHTML = "<p>Für die nächsten 7 Tage sind aktuell keine Gerichte eingetragen.</p>";
        return;
    }

    for (const gericht of data) {
        // Parse the date string (e.g., "2026-06-16") as local date in Berlin timezone
        // by appending T00:00:00 to prevent UTC conversion
        const datum = new Date(gericht.Ausgabedatum + "T00:00:00");
        const datumIso = toIsoDate(datum);
        const wochentag = WOCHENTAGE[datum.getDay()];
        const datumFormatiert = datum.toLocaleDateString("de-DE", {
            day: "2-digit", month: "2-digit", year: "numeric"
        });
        const vorbestellKey = `${datumIso}||${String(gericht.Gerichtname || "").trim()}`;
        const anzahlVorbestellungen = vorbestellungsZaehler[vorbestellKey] || 0;

        const eintrag = document.createElement("div");
        eintrag.className = anzahlVorbestellungen > 0
            ? "speiseplan-eintrag ist-vorbestellt"
            : "speiseplan-eintrag";
        eintrag.innerHTML = `
            ${anzahlVorbestellungen > 0 ? '<span class="vorbestellt-notiz">Vorbestellt!</span>' : ''}
            <div class="speiseplan-links">
                <h3>${wochentag}</h3>
                <p>${datumFormatiert}</p>
            </div>
            <div class="speiseplan-mitte">
                <img src="${escapeHtml(gericht.image_url || 'img/Profil.svg')}" class="gericht-bild" alt="${escapeHtml(gericht.Gerichtname)}">
                <p>Tagesangebot</p>
                <h3>${escapeHtml(gericht.Gerichtname)}</h3>
                <p class="allergene">Allergene: ${escapeHtml(gericht.Allergene || "keine Angabe")}</p>
                ${renderErnaehrungsBadge(gericht.ernaehrungstyp || gericht.Ernaehrungstyp || gericht["Ernährungstyp"] || gericht.ernaehrung || null)}
                <div class="preise">
                    <p>Studierende: <strong>${escapeHtml(gericht.PreisStudierende)}</strong></p>
                    <p>Bedienstete: <strong>${escapeHtml(gericht.PreisBedienstet)}</strong></p>
                    <p>Gäste: <strong>${escapeHtml(gericht.PreisGast)}</strong></p>
                </div>
            </div>
            <div class="speiseplan-rechts"></div>
        `;

        container.appendChild(eintrag);
    }
}











// Seite ist bereit – Session und Name laden.
document.addEventListener("DOMContentLoaded", async function () {
    renderGerichtzeitraumSofort();

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
        await aktualisiereBestellstatusHeader(user.id);
    }

    // Speiseplan aus Supabase laden.
    await ladeGerichte(user.id);
});
