import { supabase } from "../supabaseClient.js";

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const STORAGE_FREE_KEY = "admin-freie-essen-v1";

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

const countStudHeute = document.getElementById("count-stud-heute");
const countBedHeute = document.getElementById("count-bed-heute");
const countGastHeute = document.getElementById("count-gast-heute");
const countFreiHeute = document.getElementById("count-frei-heute");
const countTotalHeute = document.getElementById("count-total-heute");

const heutigesGerichtBild = document.getElementById("heutiges-gericht-bild");
const heutigesGerichtName = document.getElementById("heutiges-gericht-name");
const heutigesPreisStud = document.getElementById("heutiges-preis-stud");
const heutigesPreisBed = document.getElementById("heutiges-preis-bed");
const heutigesPreisGast = document.getElementById("heutiges-preis-gast");
const heutigesAllergene = document.getElementById("heutiges-allergene");
const vorschauListe = document.getElementById("vorschau-liste");

let aktiveScanBestellung = null;

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

function toGermanNumericDate(date) {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear());
    return `${day}.${month}.${year}`;
}

function toGermanDateLabel(date) {
    const wochentag = WOCHENTAGE[date.getDay()];
    const datum = date.toLocaleDateString("de-DE");
    return `${wochentag}, ${datum}`;
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

function loadFreeMealState() {
    const todayIso = getTodayIso();
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_FREE_KEY) || "{}");
        return parsed[todayIso] || emptyFreieEssenState();
    } catch (_error) {
        return emptyFreieEssenState();
    }
}

