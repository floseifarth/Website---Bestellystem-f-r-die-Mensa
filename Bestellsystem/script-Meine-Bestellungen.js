import { supabase } from "./supabaseClient.js";

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const STANDARD_KATEGORIEN = ["Studierende", "Bedienstete", "Gäste"];
const MAX_GERICHTE_PRO_TAG = 3;

function mappeAboNutzertypZuKategorie(nutzertyp) {
    const typ = String(nutzertyp || "").trim().toLowerCase();
    if (typ === "externe" || typ === "gäste" || typ === "gaeste") return "Gäste";
    if (typ === "bedienstete") return "Bedienstete";
    return "Studierende";
}

function ermittleAboQuelleAusRow(row) {
    if (!row || typeof row !== "object") return null;

    const boolKeys = ["is_abo", "ist_abo", "via_abo", "from_abo", "automatisch"];
    for (const key of boolKeys) {
        if (Object.prototype.hasOwnProperty.call(row, key)) {
            return Boolean(row[key]);
        }
    }

    const stringKeys = ["quelle", "source", "bestellquelle", "order_source", "origin"];
    for (const key of stringKeys) {
        if (Object.prototype.hasOwnProperty.call(row, key) && row[key] != null) {
            const value = String(row[key]).trim().toLowerCase();
            if (["abo", "bestellabo", "auto", "automatic", "automatisch"].includes(value)) {
                return true;
            }
            if (["manuell", "manual", "user"].includes(value)) {
                return false;
            }
        }
    }

    return null;
}

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
function toEuroText(priceValue) {
    if (priceValue === null || priceValue === undefined || priceValue === "") {
        return "-";
    }
    if (typeof priceValue === "number") {
        return priceValue.toFixed(2).replace(".", ",") + " €";
    }
    if (typeof priceValue === "string") {
        return priceValue.includes("€") ? priceValue : `${priceValue} €`;
    }
    return String(priceValue);
}

function toIsoDateFromBestellDatum(bestellDatum) {
    const dateParts = String(bestellDatum || "").split(", ");
    const datumText = dateParts[1] || dateParts[0] || "";
    const isoMatch = datumText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

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
        return null;
    }

    const tag = textMatch[1].padStart(2, "0");
    const monat = monate[textMatch[2]];
    const jahrRoh = textMatch[3];
    const jahr = jahrRoh.length === 2 ? `20${jahrRoh}` : jahrRoh;
    if (!monat) {
        return null;
    }

    return `${jahr}-${monat}-${tag}`;
}

function formatiereBestellDatumFuerAnzeige(bestellDatum) {
    const isoDatum = toIsoDateFromBestellDatum(bestellDatum);
    if (!isoDatum) {
        return String(bestellDatum || "");
    }

    const dateObj = new Date(`${isoDatum}T00:00:00`);
    if (Number.isNaN(dateObj.getTime())) {
        return String(bestellDatum || "");
    }

    const wochentag = WOCHENTAGE[dateObj.getDay()];
    const datumText = dateObj.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    });

    return `${wochentag}, ${datumText}`;
}

function ermittleIsoKalenderwoche(dateObj) {
    const date = new Date(dateObj);
    date.setHours(0, 0, 0, 0);

    const dayNum = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - dayNum + 3);

    const firstThursday = new Date(date.getFullYear(), 0, 4);
    const firstThursdayDayNum = (firstThursday.getDay() + 6) % 7;
    firstThursday.setDate(firstThursday.getDate() - firstThursdayDayNum + 3);

    const week = 1 + Math.round((date - firstThursday) / 604800000);
    return { year: date.getFullYear(), week };
}

function istInAktuellerOderNaechsterKalenderwoche(isoDate) {
    if (!isoDate) {
        return false;
    }

    const zielDatum = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(zielDatum.getTime())) {
        return false;
    }

    const heute = new Date();
    const naechsteWoche = new Date(heute);
    naechsteWoche.setDate(naechsteWoche.getDate() + 7);

    const kwZiel = ermittleIsoKalenderwoche(zielDatum);
    const kwHeute = ermittleIsoKalenderwoche(heute);
    const kwNaechste = ermittleIsoKalenderwoche(naechsteWoche);

    const istAktuelleWoche = kwZiel.year === kwHeute.year && kwZiel.week === kwHeute.week;
    const istNaechsteWoche = kwZiel.year === kwNaechste.year && kwZiel.week === kwNaechste.week;

    return istAktuelleWoche || istNaechsteWoche;
}

