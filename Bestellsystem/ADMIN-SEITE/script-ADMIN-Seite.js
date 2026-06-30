import { supabase } from "../supabaseClient.js";

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const ADMIN_LOCAL_SESSION_KEY = "admin-local-session-v1";
const adminLogoutButton = document.getElementById("btn-admin-abmelden");

const scanButton = document.getElementById("scan-qr-btn");
const scanStatus = document.getElementById("scan-status");
const zoneCEmpty = document.getElementById("zone-c-empty");
const zoneCResult = document.getElementById("zone-c-result");
const zoneCStatus = document.getElementById("zone-c-status");
const zoneCToggleAdjust = document.getElementById("zone-c-toggle-adjust");
const zoneCAdjustBox = document.getElementById("zone-c-adjust-box");
const zoneCCancelBtn = document.getElementById("zone-c-cancel-btn");
const zoneCMainBtn = document.getElementById("zone-c-main-btn");
const zoneCOpenFreeBtn = document.getElementById("zone-c-open-free-btn");
const zoneCFreeBox = document.getElementById("zone-c-free-box");
const zoneCFreeCancelBtn = document.getElementById("zone-c-free-cancel-btn");
const zoneCFreeSaveBtn = document.getElementById("zone-c-free-save-btn");
const zoneCFreeFeedback = document.getElementById("zone-c-free-feedback");
const zoneCFreeCountStud = document.getElementById("zone-c-free-count-stud");
const zoneCFreeCountBed = document.getElementById("zone-c-free-count-bed");
const zoneCFreeCountGast = document.getElementById("zone-c-free-count-gast");
const freeSteppers = document.querySelectorAll("#zone-c-free-box .zone-c-stepper");
const zoneCAdjustCountStud = document.getElementById("zone-c-adjust-count-stud");
const zoneCAdjustCountBed = document.getElementById("zone-c-adjust-count-bed");
const zoneCAdjustCountGast = document.getElementById("zone-c-adjust-count-gast");
const adjustSteppers = document.querySelectorAll("#zone-c-adjust-box .zone-c-stepper");
const zoneCCardStud = document.getElementById("zone-c-card-stud");
const zoneCCardBed = document.getElementById("zone-c-card-bed");
const zoneCCardGast = document.getElementById("zone-c-card-gast");
const zoneCCardTotal = document.getElementById("zone-c-card-total");
const zoneCCardDate = document.querySelector(".zone-c-date");
const zoneCCardDish = document.querySelector("#zone-c-result .zone-c-card h3");
const zoneCCardErnaehrung = document.getElementById("zone-c-card-ernaehrung");

const countStudHeute = document.getElementById("count-stud-heute");
const countBedHeute = document.getElementById("count-bed-heute");
const countGastHeute = document.getElementById("count-gast-heute");
const countFreiHeute = document.getElementById("count-frei-heute");
const countTotalHeute = document.getElementById("count-total-heute");

const heutigesGerichtBild = document.getElementById("heutiges-gericht-bild");
const heutigesGerichtName = document.getElementById("heutiges-gericht-name");
const heutigesErnaehrungLabel = document.getElementById("heutiges-ernaehrung-label");
const heutigesPreisStud = document.getElementById("heutiges-preis-stud");
const heutigesPreisBed = document.getElementById("heutiges-preis-bed");
const heutigesPreisGast = document.getElementById("heutiges-preis-gast");
const heutigesAllergene = document.getElementById("heutiges-allergene");
const vorschauListe = document.getElementById("vorschau-liste");
const DASHBOARD_REFRESH_INTERVAL_MS = 60 * 1000;

let aktiveScanBestellung = null;
let freieEssenVerfuegbarHeute = 0;

async function hatGueltigeAuthAdminSession() {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
        return false;
    }

    const user = sessionData?.session?.user;
    if (!user) {
        return false;
    }

    const email = String(user.email || "").trim();
    const rzKennung = email.split("@")[0] || "";

    const [byEmailRes, byRzRes] = await Promise.all([
        email
            ? supabase.from("AdminNutzer").select("id").ilike("E-Mail", email).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        rzKennung
            ? supabase.from("AdminNutzer").select("id").eq("RZ-Kennung", rzKennung).maybeSingle()
            : Promise.resolve({ data: null, error: null })
    ]);

    if (!byEmailRes.error && byEmailRes.data) {
        return true;
    }

    if (!byRzRes.error && byRzRes.data) {
        return true;
    }

    return false;
}

async function pruefeAdminZugriff() {
    // Lokale Browserdaten sind manipulierbar und dürfen keine Adminrechte vergeben.
    sessionStorage.removeItem(ADMIN_LOCAL_SESSION_KEY);
    return hatGueltigeAuthAdminSession();
}

async function adminAbmelden() {
    sessionStorage.removeItem(ADMIN_LOCAL_SESSION_KEY);
    try {
        await supabase.auth.signOut();
    } catch (_error) {
        // Lokale Session reicht bereits fuer den sicheren Logout-Pfad.
    }
    window.location.href = "../Login.html";
}

function emptyFreieEssenState() {
    return {
        Studierende: 0,
        Bedienstete: 0,
        Gaeste: 0
    };
}

function applyStateClass(element, classes, state) {
    if (!element) {
        return;
    }
    classes.forEach(function (className) {
        element.classList.remove(className);
    });
    if (state) {
        element.classList.add(state);
    }
}