function saveFreeMealState(nextState) {
    const todayIso = getTodayIso();
    let parsed = {};
    try {
        parsed = JSON.parse(localStorage.getItem(STORAGE_FREE_KEY) || "{}");
    } catch (_error) {
        parsed = {};
    }

    parsed[todayIso] = {
        Studierende: nextState.Studierende || 0,
        Bedienstete: nextState.Bedienstete || 0,
        Gaeste: nextState.Gaeste || 0
    };

    localStorage.setItem(STORAGE_FREE_KEY, JSON.stringify(parsed));
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

async function ladeFreieEssenAusDb() {
    const todayIso = getTodayIso();

    const { data, error } = await supabase
        .from("FreieEssen")
        .select("anzahl, datum, erstell_am")
        .order("erstell_am", { ascending: false })
        .limit(1000);

    if (error) {
        throw new Error(error.message || "FreieEssen konnte nicht geladen werden.");
    }

    const total = (data || []).reduce(function (acc, row) {
        const rowIso = toIsoFromUnknownDate(row.datum) || toIsoFromUnknownDate(row.erstell_am);
        if (rowIso !== todayIso) {
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

async function ermittleHeutigeSpeiseplanId() {
    const todayIso = getTodayIso();
    const { data, error } = await supabase
        .from("Speiseplan")
        .select("id")
        .eq("Ausgabedatum", todayIso)
        .maybeSingle();

    if (error) {
        return null;
    }

    return data?.id ?? null;
}

async function speichereFreieEssenInDb(delta) {
    const todayIso = getTodayIso();
    const total = numberFromAny(delta.Studierende) + numberFromAny(delta.Bedienstete) + numberFromAny(delta.Gaeste);
    if (total <= 0) {
        return;
    }

    const speiseplanId = await ermittleHeutigeSpeiseplanId();
    const payload = {
        datum: todayIso,
        anzahl: -total
    };
    if (speiseplanId !== null) {
        payload.speiseplan_id = speiseplanId;
    }

    const { error } = await supabase.from("FreieEssen").insert([payload]);
    if (error) {
        throw new Error(error.message || "FreieEssen konnte nicht gespeichert werden.");
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
    if (zoneCCardGast) zoneCCardGast.textContent = `${gast}x Gaeste`;
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
        return;
    }

    if (heutigesGerichtName) heutigesGerichtName.textContent = gericht.Gerichtname || "Unbenanntes Gericht";
    if (heutigesPreisStud) heutigesPreisStud.textContent = toEuroText(gericht.PreisStudierende);
    if (heutigesPreisBed) heutigesPreisBed.textContent = toEuroText(gericht.PreisBedienstet);
    if (heutigesPreisGast) heutigesPreisGast.textContent = toEuroText(gericht.PreisGast);
    if (heutigesAllergene) heutigesAllergene.textContent = gericht.Allergene || "keine Angabe";
    if (heutigesGerichtBild) {
        heutigesGerichtBild.src = gericht.image_url || "../img/pasta.jpg";
        heutigesGerichtBild.alt = gericht.Gerichtname || "Heutiges Gericht";
    }
}

async function ladeHeutigesGericht() {
    const todayIso = getTodayIso();
    const { data, error } = await supabase
        .from("Speiseplan")
        .select("Gerichtname, Allergene, PreisStudierende, PreisBedienstet, PreisGast, image_url")
        .eq("Ausgabedatum", todayIso)
        .maybeSingle();

    if (error) {
        renderHeutigesGericht(null);
        return;
    }

    renderHeutigesGericht(data || null);
}

async function ladeHeutigeBestellungen() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = toIsoDate(today);
    const todayGerman = toGermanNumericDate(today);

    const { data, error } = await supabase
        .from("Bestellungen")
        .select("id, auth_user_id, email, gericht_name, kategorie, bestell_datum")
        .or(`bestell_datum.eq.${todayIso},bestell_datum.eq.${todayGerman}`);

    if (error) {
        throw new Error(error.message || "Heutige Bestellungen konnten nicht geladen werden.");
    }

    return (data || []).filter(function (row) {
        return normalizeBestellDatum(row.bestell_datum) === todayIso;
    });
}

async function ladeVorschauNaechste5Tage() {
    if (!vorschauListe) {
        return;
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const tage = [];

    for (let i = 1; i <= 5; i += 1) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        tage.push({
            iso: toIsoDate(date),
            label: toGermanDateLabel(date)
        });
    }

    const isoDates = tage.map(function (item) {
        return item.iso;
    });

    const [speiseplanRes, bestellungenRes] = await Promise.all([
        supabase
            .from("Speiseplan")
            .select("Gerichtname, image_url, Ausgabedatum")
            .in("Ausgabedatum", isoDates),
        supabase
            .from("Bestellungen")
            .select("bestell_datum, kategorie")
            .in("bestell_datum", isoDates)
    ]);

    if (speiseplanRes.error || bestellungenRes.error) {
        vorschauListe.innerHTML = "<p>Vorschau konnte nicht geladen werden.</p>";
        return;
    }

    const gerichtByDate = new Map();
    (speiseplanRes.data || []).forEach(function (row) {
        gerichtByDate.set(String(row.Ausgabedatum), row);
    });

    const countsByDate = new Map();
    (bestellungenRes.data || []).forEach(function (row) {
        const iso = normalizeBestellDatum(row.bestell_datum);
        if (!iso) {
            return;
        }

        if (!countsByDate.has(iso)) {
            countsByDate.set(iso, emptyCategoryCounts());
        }

        const counts = countsByDate.get(iso);
        const key = normalizeKategorie(row.kategorie);
        counts[key] = (counts[key] || 0) + 1;
    });

    vorschauListe.innerHTML = "";
    tage.forEach(function (item) {
        const gericht = gerichtByDate.get(item.iso);
        const counts = countsByDate.get(item.iso) || emptyCategoryCounts();
        const total = (counts.Studierende || 0) + (counts.Bedienstete || 0) + (counts.Gaeste || 0);

        const article = document.createElement("article");
        article.className = "vorschau-item";
        article.innerHTML = `
            <img src="${gericht?.image_url || "../img/pasta.jpg"}" alt="${item.label} Gericht">
            <div>
                <h4>${item.label}</h4>
                <p>${gericht?.Gerichtname || "Noch kein Gericht eingetragen"}</p>
                <p class="vorschau-total">Bestellungen gesamt: ${total}</p>
                <p class="vorschau-detail">Stud: ${counts.Studierende || 0} | Bed: ${counts.Bedienstete || 0} | Gast: ${counts.Gaeste || 0} | Frei: 0</p>
            </div>
        `;

        vorschauListe.appendChild(article);
    });
}

function scanRefAusEingabe(rawInput) {
    const raw = String(rawInput || "").trim();
    if (!raw) {
        return null;
    }

    if (raw.startsWith("mensa://")) {
        try {
            const parsed = new URL(raw);
            const userId = (parsed.searchParams.get("user_id") || "").trim();
            if (userId) {
                return { type: "user_id", value: userId };
            }
        } catch (_error) {
            return null;
        }
    }

    const match = raw.match(/user_id=([^&]+)/i);
    if (match && match[1]) {
        return { type: "user_id", value: decodeURIComponent(match[1]) };
    }

    if (raw.includes("@")) {
        return { type: "email", value: raw };
    }

    return { type: "user_id", value: raw };
}

function fillScanCardFromRows(rows) {
    const counts = countRowsByCategory(rows);
    const dishName = rows[0]?.gericht_name || "Bestellung";

    if (zoneCCardDate) zoneCCardDate.textContent = toGermanDateLabel(new Date());
    if (zoneCCardDish) zoneCCardDish.textContent = dishName;

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
    const todayGerman = toGermanNumericDate(new Date());

    let isoQuery = supabase
        .from("Bestellungen")
        .select("id, auth_user_id, email, gericht_name, kategorie, bestell_datum")
        .eq("bestell_datum", todayIso);

    let germanQuery = supabase
        .from("Bestellungen")
        .select("id, auth_user_id, email, gericht_name, kategorie, bestell_datum")
        .eq("bestell_datum", todayGerman);

    if (scanRef.type === "user_id") {
        isoQuery = isoQuery.eq("auth_user_id", scanRef.value);
        germanQuery = germanQuery.eq("auth_user_id", scanRef.value);
    } else {
        isoQuery = isoQuery.ilike("email", scanRef.value);
        germanQuery = germanQuery.ilike("email", scanRef.value);
    }

    const [isoRes, germanRes] = await Promise.all([isoQuery, germanQuery]);

    if (isoRes.error || germanRes.error) {
        throw new Error((isoRes.error || germanRes.error)?.message || "Bestellung konnte nicht geladen werden.");
    }

    const merged = [...(isoRes.data || []), ...(germanRes.data || [])];
    const byId = new Map();

    merged.forEach(function (row) {
        byId.set(String(row.id), row);
    });

    return Array.from(byId.values());
}

async function reloadOverview() {
    let freie = loadFreeMealState();
    try {
        freie = await ladeFreieEssenAusDb();
    } catch (error) {
        console.warn("FreieEssen-DB-Fallback aktiv:", error.message || error);
    }

    // Keep local cache aligned, even if DB is source of truth.
    saveFreeMealState(freie);

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
        console.error(error);
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
        .delete()
        .in("id", idsToDelete);

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
            setCount(counter, getCount(counter) + 1);
        });
    }

    if (minusBtn && counter) {
        minusBtn.addEventListener("click", function () {
            setCount(counter, getCount(counter) - 1);
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
                setScanState("QR-Inhalt konnte nicht gelesen werden.", "scan-status-error");
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
            fillScanCardFromRows(rows);
            if (zoneCStatus) {
                zoneCStatus.textContent = "Bestellung gefunden";
            }
            setScanState("Scan erfolgreich. Bestellung geladen.", "scan-status-success");
        } catch (error) {
            console.error(error);
            setScanState("Scan fehlgeschlagen: " + (error.message || "Unbekannter Fehler"), "scan-status-error");
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
            console.error(error);
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
        if (zoneCFreeFeedback) {
            zoneCFreeFeedback.classList.add("is-hidden");
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
            const state = loadFreeMealState();
            state.Gaeste = Math.max(0, (state.Gaeste || 0) - gesamt);
            saveFreeMealState(state);
            console.warn("FreieEssen nur lokal gespeichert:", error.message || error);
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
            "Freies Essen verbucht - Studierende: " + stud + ", Bedienstete: " + bed + ", Gaeste: " + gast + " (Gesamt: " + gesamt + ")",
            "free-feedback-success"
        );

        resetFreeCounts();
        zoneCFreeSaveBtn.disabled = false;
    });
}

updateMainPickupButton();
hideZoneCResult();
ladeDashboard();
