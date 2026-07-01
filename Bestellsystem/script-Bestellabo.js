import { supabase } from "./supabaseClient.js";
import { loadCurrentUserContext } from "./userContext.js";

// ─── Konstanten ──────────────────────────────────────────────────────────────

const WOCHENTAGE_KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const BADGE_CACHE_KEY = "mensa-badge-status-v1";
const BADGE_CACHE_TTL_MS = 90 * 1000; // 90 Sekunden

// ─── Cache-Funktionen ────────────────────────────────────────────────────────

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

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function pad(n) {
    return String(n).padStart(2, "0");
}

function isoToDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function todayIso() {
    return new Date().toISOString().split("T")[0];
}

/** Montag bis Freitag der übernächsten Woche */
function getUebernachsteWoche() {
    const today = new Date();
    const dow = today.getDay();
    const daysToMonday = dow === 0 ? 1 : 8 - dow;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysToMonday + 7);
    return Array.from({ length: 5 }, (_, i) => {
        const d = new Date(nextMonday);
        d.setDate(nextMonday.getDate() + i);
        return d.toISOString().split("T")[0];
    });
}

function preisToNumber(preis) {
    return parseFloat(String(preis || "0").replace("€", "").replace(",", ".").trim()) || 0;
}

/**
 * Gibt true zurück wenn das Gericht die Abo-Kriterien erfüllt
 */
function matchesAbo(abo, meal) {
    if (abo.ausgeschlossene_allergene.length > 0 && meal.Allergene) {
        const mealAllergene = meal.Allergene.split(",").map(a => a.trim().toLowerCase());
        for (const a of abo.ausgeschlossene_allergene) {
            if (mealAllergene.includes(a.toLowerCase())) return false;
        }
    }
    if (abo.vegan && meal.ernaehrungstyp !== "vegan") return false;
    if (abo.vegetarisch && meal.ernaehrungstyp === "nicht vegetarisch") return false;
    return true;
}

// ─── Badge-Funktion ──────────────────────────────────────────────────────────

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

// ─── Zustand ─────────────────────────────────────────────────────────────────

let abo = {
    aktiv: false,
    wochentage: [],
    ausgeschlossene_allergene: [],
    vegetarisch: false,
    vegan: false,
    nutzertyp: "Studierende",
};

let currentEmail = null;
let currentAuthUserId = null;
let isSaving = false;
let isTogglingAktiv = false;

// ─── Upsert-Logik ────────────────────────────────────────────────────────────

async function doUpsert(aboData) {
    // Versuch 1: RPC
    const { error: rpcErr } = await supabase.rpc("upsert_bestellabo", {
        p_email: currentEmail,
        p_auth_user_id: currentAuthUserId,
        p_aktiv: aboData.aktiv,
        p_wochentage: aboData.wochentage,
        p_ausgeschlossene_allergene: aboData.ausgeschlossene_allergene,
        p_vegetarisch: aboData.vegetarisch,
        p_vegan: aboData.vegan,
        p_nutzertyp: aboData.nutzertyp,
    });
    if (!rpcErr) return null;

    // Versuch 2: direktes Upsert
    const { error: upsertErr } = await supabase
        .from("bestellabos")
        .upsert({
            email: currentEmail,
            auth_user_id: currentAuthUserId,
            aktiv: aboData.aktiv,
            wochentage: aboData.wochentage,
            ausgeschlossene_allergene: aboData.ausgeschlossene_allergene,
            vegetarisch: aboData.vegetarisch,
            vegan: aboData.vegan,
            nutzertyp: aboData.nutzertyp,
        }, { onConflict: "email" });

    return upsertErr ? `RPC: ${rpcErr.message} | Direkt: ${upsertErr.message}` : null;
}

// ─── Auto-Apply ──────────────────────────────────────────────────────────────