function setScanState(text, stateClass) {
    if (!scanStatus) {
        return;
    }
    scanStatus.textContent = text;
    applyStateClass(scanStatus, ["scan-status-loading", "scan-status-success", "scan-status-error"], stateClass);
}

function setFreeFeedbackState(text, stateClass) {
    if (!zoneCFreeFeedback) {
        return;
    }
    zoneCFreeFeedback.textContent = text;
    zoneCFreeFeedback.classList.remove("is-hidden");
    applyStateClass(zoneCFreeFeedback, ["free-feedback-loading", "free-feedback-success", "free-feedback-error"], stateClass);
}

function getCount(counterElement) {
    if (!counterElement) {
        return 0;
    }
    const parsed = Number.parseInt(counterElement.textContent || "0", 10);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function setCount(counterElement, nextValue) {
    if (!counterElement) {
        return;
    }
    counterElement.textContent = String(Math.max(0, nextValue));
}

function toIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function toGermanDateLabel(date) {
    const wochentag = WOCHENTAGE[date.getDay()];
    const datum = date.toLocaleDateString("de-DE");
    return `${wochentag}, ${datum}`;
}

function getBerlinIsoDateNow() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Berlin",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());

    const year = parts.find(function (part) { return part.type === "year"; })?.value;
    const month = parts.find(function (part) { return part.type === "month"; })?.value;
    const day = parts.find(function (part) { return part.type === "day"; })?.value;

    if (!year || !month || !day) {
        return getTodayIso();
    }

    return `${year}-${month}-${day}`;
}