function parseGanzzahl(value) {
    const parsed = Number.parseInt(String(value ?? "0"), 10);
    return Number.isNaN(parsed) ? 0 : parsed;
}

async function gutschriftFreieEssenFuerDatum(isoDate, anzahl) {
    const credit = Math.max(0, parseGanzzahl(anzahl));
    if (!isoDate || credit <= 0) {
        return;
    }

    const dateObj = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(dateObj.getTime())) {
        return;
    }

    const { data, error } = await supabase
        .from("FreieEssen")
        .select("id, anzahl, datum")
        .eq("datum", isoDate);

    if (error) {
        throw new Error("Freie Essen konnten nicht geladen werden: " + error.message);
    }

    const rows = data || [];
    const targetRow = rows[0];

    if (targetRow) {
        const currentCount = Math.max(0, parseGanzzahl(targetRow.anzahl));
        const { error: updateError } = await supabase
            .from("FreieEssen")
            .update({ anzahl: currentCount + credit })
            .eq("id", targetRow.id);

        if (updateError) {
            throw new Error("Freie Essen konnten nicht aktualisiert werden: " + updateError.message);
        }
        return;
    }

    const { error: insertError } = await supabase
        .from("FreieEssen")
        .insert([{ datum: isoDate, anzahl: credit }]);

    if (insertError) {
        throw new Error("Freie Essen konnten nicht erstellt werden: " + insertError.message);
    }
}

async function ladeFehlendeKategorienpreise(gruppe) {
    const ausgabeDatum = toIsoDateFromBestellDatum(gruppe.date);
    if (!ausgabeDatum || !gruppe.name) {
        return {};
    }

    const { data, error } = await supabase
        .from("Speiseplan")
        .select("PreisStudierende, PreisBedienstet, PreisGast")
        .eq("Gerichtname", gruppe.name)
        .eq("Ausgabedatum", ausgabeDatum)
        .maybeSingle();

    if (error || !data) {
        return {};
    }

    return {
        Studierende: toEuroText(data.PreisStudierende),
        Bedienstete: toEuroText(data.PreisBedienstet),
        Gäste: toEuroText(data.PreisGast)
    };
}

async function ladeBestellaboKonfiguration(user) {
    const { data, error } = await supabase
        .from("bestellabos")
        .select("aktiv, wochentage, nutzertyp")
        .eq("auth_user_id", user.id)
        .maybeSingle();

    if (error) {
        return null;
    }

    return data || null;
}

async function ladeBestellungenAusDb(user, aboKonfiguration) {
    const { data, error } = await supabase
        .from("Bestellungen")
        .select("*")
        .eq("auth_user_id", user.id)
        .order("created_at", { ascending: true });

    if (error) {
        throw new Error("Bestellungen konnten nicht geladen werden: " + error.message);
    }

    return (data || []).map(function (row) {
        const isoDatum = toIsoDateFromBestellDatum(row.bestell_datum || "");
        const explizitAbo = ermittleAboQuelleAusRow(row);
        let isAboBestellung = explizitAbo;

        if (isAboBestellung === null && aboKonfiguration?.aktiv && isoDatum) {
            const dateObj = new Date(`${isoDatum}T00:00:00`);
            const dow = Number.isNaN(dateObj.getTime()) ? null : dateObj.getDay();
            const aboWochentage = Array.isArray(aboKonfiguration.wochentage) ? aboKonfiguration.wochentage : [];
            const aboKategorie = mappeAboNutzertypZuKategorie(aboKonfiguration.nutzertyp);
            isAboBestellung = dow !== null && aboWochentage.includes(dow) && (row.kategorie || "Studierende") === aboKategorie;
        }

        return {
            id: row.id,
            date: formatiereBestellDatumFuerAnzeige(row.bestell_datum || ""),
            bestellIsoDate: isoDatum,
            name: row.gericht_name || "",
            category: row.kategorie || "Studierende",
            price: row.preis || "-",
            image: row.image_url || "",
            priceByCategory: {},
            status: String(row.status || "bestellt").trim().toLowerCase(),
            isAboBestellung: Boolean(isAboBestellung)
        };
    });
}

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
        .select("*")
        .ilike("email", email)
        .maybeSingle();

    const vorname = data?.vorname || data?.Vorname;
    if (!error && vorname) {
        return vorname;
    }

    return email.split("@")[0];
}