async function autoApplyAbo(aboData, forEmail) {
    if (!aboData.aktiv || aboData.wochentage.length === 0) return;

    const wochentage = getUebernachsteWoche();
    if (wochentage.length === 0) return;

    const { data: speiseplan } = await supabase
        .from("Speiseplan")
        .select("*")
        .in("Ausgabedatum", wochentage);

    const rows = [];
    for (const meal of (speiseplan || [])) {
        const dow = isoToDate(meal.Ausgabedatum).getDay();
        if (!aboData.wochentage.includes(dow)) continue;
        if (!matchesAbo(aboData, meal)) continue;

        // Bereits bestellt?
        const { data: existing } = await supabase
            .from("Bestellungen")
            .select("id")
            .eq("email", forEmail)
            .eq("bestell_datum", meal.Ausgabedatum)
            .limit(1);
        if (existing && existing.length > 0) continue;

        const kategorie = aboData.nutzertyp === "Externe" ? "Gäste" : aboData.nutzertyp;
        const preis = aboData.nutzertyp === "Studierende"
            ? meal.PreisStudierende
            : aboData.nutzertyp === "Bedienstete"
                ? meal.PreisBedienstet
                : meal.PreisGast;

        rows.push({
            email: forEmail,
            gericht_name: meal.Gerichtname,
            bestell_datum: meal.Ausgabedatum,
            kategorie,
            preis,
            image_url: meal.image_url,
            auth_user_id: currentAuthUserId,
            status: "bestellt",
        });
    }

    if (rows.length > 0) {
        const { error } = await supabase.from("Bestellungen").insert(rows);
        if (!error) {
            const tage = [...new Set(rows.map(r =>
                WOCHENTAGE_KURZ[isoToDate(r.bestell_datum).getDay()] || "?"
            ))].join(" · ");
            zeigeAutoOrderBadge(`Automatisch bestellt für übernächste Woche: ${tage} (${rows.length} Bestellung${rows.length !== 1 ? "en" : ""})`);
        }
    }
}

// ─── UI-Hilfsfunktionen ──────────────────────────────────────────────────────

function zeigeAutoOrderBadge(text) {
    const badge = document.getElementById("auto-order-badge");
    const textEl = document.getElementById("auto-order-text");
    if (!badge || !textEl) return;

    // Sicherheitsnetz: Niemals anzeigen, wenn das Abo nicht aktiv ist.
    if (!abo.aktiv) {
        badge.hidden = true;
        badge.style.display = "none";
        return;
    }

    textEl.textContent = text;
    badge.hidden = false;
    badge.style.display = "flex";
}

function aktualisiereAutoOrderBadge() {
    const badge = document.getElementById("auto-order-badge");
    const textEl = document.getElementById("auto-order-text");
    if (!badge || !textEl) return;

    if (!abo.aktiv) {
        badge.hidden = true;
        badge.style.display = "none";
        return;
    }

    const tage = [...abo.wochentage]
        .sort((a, b) => a - b)
        .map(dow => WOCHENTAGE_KURZ[dow] || "?")
        .join(" · ");

    textEl.textContent = `Automatisch bestellt für übernächste Woche: (${tage || "-"}).`;
    badge.hidden = false;
    badge.style.display = "flex";
}

function zeigeNachricht(text, isError) {
    const el = document.getElementById("abo-message");
    if (!el) return;
    el.textContent = text;
    el.className = "abo-message-box " + (isError ? "abo-message-error" : "abo-message-success");
    el.hidden = false;
    if (!isError) {
        setTimeout(() => { el.hidden = true; }, 4000);
    }
}

function aktualisiereStatusChip() {
    const chip = document.getElementById("abo-status-chip");
    if (!chip) return;
    if (abo.aktiv) {
        chip.textContent = "Abo läuft – Bestellungen werden automatisch jede Woche aufgegeben.";
        chip.className = "abo-status-chip abo-status-aktiv";
    } else {
        chip.textContent = "Abo ist deaktiviert – keine automatischen Bestellungen.";
        chip.className = "abo-status-chip abo-status-inaktiv";
    }
}

function renderWochentage() {
    document.querySelectorAll("#wochentage-row .tag-chip").forEach(btn => {
        const dow = parseInt(btn.dataset.dow, 10);
        btn.classList.toggle("tag-chip-aktiv", abo.wochentage.includes(dow));
    });
    aktualisiereAutoOrderBadge();
}

function renderAllergene() {
    document.querySelectorAll("#allergen-grid .allergen-chip").forEach(btn => {
        const allergen = btn.dataset.allergen;
        btn.classList.toggle("allergen-chip-aktiv", abo.ausgeschlossene_allergene.includes(allergen));
    });
}