function toEuroText(value) {
    if (value === null || value === undefined || value === "") {
        return "-";
    }
    if (typeof value === "number") {
        return value.toFixed(2).replace(".", ",") + " EUR";
    }
    const text = String(value);
    if (text.includes("EUR") || text.includes("€")) {
        return text;
    }
    return `${text} EUR`;
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

function updateErnaehrungsBadgeElement(element, rawValue) {
    if (!element) {
        return;
    }

    const normalized = normalizeErnaehrungstyp(rawValue);
    element.classList.remove("ernaehrung-vegan", "ernaehrung-vegetarisch", "is-hidden");

    if (!normalized) {
        element.textContent = "";
        element.classList.add("is-hidden");
        return;
    }

    element.textContent = normalized;
    element.classList.add(normalized === "vegan" ? "ernaehrung-vegan" : "ernaehrung-vegetarisch");
}

function normalizeBestellDatum(rawValue) {
    const raw = String(rawValue || "").trim();
    if (!raw) {
        return null;
    }

    const datePart = raw.includes(",") ? raw.split(",").pop().trim() : raw;

    const isoMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    const numericMatch = datePart.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
    if (numericMatch) {
        const day = numericMatch[1].padStart(2, "0");
        const month = numericMatch[2].padStart(2, "0");
        const yearRaw = numericMatch[3];
        const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
        return `${year}-${month}-${day}`;
    }

    return null;
}

function normalizeKategorie(rawKategorie) {
    const text = String(rawKategorie || "").toLowerCase();
    if (text.includes("stud")) {
        return "Studierende";
    }
    if (text.includes("bed")) {
        return "Bedienstete";
    }
    return "Gaeste";
}

function emptyCategoryCounts() {
    return {
        Studierende: 0,
        Bedienstete: 0,
        Gaeste: 0
    };
}

function countRowsByCategory(rows) {
    const counts = emptyCategoryCounts();
    rows.forEach(function (row) {
        const key = normalizeKategorie(row.kategorie);
        counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
}

function getTodayIso() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return toIsoDate(today);
}

function getTodayIsoVarianten() {
    const lokal = getTodayIso();
    const utc = new Date().toISOString().slice(0, 10);
    return Array.from(new Set([lokal, utc]));
}

function numberFromAny(value) {
    const parsed = Number.parseInt(String(value ?? "0"), 10);
    return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
}

function signedNumberFromAny(value) {
    const parsed = Number.parseInt(String(value ?? "0"), 10);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function toIsoFromUnknownDate(value) {
    if (value === null || value === undefined) {
        return null;
    }

    const text = String(value).trim();
    if (!text) {
        return null;
    }

    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    const numericMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
    if (numericMatch) {
        const day = numericMatch[1].padStart(2, "0");
        const month = numericMatch[2].padStart(2, "0");
        const yearRaw = numericMatch[3];
        const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
        return `${year}-${month}-${day}`;
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return toIsoDate(parsed);
}

function normalizeStatus(rawStatus) {
    return String(rawStatus || "").trim().toLowerCase();
}

function istOffeneBestellungStatus(rawStatus) {
    const status = normalizeStatus(rawStatus);
    return status === "bestellt";
}

async function ladeFreieEssenAusDb() {
    const todayIsos = getTodayIsoVarianten();
    const todayIso = todayIsos[0];

    const { data, error } = await supabase
        .from("FreieEssen")
        .select("anzahl, datum")
        .in("datum", todayIsos);

    if (error) {
        // Fallback: ohne Datumsfilter laden und lokal normalisieren.
        const { data: fallbackData, error: fallbackError } = await supabase
            .from("FreieEssen")
            .select("anzahl, datum")
            .limit(2000);

        if (fallbackError) {
            throw new Error(fallbackError.message || "FreieEssen konnte nicht geladen werden.");
        }

        const fallbackTotal = (fallbackData || []).reduce(function (acc, row) {
            const rowIso = toIsoFromUnknownDate(row.datum);
            if (!rowIso || !todayIsos.includes(rowIso)) {
                return acc;
            }
            return acc + signedNumberFromAny(row.anzahl);
        }, 0);

        return {
            Studierende: 0,
            Bedienstete: 0,
            Gaeste: fallbackTotal
        };
    }

    const total = (data || []).reduce(function (acc, row) {
        const rowIso = toIsoFromUnknownDate(row.datum);
        if (!rowIso || !todayIsos.includes(rowIso)) {
            return acc;
        }
        return acc + signedNumberFromAny(row.anzahl);
    }, 0);

    return {
        Studierende: 0,
        Bedienstete: 0,
        Gaeste: total
    };
}

async function speichereFreieEssenInDb(delta) {
    const todayIsos = getTodayIsoVarianten();
    const total = numberFromAny(delta.Studierende) + numberFromAny(delta.Bedienstete) + numberFromAny(delta.Gaeste);
    if (total <= 0) {
        return;
    }

    const { data: todayRows, error: loadError } = await supabase
        .from("FreieEssen")
        .select("id, anzahl, datum")
        .in("datum", todayIsos);

    if (loadError) {
        throw new Error(loadError.message || "FreieEssen konnte nicht geladen werden.");
    }

    const rows = (todayRows || [])
        .map(function (row) {
            return {
                id: row.id,
                anzahl: Math.max(0, signedNumberFromAny(row.anzahl)),
                isoDate: toIsoFromUnknownDate(row.datum)
            };
        })
        .filter(function (row) {
            return Boolean(row.isoDate) && todayIsos.includes(row.isoDate);
        })
        .sort(function (a, b) {
            return b.anzahl - a.anzahl;
        });

    const verfuegbar = rows.reduce(function (summe, row) {
        return summe + row.anzahl;
    }, 0);

    if (verfuegbar < total) {
        throw new Error(`Nur ${verfuegbar} freie Essen verfügbar.`);
    }

    let remaining = total;
    for (const row of rows) {
        if (remaining <= 0) {
            break;
        }
        if (row.anzahl <= 0) {
            continue;
        }

        const abzug = Math.min(row.anzahl, remaining);
        const neueAnzahl = row.anzahl - abzug;
        const { error: updateError } = await supabase
            .from("FreieEssen")
            .update({ anzahl: neueAnzahl })
            .eq("id", row.id);

        if (updateError) {
            const msg = String(updateError.message || "").toLowerCase();
            if (msg.includes("row-level security") || msg.includes("permission")) {
                throw new Error("UPDATE-Policy fuer authenticated auf FreieEssen fehlt.");
            }
            throw new Error(updateError.message || "FreieEssen konnte nicht aktualisiert werden.");
        }

        remaining -= abzug;
    }

    if (remaining > 0) {
        throw new Error("FreieEssen konnte nicht vollständig verbucht werden.");
    }
}

function renderOverviewCounts(heuteCounts, freieCounts) {
    const stud = heuteCounts.Studierende || 0;
    const bed = heuteCounts.Bedienstete || 0;
    const gast = heuteCounts.Gaeste || 0;
    const frei = (freieCounts.Studierende || 0) + (freieCounts.Bedienstete || 0) + (freieCounts.Gaeste || 0);

    if (countStudHeute) countStudHeute.textContent = String(stud);
    if (countBedHeute) countBedHeute.textContent = String(bed);
    if (countGastHeute) countGastHeute.textContent = String(gast);
    if (countFreiHeute) countFreiHeute.textContent = String(frei);
    // Freie Essen werden separat angezeigt und nicht in die Gesamtzahl addiert.
    if (countTotalHeute) countTotalHeute.textContent = `Gesamt: ${stud + bed + gast} Essen`;
}

function updateZoneCCardSummary() {
    const stud = getCount(zoneCAdjustCountStud);
    const bed = getCount(zoneCAdjustCountBed);
    const gast = getCount(zoneCAdjustCountGast);
    const total = stud + bed + gast;

    if (zoneCCardStud) zoneCCardStud.textContent = `${stud}x Studierende`;
    if (zoneCCardBed) zoneCCardBed.textContent = `${bed}x Bedienstete`;
    if (zoneCCardGast) zoneCCardGast.textContent = `${gast}x Gäste`;
    if (zoneCCardTotal) zoneCCardTotal.textContent = `Gesamt: ${total} Bestellungen`;
}

function getAdjustTotal() {
    return getCount(zoneCAdjustCountStud) + getCount(zoneCAdjustCountBed) + getCount(zoneCAdjustCountGast);
}

function updateMainPickupButton() {
    if (!zoneCMainBtn) {
        return;
    }
    const total = getAdjustTotal();
    zoneCMainBtn.textContent = `${total} Bestellungen abgeholt`;
    zoneCMainBtn.disabled = total === 0;
    updateZoneCCardSummary();
}

function getAdjustMaxForTarget(targetId) {
    if (!aktiveScanBestellung || !aktiveScanBestellung.originalCounts) {
        return Number.POSITIVE_INFINITY;
    }
    if (targetId === "zone-c-adjust-count-stud") {
        return aktiveScanBestellung.originalCounts.Studierende || 0;
    }
    if (targetId === "zone-c-adjust-count-bed") {
        return aktiveScanBestellung.originalCounts.Bedienstete || 0;
    }
    if (targetId === "zone-c-adjust-count-gast") {
        return aktiveScanBestellung.originalCounts.Gaeste || 0;
    }
    return Number.POSITIVE_INFINITY;
}

function resetFreeCounts() {
    setCount(zoneCFreeCountStud, 0);
    setCount(zoneCFreeCountBed, 0);
    setCount(zoneCFreeCountGast, 0);
}

function getFreieAuswahlGesamt() {
    return getCount(zoneCFreeCountStud) + getCount(zoneCFreeCountBed) + getCount(zoneCFreeCountGast);
}

function updateFreieEssenInteraktion() {
    const ausgewaehlt = getFreieAuswahlGesamt();
    const rest = Math.max(0, freieEssenVerfuegbarHeute - ausgewaehlt);

    freeSteppers.forEach(function (stepper) {
        const plusBtn = stepper.querySelector(".zone-c-stepper-plus");
        if (plusBtn) {
            plusBtn.disabled = rest <= 0;
        }
    });

    if (zoneCFreeSaveBtn) {
        zoneCFreeSaveBtn.disabled = ausgewaehlt === 0 || freieEssenVerfuegbarHeute <= 0 || ausgewaehlt > freieEssenVerfuegbarHeute;
    }
}

function showZoneCResult() {
    if (zoneCEmpty) zoneCEmpty.classList.add("is-hidden");
    if (zoneCFreeBox) zoneCFreeBox.classList.add("is-hidden");
    if (zoneCResult) zoneCResult.classList.remove("is-hidden");
}

function hideZoneCResult() {
    if (zoneCResult) zoneCResult.classList.add("is-hidden");
    if (zoneCAdjustBox) zoneCAdjustBox.classList.add("is-hidden");
    if (zoneCToggleAdjust) zoneCToggleAdjust.setAttribute("aria-expanded", "false");
    if (zoneCEmpty) zoneCEmpty.classList.remove("is-hidden");
}

function renderHeutigesGericht(gericht) {
    if (!gericht) {
        if (heutigesGerichtName) heutigesGerichtName.textContent = "Kein Gericht eingetragen";
        if (heutigesPreisStud) heutigesPreisStud.textContent = "-";
        if (heutigesPreisBed) heutigesPreisBed.textContent = "-";
        if (heutigesPreisGast) heutigesPreisGast.textContent = "-";
        if (heutigesAllergene) heutigesAllergene.textContent = "-";
        updateErnaehrungsBadgeElement(heutigesErnaehrungLabel, null);
        return;
    }

    if (heutigesGerichtName) heutigesGerichtName.textContent = gericht.Gerichtname || "Unbenanntes Gericht";
    if (heutigesPreisStud) heutigesPreisStud.textContent = toEuroText(gericht.PreisStudierende);
    if (heutigesPreisBed) heutigesPreisBed.textContent = toEuroText(gericht.PreisBedienstet);
    if (heutigesPreisGast) heutigesPreisGast.textContent = toEuroText(gericht.PreisGast);
    if (heutigesAllergene) heutigesAllergene.textContent = gericht.Allergene || "keine Angabe";
    updateErnaehrungsBadgeElement(
        heutigesErnaehrungLabel,
        gericht.ernaehrungstyp || gericht.Ernaehrungstyp || gericht["Ernährungstyp"] || gericht.ernaehrung || null
    );
    if (heutigesGerichtBild) {
        heutigesGerichtBild.src = gericht.image_url || "../img/pasta.jpg";
        heutigesGerichtBild.alt = gericht.Gerichtname || "Heutiges Gericht";
    }
}

async function ladeHeutigesGericht() {
    const todayIso = getTodayIso();
    const { data, error } = await supabase
        .from("Speiseplan")
        .select("*")
        .eq("Ausgabedatum", todayIso)
        .maybeSingle();

    if (error) {
        renderHeutigesGericht(null);
        return;
    }

    renderHeutigesGericht(data || null);
}

async function ladeHeutigeBestellungen() {
    const todayIso = getTodayIso();

    const { data, error } = await supabase
        .from("Bestellungen")
        .select("id, auth_user_id, email, gericht_name, kategorie, bestell_datum, status")
        .limit(5000);

    if (error) {
        throw new Error(error.message || "Heutige Bestellungen konnten nicht geladen werden.");
    }

    return (data || []).filter(function (row) {
        return normalizeBestellDatum(row.bestell_datum) === todayIso && istOffeneBestellungStatus(row.status);
    });
}

async function ladeVorschauNaechste5Tage() {
    if (!vorschauListe) {
        return;
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const tage = [];

    let offset = 1;
    while (tage.length < 5 && offset <= 21) {
        const date = new Date(start);
        date.setDate(start.getDate() + offset);
        const wochentag = date.getDay();

        if (wochentag !== 0 && wochentag !== 6) {
            tage.push({
                iso: toIsoDate(date),
                label: toGermanDateLabel(date)
            });
        }

        offset += 1;
    }

    const isoDates = tage.map(function (item) {
        return item.iso;
    });

    const isoDateSet = new Set(isoDates);
    const startIso = isoDates[0];
    const endIso = isoDates[isoDates.length - 1];

    const [speiseplanRes, bestellungenRes, freieEssenRes] = await Promise.all([
        supabase
            .from("Speiseplan")
            .select("*")
            .gte("Ausgabedatum", startIso)
            .lte("Ausgabedatum", endIso),
        supabase
            .from("Bestellungen")
            .select("bestell_datum, kategorie")
            .limit(5000),
        supabase
            .from("FreieEssen")
            .select("datum, anzahl")
            .gte("datum", startIso)
            .lte("datum", endIso)
    ]);

    if (speiseplanRes.error || bestellungenRes.error) {
        vorschauListe.innerHTML = "<p>Vorschau konnte nicht geladen werden.</p>";
        return;
    }

    if (freieEssenRes.error) {
        setScanState("Vorschau geladen, aber Freie-Essen-Daten fehlen.", "scan-status-error");
    }

    const gerichtByDate = new Map();
    (speiseplanRes.data || []).forEach(function (row) {
        const iso = toIsoFromUnknownDate(row.Ausgabedatum);
        if (!iso || !isoDateSet.has(iso)) {
            return;
        }
        gerichtByDate.set(iso, row);
    });

    const countsByDate = new Map();
    (bestellungenRes.data || []).forEach(function (row) {
        const iso = normalizeBestellDatum(row.bestell_datum);
        if (!iso || !isoDateSet.has(iso)) {
            return;
        }

        if (!countsByDate.has(iso)) {
            countsByDate.set(iso, emptyCategoryCounts());
        }

        const counts = countsByDate.get(iso);
        const key = normalizeKategorie(row.kategorie);
        counts[key] = (counts[key] || 0) + 1;
    });

    const freieByDate = new Map();
    (freieEssenRes.data || []).forEach(function (row) {
        const iso = toIsoFromUnknownDate(row.datum);
        if (!iso || !isoDateSet.has(iso)) {
            return;
        }
        const current = freieByDate.get(iso) || 0;
        freieByDate.set(iso, current + signedNumberFromAny(row.anzahl));
    });

    vorschauListe.innerHTML = "";
    tage.forEach(function (item) {
        const gericht = gerichtByDate.get(item.iso);
        const counts = countsByDate.get(item.iso) || emptyCategoryCounts();
        const total = (counts.Studierende || 0) + (counts.Bedienstete || 0) + (counts.Gaeste || 0);
        const frei = Math.max(0, freieByDate.get(item.iso) || 0);

        const article = document.createElement("article");
        article.className = "vorschau-item";

        const image = document.createElement("img");
        image.src = gericht?.image_url || "../img/pasta.jpg";
        image.alt = `${item.label} Gericht`;

        const content = document.createElement("div");

        const heading = document.createElement("h4");
        heading.textContent = item.label;

        const dishText = document.createElement("p");
        dishText.textContent = gericht?.Gerichtname || "Noch kein Gericht eingetragen";

        const ernaehrungsBadge = document.createElement("span");
        ernaehrungsBadge.className = "ernaehrung-badge-admin";
        updateErnaehrungsBadgeElement(
            ernaehrungsBadge,
            gericht?.ernaehrungstyp || gericht?.Ernaehrungstyp || gericht?.["Ernährungstyp"] || gericht?.ernaehrung || null
        );

        const totalText = document.createElement("p");
        totalText.className = "vorschau-total";
        totalText.textContent = `Bestellungen gesamt: ${total}`;

        const detailText = document.createElement("p");
        detailText.className = "vorschau-detail";
        detailText.textContent = `Stud: ${counts.Studierende || 0} | Bed: ${counts.Bedienstete || 0} | Gast: ${counts.Gaeste || 0} | Frei: ${frei}`;

        content.appendChild(heading);
        content.appendChild(dishText);
        if (!ernaehrungsBadge.classList.contains("is-hidden")) {
            content.appendChild(ernaehrungsBadge);
        }
        content.appendChild(totalText);
        content.appendChild(detailText);

        article.appendChild(image);
        article.appendChild(content);

        vorschauListe.appendChild(article);
    });
}

function scanRefAusEingabe(rawInput) {
    const raw = String(rawInput || "").trim();
    if (!raw) {
        return null;
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const istGueltigeUuid = function (value) {
        return uuidRegex.test(String(value || "").trim());
    };

    if (raw.startsWith("mensa://")) {
        try {
            const parsed = new URL(raw);
            const userId = (parsed.searchParams.get("user_id") || "").trim();
            if (istGueltigeUuid(userId)) {
                return { type: "user_id", value: userId };
            }
            return null;
        } catch (_error) {
            return null;
        }
    }

    const match = raw.match(/user_id=([^&]+)/i);
    if (match && match[1]) {
        const userId = decodeURIComponent(match[1]).trim();
        if (istGueltigeUuid(userId)) {
            return { type: "user_id", value: userId };
        }
        return null;
    }

    if (raw.includes("@")) {
        return { type: "email", value: raw };
    }

    if (istGueltigeUuid(raw)) {
        return { type: "user_id", value: raw };
    }

    return null;
}

async function ladeErnaehrungstypFuerGericht(gerichtName, isoDate) {
    if (!gerichtName || !isoDate) {
        return null;
    }

    const { data, error } = await supabase
        .from("Speiseplan")
        .select("*")
        .eq("Ausgabedatum", isoDate)
        .eq("Gerichtname", gerichtName)
        .maybeSingle();

    if (error || !data) {
        return null;
    }

    return data.ernaehrungstyp || data.Ernaehrungstyp || data["Ernährungstyp"] || data.ernaehrung || null;
}

async function fillScanCardFromRows(rows) {
    const counts = countRowsByCategory(rows);
    const dishName = rows[0]?.gericht_name || "Bestellung";
    const dishDate = normalizeBestellDatum(rows[0]?.bestell_datum);

    if (zoneCCardDate) zoneCCardDate.textContent = toGermanDateLabel(new Date());
    if (zoneCCardDish) zoneCCardDish.textContent = dishName;
    const ernaehrungstyp = await ladeErnaehrungstypFuerGericht(dishName, dishDate);
    updateErnaehrungsBadgeElement(zoneCCardErnaehrung, ernaehrungstyp);

    setCount(zoneCAdjustCountStud, counts.Studierende || 0);
    setCount(zoneCAdjustCountBed, counts.Bedienstete || 0);
    setCount(zoneCAdjustCountGast, counts.Gaeste || 0);

    aktiveScanBestellung = {
        rows,
        originalCounts: {
            Studierende: counts.Studierende || 0,
            Bedienstete: counts.Bedienstete || 0,
            Gaeste: counts.Gaeste || 0
        }
    };

    updateMainPickupButton();
}

async function ladeBestellungZumScan(scanRef) {
    const todayIso = getTodayIso();

    if (scanRef.type === "user_id") {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(String(scanRef.value || "").trim())) {
            throw new Error("Ungueltige Nutzer-ID im QR-Code.");
        }
    }

    let query = supabase
        .from("Bestellungen")
        .select("id, auth_user_id, email, gericht_name, kategorie, bestell_datum, status");

    if (scanRef.type === "user_id") {
        query = query.eq("auth_user_id", scanRef.value);
    } else {
        query = query.ilike("email", scanRef.value);
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(error.message || "Bestellung konnte nicht geladen werden.");
    }

    const offeneBestellungenHeute = (data || []).filter(function (row) {
        if (!istOffeneBestellungStatus(row.status)) {
            return false;
        }

        const normalizedDate = normalizeBestellDatum(row.bestell_datum);
        return normalizedDate === todayIso;
    });

    const byId = new Map();
    offeneBestellungenHeute.forEach(function (row) {
        byId.set(String(row.id), row);
    });

    return Array.from(byId.values());
}

async function reloadOverview() {
    let freie = emptyFreieEssenState();
    try {
        freie = await ladeFreieEssenAusDb();
    } catch (error) {
        freieEssenVerfuegbarHeute = 0;
        updateFreieEssenInteraktion();
        setFreeFeedbackState("Freie-Essen-Stand konnte nicht aus der DB geladen werden.", "free-feedback-error");
        throw new Error(error.message || "FreieEssen konnte nicht aus der DB geladen werden.");
    }

    freieEssenVerfuegbarHeute = (freie.Studierende || 0) + (freie.Bedienstete || 0) + (freie.Gaeste || 0);
    updateFreieEssenInteraktion();

    const todayRows = await ladeHeutigeBestellungen();
    renderOverviewCounts(countRowsByCategory(todayRows), freie);
}

async function ladeDashboard() {
    setScanState("Backend-Verbindung wird geladen...", "scan-status-loading");

    try {
        await Promise.all([
            reloadOverview(),
            ladeHeutigesGericht(),
            ladeVorschauNaechste5Tage()
        ]);

        setScanState("Bereit zum Scannen.", "scan-status-success");
    } catch (error) {
        setScanState("Backend konnte nicht geladen werden.", "scan-status-error");
    }
}

async function markiereAlsAbgeholt() {
    if (!aktiveScanBestellung || !aktiveScanBestellung.rows || aktiveScanBestellung.rows.length === 0) {
        if (zoneCStatus) {
            zoneCStatus.textContent = "Keine aktive Bestellung vorhanden.";
        }
        return;
    }

    const targetCounts = {
        Studierende: getCount(zoneCAdjustCountStud),
        Bedienstete: getCount(zoneCAdjustCountBed),
        Gaeste: getCount(zoneCAdjustCountGast)
    };

    const idsByCategory = {
        Studierende: [],
        Bedienstete: [],
        Gaeste: []
    };

    aktiveScanBestellung.rows.forEach(function (row) {
        const key = normalizeKategorie(row.kategorie);
        idsByCategory[key].push(row.id);
    });

    const idsToDelete = [];
    ["Studierende", "Bedienstete", "Gaeste"].forEach(function (key) {
        const available = idsByCategory[key].length;
        const wanted = targetCounts[key] || 0;

        if (wanted > available) {
            throw new Error("Abholmenge ist groesser als vorhandene Bestellung.");
        }

        idsToDelete.push(...idsByCategory[key].slice(0, wanted));
    });

    if (idsToDelete.length === 0) {
        if (zoneCStatus) {
            zoneCStatus.textContent = "Keine Bestellungen zum Abbuchen ausgewaehlt.";
        }
        return;
    }

    const { error } = await supabase
        .from("Bestellungen")
        .update({ status: "abgeholt" })
        .in("id", idsToDelete)
        .eq("status", "bestellt");

    if (error) {
        throw new Error(error.message || "Abholung konnte nicht verbucht werden.");
    }

    if (zoneCStatus) {
        zoneCStatus.textContent = `${idsToDelete.length} Bestellungen als abgeholt markiert`;
    }

    aktiveScanBestellung = null;
    hideZoneCResult();
    await ladeDashboard();
}

freeSteppers.forEach(function (stepper) {
    const targetId = stepper.getAttribute("data-target");
    if (!targetId) {
        return;
    }

    const counter = document.getElementById(targetId);
    const plusBtn = stepper.querySelector(".zone-c-stepper-plus");
    const minusBtn = stepper.querySelector(".zone-c-stepper-minus");

    if (plusBtn && counter) {
        plusBtn.addEventListener("click", function () {
            const ausgewaehlt = getFreieAuswahlGesamt();
            if (ausgewaehlt >= freieEssenVerfuegbarHeute) {
                setFreeFeedbackState(`Nur ${freieEssenVerfuegbarHeute} freie Essen verfuegbar.`, "free-feedback-error");
                updateFreieEssenInteraktion();
                return;
            }
            setCount(counter, getCount(counter) + 1);
            updateFreieEssenInteraktion();
        });
    }

    if (minusBtn && counter) {
        minusBtn.addEventListener("click", function () {
            setCount(counter, getCount(counter) - 1);
            updateFreieEssenInteraktion();
        });
    }
});

adjustSteppers.forEach(function (stepper) {
    const targetId = stepper.getAttribute("data-target");
    if (!targetId) {
        return;
    }

    const counter = document.getElementById(targetId);
    const plusBtn = stepper.querySelector(".zone-c-stepper-plus");
    const minusBtn = stepper.querySelector(".zone-c-stepper-minus");

    if (plusBtn && counter) {
        plusBtn.addEventListener("click", function () {
            const max = getAdjustMaxForTarget(targetId);
            const next = getCount(counter) + 1;

            if (next > max) {
                if (zoneCStatus) {
                    zoneCStatus.textContent = "Maximale Menge fuer diese Kategorie erreicht.";
                }
                return;
            }

            setCount(counter, next);
            updateMainPickupButton();
        });
    }

    if (minusBtn && counter) {
        minusBtn.addEventListener("click", function () {
            setCount(counter, getCount(counter) - 1);
            updateMainPickupButton();
        });
    }
});

if (scanButton) {
    scanButton.addEventListener("click", async function () {
        scanButton.disabled = true;
        scanButton.setAttribute("aria-busy", "true");

        try {
            setScanState("Scan-Daten werden gelesen...", "scan-status-loading");
            const rawInput = window.prompt("QR-Payload, Nutzer-ID oder E-Mail eingeben:");

            if (!rawInput) {
                setScanState("Scan abgebrochen.", "scan-status-error");
                return;
            }

            const scanRef = scanRefAusEingabe(rawInput);
            if (!scanRef || !scanRef.value) {
                setScanState("QR-Code ungueltig. Bitte erneut scannen.", "scan-status-error");
                return;
            }

            const rows = await ladeBestellungZumScan(scanRef);
            if (!rows || rows.length === 0) {
                hideZoneCResult();
                if (zoneCStatus) {
                    zoneCStatus.textContent = "Keine heutige Bestellung gefunden";
                }
                setScanState("Keine Bestellung fuer heute gefunden.", "scan-status-error");
                return;
            }

            showZoneCResult();
            await fillScanCardFromRows(rows);
            if (zoneCStatus) {
                zoneCStatus.textContent = "Bestellung gefunden";
            }
            setScanState("Scan erfolgreich. Bestellung geladen.", "scan-status-success");
        } catch (error) {
            const errorMessage = String(error?.message || "");
            if (errorMessage.includes("Ungueltige Nutzer-ID im QR-Code")) {
                setScanState("QR-Code enthaelt keine gueltige Nutzer-ID. Bitte erneut scannen.", "scan-status-error");
            } else {
                setScanState("Scan fehlgeschlagen. Bitte erneut versuchen.", "scan-status-error");
            }
        } finally {
            scanButton.disabled = false;
            scanButton.setAttribute("aria-busy", "false");
        }
    });
}

if (zoneCToggleAdjust && zoneCAdjustBox) {
    zoneCToggleAdjust.addEventListener("click", function () {
        zoneCAdjustBox.classList.toggle("is-hidden");
        zoneCToggleAdjust.setAttribute("aria-expanded", String(!zoneCAdjustBox.classList.contains("is-hidden")));
    });
}

if (zoneCCancelBtn && zoneCAdjustBox) {
    zoneCCancelBtn.addEventListener("click", function () {
        zoneCAdjustBox.classList.add("is-hidden");
        if (zoneCToggleAdjust) {
            zoneCToggleAdjust.setAttribute("aria-expanded", "false");
        }
    });
}

if (zoneCMainBtn) {
    zoneCMainBtn.addEventListener("click", async function () {
        try {
            zoneCMainBtn.disabled = true;
            await markiereAlsAbgeholt();
        } catch (error) {
            if (zoneCStatus) {
                zoneCStatus.textContent = "Fehler beim Verbuchen: " + (error.message || "Unbekannt");
            }
        } finally {
            zoneCMainBtn.disabled = false;
        }
    });
}

if (zoneCOpenFreeBtn && zoneCFreeBox && zoneCResult) {
    zoneCOpenFreeBtn.addEventListener("click", function () {
        zoneCResult.classList.add("is-hidden");
        zoneCFreeBox.classList.remove("is-hidden");
        zoneCOpenFreeBtn.setAttribute("aria-expanded", "true");
        updateFreieEssenInteraktion();
        if (zoneCFreeFeedback) {
            zoneCFreeFeedback.classList.add("is-hidden");
        }
        if (freieEssenVerfuegbarHeute <= 0) {
            setFreeFeedbackState("Kein Kontingent mehr verfuegbar.", "free-feedback-error");
        }
    });
}

if (zoneCFreeCancelBtn && zoneCFreeBox) {
    zoneCFreeCancelBtn.addEventListener("click", function () {
        zoneCFreeBox.classList.add("is-hidden");
        if (zoneCOpenFreeBtn) {
            zoneCOpenFreeBtn.setAttribute("aria-expanded", "false");
        }
        resetFreeCounts();
        updateFreieEssenInteraktion();
    });
}

if (zoneCFreeSaveBtn) {
    zoneCFreeSaveBtn.addEventListener("click", async function () {
        const stud = getCount(zoneCFreeCountStud);
        const bed = getCount(zoneCFreeCountBed);
        const gast = getCount(zoneCFreeCountGast);
        const gesamt = stud + bed + gast;

        if (gesamt === 0) {
            setFreeFeedbackState("Bitte mindestens 1 freies Essen auswaehlen.", "free-feedback-error");
            return;
        }

        const delta = {
            Studierende: stud,
            Bedienstete: bed,
            Gaeste: gast
        };

        const verfuegbar = await ladeFreieEssenAusDb();
        const verfuegbarGesamt = verfuegbar.Gaeste || 0;
        freieEssenVerfuegbarHeute = verfuegbarGesamt;
        updateFreieEssenInteraktion();
        if (verfuegbarGesamt <= 0) {
            setFreeFeedbackState("Kein Kontingent mehr verfügbar.", "free-feedback-error");
            return;
        }
        if (gesamt > verfuegbarGesamt) {
            setFreeFeedbackState(`Nur ${verfuegbarGesamt} freie Essen verfügbar.`, "free-feedback-error");
            return;
        }

        try {
            await speichereFreieEssenInDb(delta);
        } catch (error) {
            setFreeFeedbackState("Fehler beim Speichern: " + (error.message || "Unbekannt"), "free-feedback-error");
            return;
        }

        zoneCFreeSaveBtn.disabled = true;
        setFreeFeedbackState("Freies Essen wird verbucht...", "free-feedback-loading");

        await reloadOverview();

        if (zoneCFreeBox) {
            zoneCFreeBox.classList.add("is-hidden");
        }
        if (zoneCOpenFreeBtn) {
            zoneCOpenFreeBtn.setAttribute("aria-expanded", "false");
        }

        setFreeFeedbackState(
            "Freies Essen verbucht - Studierende: " + stud + ", Bedienstete: " + bed + ", Gäste: " + gast + " (Gesamt: " + gesamt + ")",
            "free-feedback-success"
        );

        resetFreeCounts();
        zoneCFreeSaveBtn.disabled = false;
    });
}

async function aufgeraeumeAlteBestellungen() {
    const heuteIso = getBerlinIsoDateNow();

    // Abgeholte Bestellungen vor heute: Löschen
    const { data: altAbgeholte, error: fetchAbgeholteError } = await supabase
        .from("Bestellungen")
        .select("id")
        .eq("status", "abgeholt")
        .lt("bestell_datum", heuteIso);

    if (!fetchAbgeholteError && altAbgeholte && altAbgeholte.length > 0) {
        const ids = altAbgeholte.map(b => b.id);
        await supabase.from("Bestellungen").delete().in("id", ids);
    }

    // Nicht abgeholte Bestellungen vor heute: Archivieren (Status="archiviert")
    const { data: altNichtAbgeholte, error: fetchNichtAbgeholteError } = await supabase
        .from("Bestellungen")
        .select("id")
        .neq("status", "abgeholt")
        .neq("status", "archiviert")
        .lt("bestell_datum", heuteIso);

    if (!fetchNichtAbgeholteError && altNichtAbgeholte && altNichtAbgeholte.length > 0) {
        const ids = altNichtAbgeholte.map(b => b.id);
        const { error: updateError } = await supabase
            .from("Bestellungen")
            .update({ status: "archiviert" })
            .in("id", ids);
        if (updateError) {
            setScanState("Archivierung alter Bestellungen fehlgeschlagen.", "scan-status-error");
        }
    }
}

(async function initAdminSeite() {
    const erlaubt = await pruefeAdminZugriff();
    if (!erlaubt) {
        window.location.href = "../Login.html";
        return;
    }

    if (adminLogoutButton) {
        adminLogoutButton.addEventListener("click", adminAbmelden);
    }

    await aufgeraeumeAlteBestellungen();
    updateMainPickupButton();
    hideZoneCResult();
    await ladeDashboard();

    // Keep dashboard numbers aligned with timed backend status transitions (e.g. 13:15).
    window.setInterval(function () {
        ladeDashboard().catch(function (error) {
            setScanState("Dashboard-Aktualisierung fehlgeschlagen. Bitte Seite neu laden.", "scan-status-error");
        });
    }, DASHBOARD_REFRESH_INTERVAL_MS);
})();