document.addEventListener("DOMContentLoaded", async function () {
    // Header-Datum initialisieren
    const heute = new Date();
    const wochentagHeute = WOCHENTAGE[heute.getDay()];
    const datumHeute = heute.toLocaleDateString("de-DE");

    const datumElement = document.getElementById("datum");
    if (datumElement) {
        datumElement.innerText = wochentagHeute + ", " + datumHeute;
    }

    // Aktuelle Supabase-Session abrufen (gespeichert nach dem Login).
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;

    // Kein eingeloggter User? Zurueck zur Anmeldeseite.
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    // Vorname aus Auth-Metadaten oder aus students ermitteln.
    const displayName = await ermittleVorname(user);

    // Namen rechts oben im Profil-Bereich einsetzen.
    const nameElement = document.getElementById("user-display-name");
    if (nameElement) {
        nameElement.textContent = displayName;
    }
    aktualisiereBestellstatusHeader(user.id);
    // Preis von Zahl in deutsches Format umwandeln (z.B. 4.10 → "4,10 €")
    function formatPrice(amount) {
        return amount.toFixed(2).replace(".", ",") + " €";
    }

    // Preis aus Text in Zahl umwandeln (z.B. "4,10 €" → 4.1)
    function parsePrice(priceText) {
        const cleaned = priceText.replace(/[^\d,.-]/g, "");
        return Number(cleaned.replace(",", "."));
    }

    // Numerisches Datum umwandeln (z.B. "16.05.2026" → "16. Mai 2026")
    function formatDatum(datumStr) {
        const monate = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
        const match = datumStr.match(/^(\d{1,2})\.(\d{2})\.(\d{4})$/);
        if (!match) return datumStr;
        return `${match[1].padStart(2, '0')}. ${monate[parseInt(match[2], 10) - 1]} ${match[3]}`;
    }

    //Pop-Up Fenster zur Bestätigung der Stornierung
    function StornierungMitEigenemModal(frage) {
        return new Promise(function (resolve) {
            const overlay = document.createElement("div");
            overlay.className = "modal-overlay";

            const dialog = document.createElement("div");
            dialog.className = "modal-dialog";
            dialog.innerHTML = `
                <p class="modal-text">${frage}</p>
                <div class="modal-actions">
                    <button type="button" class="modal-nein">Abbrechen</button>
                    <button type="button" class="modal-ja">Ja, stornieren</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            dialog.querySelector(".modal-nein").addEventListener("click", function () {
                overlay.remove();
                resolve(false);
            });

            dialog.querySelector(".modal-ja").addEventListener("click", function () {
                overlay.remove();
                resolve(true);
            });
        });
    }

    // Bestellliste im HTML und gespeicherte Bestellungen aus der DB laden
    const orderList = document.getElementById("order-list-open") || document.getElementById("order-list");
    let bestellungen = [];

    function zaehleBestellungenAnTagOhneIds(isoDate, idsZumAusschliessen) {
        if (!isoDate) {
            return 0;
        }

        const ausschluss = new Set(idsZumAusschliessen || []);
        return bestellungen.filter(function (item) {
            return item.status === "bestellt" && item.bestellIsoDate === isoDate && !ausschluss.has(item.id);
        }).length;
    }

    function zaehleKategorien(countsObjekt) {
        return Object.values(countsObjekt || {}).reduce(function (summe, anzahl) {
            return summe + (anzahl || 0);
        }, 0);
    }

    try {
        const aboKonfiguration = await ladeBestellaboKonfiguration(user);
        bestellungen = await ladeBestellungenAusDb(user, aboKonfiguration);
    } catch (error) {
        alert(error.message || "Bestellungen konnten nicht geladen werden.");
    }

    if (!orderList) return;

    const heuteIso = new Date().toISOString().split("T")[0];
    const laufendeBestellungen = bestellungen.filter(function (item) {
        const itemIsoDate = item.bestellIsoDate || toIsoDateFromBestellDatum(item.date) || "";
        const istZukunftOderHeute = itemIsoDate >= heuteIso;
        const istAktiv = item.status === "bestellt" || item.status === "abgeholt";
        return istZukunftOderHeute && istAktiv;
    });

    // Liste leeren bevor neu befüllt wird
    orderList.innerHTML = "";

    if (laufendeBestellungen.length === 0) {
        // Platzhalter anzeigen wenn keine Bestellungen vorhanden
        const emptyRow = document.createElement("div");
        emptyRow.className = "bestell-zeile";
        emptyRow.innerText = "Noch keine laufende Bestellung.";
        orderList.appendChild(emptyRow);
    } else {
        // Bestellungen nach Datum + Gericht gruppieren
        const gruppen = {};
        laufendeBestellungen.forEach(function (item) {
            const key = `${item.date}||${item.name}`;
            if (!gruppen[key]) {
                gruppen[key] = { ...item, kategorien: [], ids: [], priceByCategory: {} };
            }
            if (!gruppen[key].bestellIsoDate && item.bestellIsoDate) {
                gruppen[key].bestellIsoDate = item.bestellIsoDate;
            }
            if (item.priceByCategory) {
                Object.assign(gruppen[key].priceByCategory, item.priceByCategory);
            }
            gruppen[key].kategorien.push({ label: item.category || 'Studierende', price: item.price, status: item.status, isAboBestellung: item.isAboBestellung });
            gruppen[key].priceByCategory[item.category || "Studierende"] = item.price;
            if (item.id !== undefined && item.id !== null) {
                gruppen[key].ids.push(item.id);
            }
        });

        Object.values(gruppen).forEach(function (gruppe) {
            if (!gruppe.status && bestellungen.length > 0) {
                const matchingRow = bestellungen.find(function (item) {
                    return item.date === gruppe.date && item.name === gruppe.name;
                });
                if (matchingRow) {
                    gruppe.status = matchingRow.status;
                }
            }
        });

        const sortierteGruppen = Object.values(gruppen).sort(function (a, b) {
            const datumA = toIsoDateFromBestellDatum(a.date) || "9999-12-31";
            const datumB = toIsoDateFromBestellDatum(b.date) || "9999-12-31";

            if (datumA !== datumB) {
                return datumA.localeCompare(datumB);
            }

            return (a.name || "").localeCompare(b.name || "", "de");
        });

        sortierteGruppen.forEach(function (gruppe) {
            const dateParts = (gruppe.date || '').split(', ');
            const wochentag = dateParts[0] || '';
            const datumText = formatDatum(dateParts[1] || '');

            // Kategorien zählen und Preise summieren - auch Status berücksichtigen
            const counts = {};
            const aboCounts = {};
            const abgehoitCounts = {};
            let gruppenTotal = 0;
            let alleAbgeholt = true;
            gruppe.kategorien.forEach(function (k) {
                counts[k.label] = (counts[k.label] || 0) + 1;
                if (k.status === "abgeholt") {
                    abgehoitCounts[k.label] = (abgehoitCounts[k.label] || 0) + 1;
                } else {
                    alleAbgeholt = false;
                }
                if (k.isAboBestellung) {
                    aboCounts[k.label] = (aboCounts[k.label] || 0) + 1;
                }
                gruppenTotal += parsePrice(k.price);
            });
            console.log(`Gruppe ${gruppe.name}: alleAbgeholt=${alleAbgeholt}, kategorien=${gruppe.kategorien.map(k => `${k.label}:${k.status}`).join(", ")}`);

            const row = document.createElement("div");
            row.className = "speiseplan-eintrag";
            row.innerHTML = `
                <div class="speiseplan-links">
                    <h3>${wochentag}</h3>
                    <p>${datumText}</p>
                </div>
                <div class="speiseplan-mitte">
                    <img src="${gruppe.image || ''}" class="gericht-bild" alt="">
                    <p>Tagesangebot</p>
                    <h3>
                        ${gruppe.name || ''}
                        ${alleAbgeholt ? '<span class="status-badge status-abgeholt">✓ Abgeholt</span>' : ''}
                    </h3>
                    <div class="preise">
                        <div class="preise-liste">
                            ${Object.entries(counts).map(function ([label, n]) {
                const aboAnteil = aboCounts[label] || 0;
                const aboText = aboAnteil > 0 ? ` <span class="abo-anteil">(${aboAnteil} Abo)</span>` : "";
                return `<p class="preise-zeile">${n}x ${label}${aboText}</p>`;
            }).join("")}
                        </div>
                        <p>Gesamt: <strong>${formatPrice(gruppenTotal)}</strong></p>
                    </div>
                </div>
                <div class="speiseplan-rechts">
                    <button type="button" class="vorbestell-btn remove-button" ${alleAbgeholt ? "disabled" : ""}>Stornieren</button>
    
                    <button type="button" class="vorbestell-btn edit-button" ${alleAbgeholt ? "disabled" : ""}>Bearbeiten</button>
                </div>
                <p class="inline-edit-hinweis-wide" hidden></p>`;
            // Stornieren-Button mit Bestätigungs-Popup verknüpfen
            row.querySelector(".remove-button").addEventListener("click", async function () {
                const bestaetigt = await StornierungMitEigenemModal("Möchtest du diese Bestellung wirklich stornieren?");
                if (!bestaetigt) {
                    return;
                }

                const idsToDelete = gruppe.ids || [];
                if (idsToDelete.length === 0) {
                    alert("Diese Bestellung konnte nicht eindeutig zugeordnet werden.");
                    return;
                }

                const { error: deleteError } = await supabase
                    .from("Bestellungen")
                    .delete()
                    .in("id", idsToDelete)
                    .eq("auth_user_id", user.id);

                if (deleteError) {
                    alert("Stornieren fehlgeschlagen: " + deleteError.message);
                    return;
                }

                try {
                    const stornierteAnzahl = idsToDelete.length;
                    const isoDate = gruppe.bestellIsoDate || toIsoDateFromBestellDatum(gruppe.date);
                    await gutschriftFreieEssenFuerDatum(isoDate, stornierteAnzahl);
                } catch (freieEssenError) {
                    alert("Storno erfolgreich, aber Freie-Essen-Gutschrift fehlgeschlagen: " + freieEssenError.message);
                }

                location.reload();
            });
            // Bearbeiten-Button: Mengen direkt im Eintrag anpassen.
            row.querySelector(".edit-button").addEventListener("click", async function () {
                const preiseContainer = row.querySelector(".preise");
                const sperrfristHinweis = row.querySelector(".inline-edit-hinweis-wide");
                if (!preiseContainer) {
                    return;
                }

                const bestehendeControls = preiseContainer.querySelector(".inline-edit-controls");
                if (bestehendeControls) {
                    return;
                }

                const fehlendePreise = await ladeFehlendeKategorienpreise(gruppe);
                if (Object.keys(fehlendePreise).length > 0) {
                    gruppe.priceByCategory = {
                        ...(gruppe.priceByCategory || {}),
                        ...fehlendePreise
                    };
                }

                const countsEdit = {};
                const pricesByLabel = {};
                STANDARD_KATEGORIEN.forEach(function (label) {
                    countsEdit[label] = 0;

                    const gespeicherterPreis = gruppe.priceByCategory?.[label];
                    if (gespeicherterPreis && gespeicherterPreis !== "-") {
                        pricesByLabel[label] = gespeicherterPreis;
                    }
                });

                gruppe.kategorien.forEach(function (k) {
                    const label = k.label || "Studierende";
                    countsEdit[label] = (countsEdit[label] || 0) + 1;
                    if (!pricesByLabel[label] && k.price && k.price !== "-") {
                        pricesByLabel[label] = k.price;
                    }
                });

                const renderPreise = function () {
                    let gruppenTotalNeu = 0;
                    Object.entries(countsEdit).forEach(function ([label, n]) {
                        if (n > 0) {
                            gruppenTotalNeu += parsePrice(pricesByLabel[label]) * n;
                        }
                    });

                    const isoDate = gruppe.bestellIsoDate || toIsoDateFromBestellDatum(gruppe.date);
                    const anzahlAnDiesemTagOhneGruppe = zaehleBestellungenAnTagOhneIds(isoDate, gruppe.ids || []);
                    const anzahlInDieserGruppe = zaehleKategorien(countsEdit);
                    const sperrfristAktiv = istInAktuellerOderNaechsterKalenderwoche(isoDate);
                    const plusIstSperren = sperrfristAktiv || anzahlAnDiesemTagOhneGruppe + anzahlInDieserGruppe >= MAX_GERICHTE_PRO_TAG;

                    if (sperrfristHinweis) {
                        if (sperrfristAktiv) {
                            sperrfristHinweis.textContent = "Bestellungen für diese und die kommende Kalenderwoche können nicht mehr erhöht werden.";
                            sperrfristHinweis.hidden = false;
                        } else {
                            sperrfristHinweis.hidden = true;
                            sperrfristHinweis.textContent = "";
                        }
                    }

                    const kategorieZeilen = STANDARD_KATEGORIEN
                        .map(function (label) {
                            const n = countsEdit[label] || 0;
                            const preisVerfuegbar = Boolean(pricesByLabel[label] && pricesByLabel[label] !== "-");

                            return `
                                <div class="inline-edit-row" data-label="${label}">
                                    <p class="inline-edit-label">${n}x ${label}</p>
                                    <div class="inline-edit-actions">
                                        <button type="button" class="vorbestell-btn inline-action-btn inline-minus" ${(preisVerfuegbar && n > 0) ? "" : "disabled"}>-</button>
                                        <button type="button" class="vorbestell-btn inline-action-btn inline-plus" ${preisVerfuegbar && !plusIstSperren ? "" : "disabled"}>+</button>
                                    </div>
                                </div>
                            `;
                        })
                        .join("");

                    preiseContainer.innerHTML = `
                        <div class="preise-liste inline-edit-controls">${kategorieZeilen}</div>
                        <p>Gesamt: <strong>${formatPrice(gruppenTotalNeu)}</strong></p>
                        <div class="inline-edit-footer">
                            <button type="button" class="vorbestell-btn inline-save">Speichern</button>
                            <button type="button" class="vorbestell-btn inline-cancel">Abbrechen</button>
                        </div>
                    `;

                    attachInlineListeners();
                };

                const attachInlineListeners = function () {
                    preiseContainer.querySelectorAll(".inline-edit-row").forEach(function (editRow) {
                        const label = editRow.getAttribute("data-label") || "";
                        const minusBtn = editRow.querySelector(".inline-minus");
                        const plusBtn = editRow.querySelector(".inline-plus");

                        if (minusBtn && !minusBtn.disabled) {
                            minusBtn.addEventListener("click", function () {
                                countsEdit[label] = Math.max(0, (countsEdit[label] || 0) - 1);
                                renderPreise();
                            });
                        }

                        if (plusBtn && !plusBtn.disabled) {
                            plusBtn.addEventListener("click", function () {
                                countsEdit[label] = (countsEdit[label] || 0) + 1;
                                renderPreise();
                            });
                        }
                    });

                    preiseContainer.querySelector(".inline-cancel").addEventListener("click", function () {
                        location.reload();
                    });

                    preiseContainer.querySelector(".inline-save").addEventListener("click", async function () {
                        const neueEintraege = [];
                        Object.entries(countsEdit).forEach(function ([label, n]) {
                            for (let i = 0; i < n; i += 1) {
                                neueEintraege.push({
                                    auth_user_id: user.id,
                                    email: user.email || "",
                                    gericht_name: gruppe.name,
                                    bestell_datum: gruppe.bestellIsoDate || toIsoDateFromBestellDatum(gruppe.date),
                                    kategorie: label,
                                    preis: pricesByLabel[label],
                                    image_url: gruppe.image || "",
                                    status: "bestellt"
                                });
                            }
                        });

                        const idsToReplace = gruppe.ids || [];
                        if (idsToReplace.length === 0) {
                            alert("Diese Bestellung konnte nicht eindeutig zugeordnet werden.");
                            return;
                        }

                        const isoDate = gruppe.bestellIsoDate || toIsoDateFromBestellDatum(gruppe.date);
                        const anzahlAnDiesemTagOhneGruppe = zaehleBestellungenAnTagOhneIds(isoDate, idsToReplace);
                        if (anzahlAnDiesemTagOhneGruppe + neueEintraege.length > MAX_GERICHTE_PRO_TAG) {
                            alert(`Maximal ${MAX_GERICHTE_PRO_TAG} Gerichte pro Tag erlaubt.`);
                            return;
                        }

                        const { error: deleteError } = await supabase
                            .from("Bestellungen")
                            .delete()
                            .in("id", idsToReplace)
                            .eq("auth_user_id", user.id);

                        if (deleteError) {
                            alert("Bearbeiten fehlgeschlagen: " + deleteError.message);
                            return;
                        }

                        if (neueEintraege.length > 0) {
                            const { error: insertError } = await supabase
                                .from("Bestellungen")
                                .insert(neueEintraege);

                            if (insertError) {
                                alert("Bearbeiten fehlgeschlagen: " + insertError.message);
                                return;
                            }
                        }

                        const vorherAnzahl = idsToReplace.length;
                        const nachherAnzahl = neueEintraege.length;
                        const freiDifferenz = vorherAnzahl - nachherAnzahl;

                        if (freiDifferenz > 0) {
                            try {
                                await gutschriftFreieEssenFuerDatum(isoDate, freiDifferenz);
                            } catch (freieEssenError) {
                                alert("Bearbeitung gespeichert, aber Freie-Essen-Gutschrift fehlgeschlagen: " + freieEssenError.message);
                            }
                        }

                        location.reload();
                    });
                };

                renderPreise();
            });

            orderList.appendChild(row);
        });
    }
});