function renderNutzertyp() {
    document.querySelectorAll("#nutzertyp-row .tag-chip").forEach(btn => {
        btn.classList.toggle("tag-chip-aktiv", btn.dataset.typ === abo.nutzertyp);
    });
}

function renderFormular() {
    renderWochentage();
    renderAllergene();
    renderNutzertyp();
    document.getElementById("switch-vegetarisch").checked = abo.vegetarisch;
    document.getElementById("switch-vegan").checked = abo.vegan;
    document.getElementById("switch-aktiv").checked = abo.aktiv;
    aktualisiereStatusChip();
    aktualisiereAutoOrderBadge();
}

// ─── Event-Handler ───────────────────────────────────────────────────────────

function initEventListeners() {
    console.log("🔵 initEventListeners START");

    // Wochentag-Chips
    const wochentageButtons = document.querySelectorAll("#wochentage-row .tag-chip");
    console.log("📍 Wochentage-Buttons gefunden:", wochentageButtons.length);
    wochentageButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            console.log("✅ Wochentag geklickt:", btn.dataset.dow);
            const dow = parseInt(btn.dataset.dow, 10);
            if (abo.wochentage.includes(dow)) {
                abo.wochentage = abo.wochentage.filter(d => d !== dow);
            } else {
                abo.wochentage = [...abo.wochentage, dow].sort();
            }
            renderWochentage();
        });
    });

    // Allergen-Chips
    document.querySelectorAll("#allergen-grid .allergen-chip").forEach(btn => {
        btn.addEventListener("click", () => {
            const allergen = btn.dataset.allergen;
            if (abo.ausgeschlossene_allergene.includes(allergen)) {
                abo.ausgeschlossene_allergene = abo.ausgeschlossene_allergene.filter(a => a !== allergen);
            } else {
                abo.ausgeschlossene_allergene = [...abo.ausgeschlossene_allergene, allergen];
            }
            renderAllergene();
        });
    });

    // Nutzertyp-Chips
    document.querySelectorAll("#nutzertyp-row .tag-chip").forEach(btn => {
        btn.addEventListener("click", () => {
            abo.nutzertyp = btn.dataset.typ;
            renderNutzertyp();
        });
    });

    // Vegetarisch / Vegan Switches
    document.getElementById("switch-vegetarisch").addEventListener("change", e => {
        abo.vegetarisch = e.target.checked;
    });
    document.getElementById("switch-vegan").addEventListener("change", e => {
        abo.vegan = e.target.checked;
    });

    // Einstellungen speichern
    document.getElementById("btn-speichern").addEventListener("click", async () => {
        if (isSaving) return;
        isSaving = true;
        const btn = document.getElementById("btn-speichern");
        btn.disabled = true;
        btn.textContent = "Wird gespeichert …";

        const err = await doUpsert(abo);
        isSaving = false;
        btn.disabled = false;
        btn.textContent = "Einstellungen speichern";

        if (err) {
            zeigeNachricht("Fehler: " + err, true);
        } else {
            const badge = document.getElementById("save-badge");
            badge.hidden = false;
            setTimeout(() => { badge.hidden = true; }, 2500);
            document.getElementById("abo-message").hidden = true;
            if (abo.aktiv && currentEmail && abo.wochentage.length > 0) {
                await autoApplyAbo(abo, currentEmail);
            }
        }
    });

    // Abo aktivieren / deaktivieren
    document.getElementById("switch-aktiv").addEventListener("change", async e => {
        if (isTogglingAktiv) {
            e.target.checked = abo.aktiv;
            return;
        }
        isTogglingAktiv = true;
        const newAktiv = e.target.checked;
        const prevAbo = { ...abo };
        abo.aktiv = newAktiv;
        aktualisiereStatusChip();

        const err = await doUpsert(abo);
        isTogglingAktiv = false;

        if (err) {
            abo.aktiv = prevAbo.aktiv;
            e.target.checked = prevAbo.aktiv;
            aktualisiereStatusChip();
            aktualisiereAutoOrderBadge();
            zeigeNachricht("Fehler beim Aktivieren: " + err, true);
        } else {
            document.getElementById("abo-message").hidden = true;
            aktualisiereAutoOrderBadge();
            if (newAktiv && currentEmail && abo.wochentage.length > 0) {
                await autoApplyAbo(abo, currentEmail);
            }
        }
    });

    // Anleitung ausklappen
    document.getElementById("btn-anleitung-toggle").addEventListener("click", () => {
        const inhalt = document.getElementById("anleitung-inhalt");
        const chevron = document.getElementById("chevron-anleitung");
        const btn = document.getElementById("btn-anleitung-toggle");
        const isOpen = !inhalt.hidden;
        inhalt.hidden = isOpen;
        chevron.textContent = isOpen ? "▼" : "▲";
        btn.setAttribute("aria-expanded", String(!isOpen));
    });

    console.log("🟢 initEventListeners COMPLETE - alle Elemente sind jetzt klickbar!");
}

// ─── Initialisierung ─────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    console.log("🔴 DOMContentLoaded: START");

    // 1. Header sofort laden
    const heute = new Date();
    const wochentag = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"][heute.getDay()];
    const datumEl = document.getElementById("datum");
    if (datumEl) {
        datumEl.textContent = wochentag + ", " + heute.toLocaleDateString("de-DE");
        console.log("✅ Datum angezeigt");
    }

    // 2. Formular anzeigen
    const loadingEl = document.getElementById("abo-loading");
    const formularEl = document.getElementById("abo-formular");
    if (loadingEl) loadingEl.hidden = true;
    if (formularEl) formularEl.hidden = false;
    console.log("✅ Formular sichtbar gemacht");

    // 3. Events und Render
    try {
        initEventListeners();
        renderFormular();
        console.log("✅ Events und Formular initialisiert");
    } catch (err) {
        console.error("❌ Fehler bei Initialisierung:", err);
    }

    // 4. Async Session-Laden (blockiert NICHT!)
    console.log("📡 Starte async Session-Laden...");
    loadCurrentUserContext()
        .then(userContext => {
            console.log("✅ userContext geladen:", userContext);

            const user = userContext.user;
            if (!user) {
                console.warn("⚠️ Kein User!");
                return null;
            }

            // User-Info anzeigen
            const nameEl = document.getElementById("user-display-name");
            if (nameEl) nameEl.textContent = userContext.displayName;

            currentEmail = userContext.email || user.email;
            currentAuthUserId = user.id;

            // Badge aktualisieren (async, blockiert nicht)
            aktualisiereBestellstatusHeader(user.id).catch(err => {
                console.error("❌ Badge-Fehler:", err);
            });

            // Abo-Daten laden
            console.log("📦 Lade Abo-Einstellungen...");
            return supabase
                .from("bestellabos")
                .select("*")
                .eq("email", currentEmail)
                .maybeSingle();
        })
        .then(result => {
            if (!result) {
                console.log("⚠️ Kein Abo-Ergebnis");
                return;
            }
            const { data, error } = result;
            if (error) {
                console.error("❌ DB-Fehler:", error);
                return;
            }
            if (data) {
                abo = {
                    aktiv: data.aktiv ?? false,
                    wochentage: data.wochentage ?? [],
                    ausgeschlossene_allergene: data.ausgeschlossene_allergene ?? [],
                    vegetarisch: data.vegetarisch ?? false,
                    vegan: data.vegan ?? false,
                    nutzertyp: data.nutzertyp ?? "Studierende",
                };
                console.log("✅ Abo-Daten geladen:", abo);
                renderFormular();

                // AutoApplyAbo wenn aktiviert
                if (abo.aktiv && abo.wochentage.length > 0 && currentEmail) {
                    console.log("🔄 Starte autoApplyAbo...");
                    autoApplyAbo(abo, currentEmail).catch(err => {
                        console.error("❌ AutoApplyAbo-Fehler:", err);
                    });
                }
            } else {
                console.log("✅ Keine Abo-Daten (neuer User)");
            }
        })
        .catch(err => {
            console.error("❌ Error in async chain:", err);
        });

    console.log("🟢 DOMContentLoaded: COMPLETE (async Teil läuft im Hintergrund)");
});
